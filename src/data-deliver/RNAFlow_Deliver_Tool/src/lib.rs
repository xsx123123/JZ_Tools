mod cloud;
mod config_manager;

use pyo3::prelude::*;
use std::path::{Path, PathBuf};
use std::fs::{self, File};
use std::io::{Read, Write};
use md5::{Context as Md5Context, Digest};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use config_manager::ConfigManager;

// --- 复用原有逻辑的辅助函数 ---
// (ProcessMode, process_file_internal, just_hash, copy_and_hash 保持不变)
#[derive(Clone, Copy)]
enum ProcessMode { Copy, Hardlink, Symlink }

impl From<&str> for ProcessMode {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "hardlink" => ProcessMode::Hardlink,
            "symlink" => ProcessMode::Symlink,
            _ => ProcessMode::Copy,
        }
    }
}

fn process_file_internal(src: &Path, output_dir: &Path, md5_file: bool, mode: ProcessMode, buf_size: usize) -> anyhow::Result<(u64, String)> {
    let file_name = src.file_name().ok_or_else(|| anyhow::anyhow!("Invalid filename"))?;
    let dest = output_dir.join(file_name);
    
    if let Some(parent) = dest.parent() {
        if !parent.exists() { fs::create_dir_all(parent)?; }
    }

    let (hash_digest, file_len) = match mode {
        ProcessMode::Copy => copy_and_hash(src, &dest, buf_size)?,
        ProcessMode::Hardlink => {
            let (h, len) = just_hash(src, buf_size)?;
            if dest.exists() { fs::remove_file(&dest)?; }
            fs::hard_link(src, &dest)?;
            (h, len)
        },
        ProcessMode::Symlink => {
            let (h, len) = just_hash(src, buf_size)?;
            if dest.exists() { fs::remove_file(&dest)?; }
            #[cfg(unix)]
            std::os::unix::fs::symlink(src, &dest)?;
            #[cfg(windows)]
            std::os::windows::fs::symlink_file(src, &dest)?;
            (h, len)
        }
    };

    let hash_str = format!("{:x}", hash_digest);
    if md5_file {
        let md5_path = format!("{}.md5", dest.display());
        fs::write(md5_path, format!("{}  {}\n", hash_str, file_name.to_string_lossy()))?;
    }
    Ok((file_len, hash_str))
}

fn just_hash(path: &Path, buffer_size: usize) -> anyhow::Result<(Digest, u64)> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let mut context = Md5Context::new();
    let mut buffer = vec![0; buffer_size]; 
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 { break; }
        context.consume(&buffer[..count]);
    }
    Ok((context.compute(), len))
}

fn copy_and_hash(src: &Path, dest: &Path, buffer_size: usize) -> anyhow::Result<(Digest, u64)> {
    let mut input = File::open(src)?;
    let len = input.metadata()?.len();
    let mut output = File::create(dest)?;
    let mut context = Md5Context::new();
    let mut buffer = vec![0; buffer_size];
    loop {
        let count = input.read(&mut buffer)?;
        if count == 0 { break; }
        context.consume(&buffer[..count]);
        output.write_all(&buffer[..count])?;
    }
    Ok((context.compute(), len))
}

// --- PyO3 接口定义 ---

#[pyfunction]
fn run_local_delivery(
    files: Vec<String>,
    output_dir: String,
    mode: String,
    threads: usize
) -> PyResult<(usize, usize, f64)> {
    let out_path = PathBuf::from(&output_dir);
    if !out_path.exists() { fs::create_dir_all(&out_path)?; }
    let process_mode = ProcessMode::from(mode.as_str());
    let buffer_size = 2 * 1024 * 1024;
    let _ = rayon::ThreadPoolBuilder::new().num_threads(threads).build_global();

    let success_count = AtomicUsize::new(0);
    let fail_count = AtomicUsize::new(0);
    let total_bytes = AtomicUsize::new(0);

    files.par_iter().for_each(|f| {
        let src_path = Path::new(f);
        match process_file_internal(src_path, &out_path, true, process_mode, buffer_size) {
            Ok((len, _)) => {
                success_count.fetch_add(1, Ordering::Relaxed);
                total_bytes.fetch_add(len as usize, Ordering::Relaxed);
            },
            Err(e) => {
                eprintln!("Rust Error processing {}: {}", f, e);
                fail_count.fetch_add(1, Ordering::Relaxed);
            }
        }
    });

    let s = success_count.load(Ordering::Relaxed);
    let f = fail_count.load(Ordering::Relaxed);
    let b = total_bytes.load(Ordering::Relaxed) as f64 / 1_000_000_000.0;
    Ok((s, f, b))
}

