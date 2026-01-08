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

    // Check if source is a directory
    if src.is_dir() {
        // Handle directory delivery
        match mode {
            ProcessMode::Copy => copy_directory_recursive(src, &dest, buf_size)?,
            ProcessMode::Hardlink => {
                // For directories, create a directory and process contents
                if dest.exists() { fs::remove_dir_all(&dest).ok(); }
                fs::create_dir_all(&dest)?;
                copy_directory_contents_hardlink(src, &dest, buf_size)?;
            },
            ProcessMode::Symlink => {
                // For directories, create a symbolic link to the entire directory
                if dest.exists() {
                    if dest.is_symlink() { fs::remove_file(&dest)?; }
                    else { fs::remove_dir_all(&dest)?; }
                }
                #[cfg(unix)]
                std::os::unix::fs::symlink(src, &dest)?;
                #[cfg(windows)]
                std::os::windows::fs::symlink_dir(src, &dest)?;
            }
        }

        // Calculate total size of directory
        let total_size = get_directory_size(&dest)?;
        let hash_str = format!("{:x}", calculate_directory_hash(&dest)?);
        if md5_file {
            // Return hash for collection in single file later
        }
        Ok((total_size, hash_str))
    } else {
        // Handle file delivery (original logic)
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
            // Return hash for collection in single file later
        }
        Ok((file_len, hash_str))
    }
}

// Helper function to recursively copy a directory
fn copy_directory_recursive(src: &Path, dest: &Path, buf_size: usize) -> anyhow::Result<()> {
    if dest.exists() {
        fs::remove_dir_all(dest)?;
    }
    fs::create_dir_all(dest)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if src_path.is_dir() {
            copy_directory_recursive(&src_path, &dest_path, buf_size)?;
        } else {
            // Copy file
            fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

// Helper function to hardlink directory contents
fn copy_directory_contents_hardlink(src: &Path, dest: &Path, buf_size: usize) -> anyhow::Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if src_path.is_dir() {
            fs::create_dir_all(&dest_path)?;
            copy_directory_contents_hardlink(&src_path, &dest_path, buf_size)?;
        } else {
            // Create hard link for file
            fs::hard_link(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

// Helper function to calculate directory size
fn get_directory_size(dir: &Path) -> anyhow::Result<u64> {
    let mut total = 0;
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            total += entry.metadata()?.len();
        }
    }
    Ok(total)
}

// Helper function to calculate directory hash
fn calculate_directory_hash(dir: &Path) -> anyhow::Result<Digest> {
    use std::collections::HashMap;
    let mut context = Md5Context::new();

    // Collect all files with their relative paths and contents
    let mut files: HashMap<String, Vec<u8>> = HashMap::new();

    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let relative_path = entry.path().strip_prefix(dir)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .replace('\\', "/");
            if let Ok(content) = fs::read(entry.path()) {
                files.insert(relative_path, content);
            }
        }
    }

    // Sort by path to ensure consistent hashing
    let mut sorted_files: Vec<_> = files.into_iter().collect();
    sorted_files.sort_by(|a, b| a.0.cmp(&b.0));

    // Hash each file's path and content
    for (path, content) in sorted_files {
        context.consume(path.as_bytes());
        context.consume(&content);
    }

    Ok(context.compute())
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

use std::sync::{Arc, Mutex};

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

    // Collect MD5 checksums in a thread-safe vector
    let md5_results = Arc::new(Mutex::new(Vec::new()));

    files.par_iter().for_each(|f| {
        let src_path = Path::new(f);
        let md5_results_clone = Arc::clone(&md5_results);
        match process_file_internal(src_path, &out_path, true, process_mode, buffer_size) {
            Ok((len, hash_str)) => {
                // Collect the MD5 result for later writing to single file
                let file_name = src_path.file_name().unwrap().to_string_lossy().to_string();
                if let Ok(mut results) = md5_results_clone.lock() {
                    results.push((file_name, hash_str));
                }

                success_count.fetch_add(1, Ordering::Relaxed);
                total_bytes.fetch_add(len as usize, Ordering::Relaxed);
            },
            Err(e) => {
                eprintln!("Rust Error processing {}: {}", f, e);
                fail_count.fetch_add(1, Ordering::Relaxed);
            }
        }
    });

    // Write all MD5 checksums to a single file
    if let Ok(results) = md5_results.lock() {
        let md5_file_path = out_path.join("all_files.md5");
        let mut md5_file = File::create(&md5_file_path).unwrap();
        for (file_name, hash_str) in results.iter() {
            writeln!(md5_file, "{}  {}", hash_str, file_name).unwrap();
        }
    }

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