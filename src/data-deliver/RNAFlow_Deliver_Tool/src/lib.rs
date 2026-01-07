use pyo3::prelude::*;
use std::path::{Path, PathBuf};
use std::fs::{self, File};
use std::io::{Read, Write};
use md5::{Context as Md5Context, Digest};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};

// --- 复用原有逻辑的辅助函数 (从 main.rs 迁移或复制过来) ---

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

// 核心文件处理逻辑 (与 main.rs 中基本一致，去掉了一部分 log)
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
    
    // 如果需要生成 .md5 文件
    if md5_file {
        let md5_path = format!("{}.md5", dest.display());
        fs::write(md5_path, format!("{}  {}\n", hash_str, file_name.to_string_lossy()))?;
    }

    Ok((file_len, hash_str))
}

// 哈希计算辅助函数
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
    files: Vec<String>,      // Python 传入的文件路径列表
    output_dir: String,      // 输出目录
    mode: String,            // copy / symlink / hardlink
    threads: usize           // 线程数
) -> PyResult<(usize, usize, f64)> { // 返回 (成功数, 失败数, 总大小GB)
    
    let out_path = PathBuf::from(&output_dir);
    if !out_path.exists() {
        fs::create_dir_all(&out_path)?;
    }
    
    let process_mode = ProcessMode::from(mode.as_str());
    let buffer_size = 2 * 1024 * 1024; // 2MB Buffer

    // 设置 Rayon 线程池
    let _ = rayon::ThreadPoolBuilder::new().num_threads(threads).build_global();

    let success_count = AtomicUsize::new(0);
    let fail_count = AtomicUsize::new(0);
    let total_bytes = AtomicUsize::new(0);

    // 并行处理
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
    let b = total_bytes.load(Ordering::Relaxed) as f64 / 1_000_000_000.0; // GB

    Ok((s, f, b))
}

#[pymodule]
fn data_deliver_rs(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(run_local_delivery, m)?)?;
    Ok(())
}