#[pyfunction]
fn run_cloud_delivery(
    files: Vec<String>,
    bucket: String,
    prefix: String,
    endpoint: String,
    region: String,
    ak: String,
    sk: String,
    project_id: String,
    task_num: usize,
    part_size: u64
) -> PyResult<(usize, usize, f64)> {
    
    // 创建 Tokio Runtime
    let rt = tokio::runtime::Runtime::new().unwrap();
    
    rt.block_on(async {
        // 初始化 Client
        let client = match cloud::create_client(&endpoint, &region, &ak, &sk) {
            Ok(c) => c,
            Err(e) => return Err(pyo3::exceptions::PyValueError::new_err(format!("Client Init Error: {}", e))),
        };

        let mut success = 0;
        let mut failed = 0;
        let mut total_bytes = 0_f64;

        // 这里为了简单，我们在 Rust 侧串行调度文件（每个文件的上传内部是并发的），
        // 或者也可以并发调度文件。鉴于 cloud::upload_and_set_meta 内部设计，我们串行调用它。
        let total_files = files.len();
        
        for (idx, f) in files.iter().enumerate() {
            let src_path = Path::new(f);
            let file_name = src_path.file_name().unwrap().to_string_lossy();
            let object_key = format!("{}{}", prefix, file_name);
            
            // 调用现有的 cloud 模块
            // 注意：cloud::upload_and_set_meta 需要 MultiProgress 等 indicatif 对象，
            // 如果是在 Python 环境下运行，我们可能不需要终端进度条，或者需要传入 None。
            // 假设 cloud.rs 的签名允许 mp 为 Option
            let res = cloud::upload_and_set_meta(
                &client,
                &bucket,
                &object_key,
                src_path,
                &project_id,
                &None, // Meta
                part_size,
                task_num,
                None, // No MultiProgress for Python context (let Python handle UI or use simple print)
                idx + 1,
                total_files
            ).await;

            match res {
                Ok((size, _)) => {
                    success += 1;
                    total_bytes += size as f64;
                },
                Err(e) => {
                    eprintln!("Upload Failed: {} - {}", f, e);
                    failed += 1;
                }
            }
        }
        
        Ok((success, failed, total_bytes / 1_000_000_000.0))
    })
}

#[pyfunction]
fn config_update(
    endpoint: Option<String>,
    region: Option<String>,
    ak: Option<String>,
    sk: Option<String>
) -> PyResult<()> {
    let manager = ConfigManager::new().map_err(|e| pyo3::exceptions::PyIOError::new_err(e.to_string()))?;
    manager.update(endpoint, region, ak, sk).map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e.to_string()))?;
    Ok(())
}

#[pyfunction]
fn config_get() -> PyResult<(Option<String>, Option<String>, Option<String>, Option<String>)> {
    let manager = ConfigManager::new().map_err(|e| pyo3::exceptions::PyIOError::new_err(e.to_string()))?;
    let config = manager.load().map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e.to_string()))?;
    
    // Decrypt
    let ak = config.decrypt_ak().unwrap_or(None);
    let sk = config.decrypt_sk().unwrap_or(None);
    
    Ok((config.endpoint, config.region, ak, sk))
}

#[pymodule]
fn data_deliver_rs(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(run_local_delivery, m)?)?;
    m.add_function(wrap_pyfunction!(run_cloud_delivery, m)?)?;
    m.add_function(wrap_pyfunction!(config_update, m)?)?;
    m.add_function(wrap_pyfunction!(config_get, m)?)?;
    Ok(())
}