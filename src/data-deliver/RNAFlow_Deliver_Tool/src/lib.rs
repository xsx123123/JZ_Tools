mod cloud;
mod config_manager;

use pyo3::prelude::*;
use std::path::{Path, PathBuf};
use std::fs::{self, File};
use std::io::{Read, Write};
use md5::{Context as Md5Context, Digest};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::collections::HashMap; // Added Import
use config_manager::ConfigManager;

#[derive(Clone, Copy)]
enum ProcessMode {
    Copy,
    Hardlink,
    Symlink,
}

impl From<&str> for ProcessMode {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "hardlink" => ProcessMode::Hardlink,
            "symlink" => ProcessMode::Symlink,
            _ => ProcessMode::Copy,
        }
    }
}

fn process_file_internal(src: &Path, dest: &Path, _md5_file: bool, mode: ProcessMode, buf_size: usize) -> anyhow::Result<(u64, String)> {
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    if src.is_dir() {
        match mode {
            ProcessMode::Copy => copy_directory_recursive(src, dest, buf_size)?,
            ProcessMode::Hardlink => {
                if dest.exists() {
                    fs::remove_dir_all(dest).ok();
                }
                fs::create_dir_all(dest)?;
                copy_directory_contents_hardlink(src, dest, buf_size)?;
            },
            ProcessMode::Symlink => {
                if dest.exists() {
                    if dest.is_symlink() {
                        fs::remove_file(dest)?;
                    } else {
                        fs::remove_dir_all(dest)?;
                    }
                }
                #[cfg(unix)]
                std::os::unix::fs::symlink(src, dest)?;
                #[cfg(windows)]
                std::os::windows::fs::symlink_dir(src, dest)?;
            }
        }
        let total_size = get_directory_size(dest)?;
        let hash_str = format!("{:x}", calculate_directory_hash(dest)?) ;
        Ok((total_size, hash_str))
    } else {
        let (hash_digest, file_len) = match mode {
            ProcessMode::Copy => copy_and_hash(src, dest, buf_size)?,
            ProcessMode::Hardlink => {
                let (h, len) = just_hash(src, buf_size)?;
                if dest.exists() {
                    fs::remove_file(dest)?;
                }
                fs::hard_link(src, dest)?;
                (h, len)
            },
            ProcessMode::Symlink => {
                let (h, len) = just_hash(src, buf_size)?;
                if dest.exists() {
                    fs::remove_file(dest)?;
                }
                #[cfg(unix)]
                std::os::unix::fs::symlink(src, dest)?;
                #[cfg(windows)]
                std::os::windows::fs::symlink_file(src, dest)?;
                (h, len)
            }
        };
        let hash_str = format!("{:x}", hash_digest);
        Ok((file_len, hash_str))
    }
}

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
            fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

fn copy_directory_contents_hardlink(src: &Path, dest: &Path, buf_size: usize) -> anyhow::Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            fs::create_dir_all(&dest_path)?;
            copy_directory_contents_hardlink(&src_path, &dest_path, buf_size)?;
        } else {
            fs::hard_link(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

fn get_directory_size(dir: &Path) -> anyhow::Result<u64> {
    let mut total = 0;
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            total += entry.metadata()?.len();
        }
    }
    Ok(total)
}

fn calculate_directory_hash(dir: &Path) -> anyhow::Result<Digest> {
    use std::collections::HashMap;
    let mut context = Md5Context::new();
    let mut files: HashMap<String, Vec<u8>> = HashMap::new();
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let relative_path = entry.path().strip_prefix(dir).unwrap_or(entry.path()).to_string_lossy().replace('\\', "/");
            if let Ok(content) = fs::read(entry.path()) {
                files.insert(relative_path, content);
            }
        }
    }
    let mut sorted_files: Vec<_> = files.into_iter().collect();
    sorted_files.sort_by(|a, b| a.0.cmp(&b.0));
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

// --- PyO3 Interface ---

#[pyfunction]
fn run_local_delivery(
    files: Vec<(String, String)>,
    output_dir: String,
    mode: String,
    threads: usize
) -> PyResult<(usize, usize, f64)> {
    let out_root = PathBuf::from(&output_dir);
    if !out_root.exists() {
        fs::create_dir_all(&out_root)?;
    }
    
    let process_mode = ProcessMode::from(mode.as_str());
    let buffer_size = 2 * 1024 * 1024;
    let _ = rayon::ThreadPoolBuilder::new().num_threads(threads).build_global();

    let success_count = AtomicUsize::new(0);
    let fail_count = AtomicUsize::new(0);
    let total_bytes = AtomicUsize::new(0);
    let md5_results = Arc::new(Mutex::new(Vec::new()));

    files.par_iter().for_each(|(src_str, dest_str)| {
        let src_path = Path::new(src_str);
        let dest_path = Path::new(dest_str);
        let md5_results_clone = Arc::clone(&md5_results);
        
        match process_file_internal(src_path, dest_path, true, process_mode, buffer_size) {
            Ok((len, hash_str)) => {
                let rel_path = dest_path.strip_prefix(&out_root)
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|_| dest_path.file_name().unwrap().to_string_lossy().into_owned());
                
                if let Ok(mut results) = md5_results_clone.lock() {
                    results.push((rel_path, hash_str));
                }
                success_count.fetch_add(1, Ordering::Relaxed);
                total_bytes.fetch_add(len as usize, Ordering::Relaxed);
            },
            Err(e) => {
                eprintln!("Rust Error processing {} -> {}: {}", src_str, dest_str, e);
                fail_count.fetch_add(1, Ordering::Relaxed);
            }
        }
    });

    if let Ok(results) = md5_results.lock() {
        // 1. Write Global Manifest
        let md5_file_path = out_root.join("delivery_manifest.md5");
        let mut md5_file = File::create(&md5_file_path).unwrap();
        for (name, hash) in results.iter() {
            writeln!(md5_file, "{}  {}", hash, name).unwrap();
        }

        // 2. Write Per-Directory MD5.txt
        let mut dir_map: HashMap<PathBuf, Vec<(String, String)>> = HashMap::new();
        for (rel_path_str, hash) in results.iter() {
            let full_path = out_root.join(rel_path_str);
            if let Some(parent) = full_path.parent() {
                let file_name = full_path.file_name().unwrap().to_string_lossy().to_string();
                dir_map.entry(parent.to_path_buf())
                       .or_default()
                       .push((file_name, hash.clone()));
            }
        }

        for (dir_path, entries) in dir_map {
            // Sort by filename for deterministic output
            let mut sorted_entries = entries;
            sorted_entries.sort_by(|a, b| a.0.cmp(&b.0));

            let md5_path = dir_path.join("MD5.txt");
            if let Ok(mut f) = File::create(md5_path) {
                for (name, hash) in sorted_entries {
                    writeln!(f, "{}  {}", hash, name).ok();
                }
            }
        }
    }

    let s = success_count.load(Ordering::Relaxed);
    let f = fail_count.load(Ordering::Relaxed);
    let b = total_bytes.load(Ordering::Relaxed) as f64 / 1_000_000_000.0;
    Ok((s, f, b))
}

#[pyfunction]
fn run_cloud_delivery(
    files: Vec<(String, String)>,
    bucket: String,
    _prefix: String,
    endpoint: String,
    region: String,
    ak: String,
    sk: String,
    project_id: String,
    task_num: usize,
    part_size: u64
) -> PyResult<(usize, usize, f64)> {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let client = match cloud::create_client(&endpoint, &region, &ak, &sk) {
            Ok(c) => c,
            Err(e) => return Err(pyo3::exceptions::PyValueError::new_err(format!("Client Init Error: {}", e))),
        };
        
        let mut success = 0;
        let mut failed = 0;
        let mut total_bytes = 0_f64;
        let total_files = files.len();

        for (idx, (src_str, object_key)) in files.iter().enumerate() {
            let src_path = Path::new(src_str);
            let res = cloud::upload_and_set_meta(
                &client, &bucket, object_key, src_path, &project_id, &None,
                part_size, task_num, None, idx + 1, total_files
            ).await;

            match res {
                Ok((size, _)) => { success += 1; total_bytes += size as f64; },
                Err(e) => { eprintln!("Upload Failed: {} -> {}: {}", src_str, object_key, e); failed += 1; }
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