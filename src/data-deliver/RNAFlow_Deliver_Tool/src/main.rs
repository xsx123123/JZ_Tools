mod cloud;
mod config_manager;

use anyhow::Result;
use clap::builder::styling::{AnsiColor, Effects, Styles};
use clap::{Args, Parser, Subcommand, ValueEnum};
use comfy_table::modifiers::UTF8_ROUND_CORNERS;
use comfy_table::presets::UTF8_FULL;
use comfy_table::Table;
use console::style;
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use log::{error, info, warn};
use md5::{Context as Md5Context, Digest};
use rayon::prelude::*;
use regex::Regex;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use walkdir::WalkDir;

// --- 样式定义 ---
fn get_styles() -> Styles {
    Styles::styled()
        .header(AnsiColor::Green.on_default().effects(Effects::BOLD))
        .usage(AnsiColor::Green.on_default().effects(Effects::BOLD))
        .literal(AnsiColor::Cyan.on_default().effects(Effects::BOLD))
        .placeholder(AnsiColor::Cyan.on_default())
        .error(AnsiColor::Red.on_default().effects(Effects::BOLD))
        .valid(AnsiColor::Cyan.on_default().effects(Effects::BOLD))
        .invalid(AnsiColor::Yellow.on_default().effects(Effects::BOLD))
}

#[derive(Parser, Debug)]
#[command(author, version, about, styles = get_styles())]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// 本地文件处理（复制、硬链接、软链接）
    Local(LocalArgs),
    /// 将文件上传到云端对象存储 (TOS)
    Cloud(CloudArgs),
    /// 设置或更新工具的配置（如 AK/SK、Endpoint）
    Config(ConfigArgs),
}

#[derive(Args, Debug)]
struct LocalArgs {
    #[arg(short, long)] input: PathBuf,
    #[arg(short, long)] output: PathBuf,
    #[arg(long)] project_id: String,
    #[arg(short, long, value_enum, default_value_t = Mode::Copy)] mode: Mode,
    /// 仅处理文件名匹配该正则表达式的文件
    #[arg(long)] regex: Option<String>,
    #[arg(short, long)] threads: Option<usize>,
    #[arg(long, default_value_t = 2097152)] buffer_size: usize,
    #[arg(long)] debug: bool,
}

#[derive(Args, Debug)]
struct CloudArgs {
    #[arg(short, long)] input: PathBuf,
    #[arg(long)] bucket: String,
    #[arg(long, default_value = "")] prefix: String,
    // 移除默认值，改为 Option，以便后续逻辑判断是否从 config 读取
    #[arg(long)] endpoint: Option<String>,
    #[arg(long)] region: Option<String>,
    #[arg(long, env = "TOS_ACCESS_KEY")] ak: Option<String>,
    #[arg(long, env = "TOS_SECRET_KEY")] sk: Option<String>,
    #[arg(long)] project_id: String,
    
    #[arg(long)] meta: Option<String>,
    /// 仅处理文件名匹配该正则表达式的文件
    #[arg(long)] regex: Option<String>,
    #[arg(long, default_value = ".")] log_dir: PathBuf,
    #[arg(long)] debug: bool,

    /// 分片大小 (MB)，默认 20MB
    #[arg(long, default_value_t = 20)] part_size: u64,
    /// 并发上传线程数，默认 3
    #[arg(long, default_value_t = 3)] task_num: usize,
}

#[derive(Args, Debug)]
struct ConfigArgs {
    /// 对象存储服务端点 (如 https://tos-cn-beijing.volces.com)
    #[arg(long)] endpoint: String,
    /// 存储桶所在的区域 (如 cn-beijing)
    #[arg(long)] region: String,
    /// Access Key ID (将被加密存储)
    #[arg(long)] ak: Option<String>,
    /// Secret Access Key (将被加密存储)
    #[arg(long)] sk: Option<String>,
}

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum Mode { Copy, Hardlink, Symlink }

struct Stats {
    success: AtomicUsize,
    failed: AtomicUsize,
    total_bytes: AtomicUsize,
}

#[tokio::main]
async fn main() -> Result<()> {
    let start_time = Instant::now();
    let raw_args: Vec<String> = std::env::args().collect();
    let cmd_str = raw_args.join(" ");
    let cli = Cli::parse();

    match cli.command {
        Commands::Local(args) => run_local(args, cmd_str, start_time).await,
        Commands::Cloud(args) => run_cloud(args, cmd_str, start_time).await,
        Commands::Config(args) => run_config(args).await,
    }
}

async fn run_config(args: ConfigArgs) -> Result<()> {
    let manager = config_manager::ConfigManager::new()?;
    manager.update(Some(args.endpoint), Some(args.region), args.ak, args.sk)?;
    Ok(())
}

// --- Local 逻辑 ---
async fn run_local(args: LocalArgs, cmd_str: String, start_time: Instant) -> Result<()> {
    if !args.output.exists() { fs::create_dir_all(&args.output)?; }
    let log_path = args.output.join(format!("{}_{}_local.log", args.project_id, chrono::Local::now().format("%Y%m%d-%H%M%S")));
    setup_logger(args.debug, &log_path)?;
    
    info!("COMMAND: {}", cmd_str);
    info!("🚀 [LOCAL] 任务启动...");

    if let Some(t) = args.threads { rayon::ThreadPoolBuilder::new().num_threads(t).build_global()?; }
    let re = compile_regex(&args.regex)?;
    let entries = scan_files(&args.input, &re)?;

    if entries.is_empty() { warn!("无文件"); return Ok(()); }
    let pb = create_pb(entries.len() as u64);
    let stats = Stats { success: AtomicUsize::new(0), failed: AtomicUsize::new(0), total_bytes: AtomicUsize::new(0) };

    entries.par_iter().for_each(|src| {
        let dest = args.output.join(src.file_name().unwrap());
        let md5 = format!("{}.md5", dest.display());
        if !args.debug { pb.set_message(format!("{:?}", src.file_name().unwrap())); }
        match process_local_file(src, &dest, &md5, args.mode, args.buffer_size) {
            Ok((s, m)) => { 
                stats.success.fetch_add(1, Ordering::Relaxed); 
                stats.total_bytes.fetch_add(s as usize, Ordering::Relaxed);
                info!("✅ Local: {} -> {} (MD5: {})", src.display(), dest.display(), m);
            }
            Err(e) => { stats.failed.fetch_add(1, Ordering::Relaxed); pb.println(format!("{} Fail: {:?}", style("❌").red(), src)); error!("{}", e); }
        }
        pb.inc(1);
    });
    pb.finish_and_clear();
    print_summary("Local Delivery", &stats, &log_path, start_time.elapsed());
    Ok(())
}

// --- Cloud 逻辑 ---
async fn run_cloud(mut args: CloudArgs, cmd_str: String, start_time: Instant) -> Result<()> {
    // 1. 尝试加载配置文件
    let config_manager = config_manager::ConfigManager::new()?;
    let config = config_manager.load().unwrap_or_default();

    // 2. 参数补全优先级: CLI Args > Env Vars (clap handled) > Config File
    if args.endpoint.is_none() {
        args.endpoint = config.endpoint.clone();
    }
    if args.region.is_none() {
        args.region = config.region.clone();
    }
    if args.ak.is_none() {
        args.ak = config.decrypt_ak()?;
    }
    if args.sk.is_none() {
        args.sk = config.decrypt_sk()?;
    }

    let endpoint = args.endpoint.as_ref().ok_or_else(|| anyhow::anyhow!("❌ 缺少 Endpoint 配置！请在命令行指定 --endpoint 或运行 'data_deliver config' 进行配置"))?;
    let region = args.region.as_ref().ok_or_else(|| anyhow::anyhow!("❌ 缺少 Region 配置！请在命令行指定 --region 或运行 'data_deliver config' 进行配置"))?;

    if args.bucket.starts_with("tos://") {
        args.bucket = args.bucket.strip_prefix("tos://").unwrap().to_string();
    }

    if !args.log_dir.exists() { fs::create_dir_all(&args.log_dir)?; }
    let log_path = args.log_dir.join(format!("{}_{}_cloud.log", args.project_id, chrono::Local::now().format("%Y%m%d-%H%M%S")));
    setup_logger(args.debug, &log_path)?;

    info!("COMMAND: {}", cmd_str);
    info!("🚀 [CLOUD] 任务启动: Project={}, Bucket={}", args.project_id, args.bucket);

    cloud::check_prerequisites(endpoint, &args.ak, &args.sk).await?;

    let client = cloud::create_client(
        endpoint, 
        region, 
        args.ak.as_ref().unwrap(), 
        args.sk.as_ref().unwrap()
    )?;

    let re = compile_regex(&args.regex)?;
    let entries = scan_files(&args.input, &re)?;

    if entries.is_empty() { warn!("未找到文件"); return Ok(()); }
    
    let mp = MultiProgress::new();
    let stats = Stats { success: AtomicUsize::new(0), failed: AtomicUsize::new(0), total_bytes: AtomicUsize::new(0) };

    info!("开始传输 {} 个文件到云端...", entries.len());

    let total_files = entries.len();

    // 串行遍历文件，但 upload_file 内部是多线程并发上传分片的
    for (idx, src_path) in entries.iter().enumerate() {
        let file_name = src_path.file_name().unwrap().to_string_lossy().to_string();
        let object_key = format!("{}{}", args.prefix, file_name);

        let res = cloud::upload_and_set_meta(
            &client, 
            &args.bucket, 
            &object_key, 
            src_path, 
            &args.project_id, 
            &args.meta,
            args.part_size, 
            args.task_num,
            Some(&mp),
            idx + 1,
            total_files
        ).await;

        match res {
            Ok((size, req_id)) => {
                stats.success.fetch_add(1, Ordering::Relaxed);
                stats.total_bytes.fetch_add(size, Ordering::Relaxed);
                info!("✅ Success: {} -> s3://{}/{} (ReqID: {})", file_name, args.bucket, object_key, req_id);
            }
            Err(e) => {
                stats.failed.fetch_add(1, Ordering::Relaxed);
                error!("❌ Cloud Fail: {} - {}", file_name, e);
                // 使用 mp.println 避免打断其他可能存在的进度条（虽然这里只有一个），或者直接 error!
                let _ = mp.println(format!("{} Fail: {} ({})", style("❌").red(), file_name, e));
            }
        }
    }

    // 清除可能残留的进度条（虽然后面就是 finish）
    // pb.finish_and_clear(); // 已移除 pb
    print_summary("Cloud Delivery", &stats, &log_path, start_time.elapsed());

    // --- Upload Log File ---
    let log_file_name = log_path.file_name().unwrap().to_string_lossy().to_string();
    let log_object_key = format!("{}{}", args.prefix, log_file_name);
    info!("📤 Uploading log file: {} -> s3://{}/{}", log_file_name, args.bucket, log_object_key);

    let log_res = cloud::upload_and_set_meta(
        &client,
        &args.bucket,
        &log_object_key,
        &log_path,
        &args.project_id,
        &None, // No extra meta for log
        args.part_size,
        1, // Serial upload for log is fine, or use args.task_num
        Some(&mp),
        1,
        1
    ).await;

    match log_res {
        Ok(_) => info!("✅ Log file uploaded successfully."),
        Err(e) => error!("❌ Failed to upload log file: {}", e),
    }

    Ok(())
}

// --- 辅助函数 ---
fn compile_regex(p: &Option<String>) -> Result<Option<Regex>> {
    Ok(if let Some(s) = p { Some(Regex::new(s)?) } else { None })
}

fn scan_files(input: &Path, re: &Option<Regex>) -> Result<Vec<PathBuf>> {
    let entries = WalkDir::new(input).into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| if let Some(r) = re { r.is_match(&e.file_name().to_string_lossy()) } else { true })
        .map(|e| e.path().to_owned())
        .collect();
    Ok(entries)
}

fn create_pb(len: u64) -> ProgressBar {
    let pb = ProgressBar::new(len);
    pb.set_style(ProgressStyle::default_bar().template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) {msg}").unwrap().progress_chars("=>-"));
    pb
}

fn setup_logger(debug: bool, path: &Path) -> Result<()> {
    let colors = fern::colors::ColoredLevelConfig::new().info(fern::colors::Color::Green);
    
    let mut stdout = fern::Dispatch::new()
        .format(move |out, msg, rec| out.finish(format_args!("{} {}", colors.color(rec.level()), msg)))
        .chain(std::io::stdout());

    if debug {
        stdout = stdout.level(log::LevelFilter::Debug);
    } else {
        stdout = stdout.level(log::LevelFilter::Info)
            .level_for("ve_tos_rust_sdk", log::LevelFilter::Warn);
    }

    let file = fern::Dispatch::new()
        .format(|out, msg, rec| out.finish(format_args!("[{}][{}] {}", chrono::Local::now().to_rfc3339(), rec.level(), msg)))
        .level(log::LevelFilter::Debug)
        .chain(fern::log_file(path)?);

    fern::Dispatch::new()
        .chain(stdout)
        .chain(file)
        .apply()?;
    Ok(())
}

fn print_summary(title: &str, stats: &Stats, log: &Path, dur: Duration) {
    let s = stats.success.load(Ordering::Relaxed);
    let f = stats.failed.load(Ordering::Relaxed);
    let b = stats.total_bytes.load(Ordering::Relaxed);
    let mut table = Table::new();
    table.load_preset(UTF8_FULL).apply_modifier(UTF8_ROUND_CORNERS);
    table.set_header(vec![format!("{} Metric", title), "Value".to_string()]);
    table.add_row(vec!["✅ Success", &s.to_string()]);
    table.add_row(vec!["❌ Failed", &f.to_string()]);
    table.add_row(vec!["📦 Size", &format!("{:.2} GB", b as f64 / 1e9)]);
    table.add_row(vec!["⏱️ Time", &format!("{:.2?}s", dur.as_secs_f64())]);
    table.add_row(vec!["📄 Log", &log.display().to_string()]);
    println!("\n{}", table);
}

fn process_local_file(src: &Path, dest: &Path, md5_dest: &str, mode: Mode, buf_size: usize) -> Result<(u64, String)> {
    if let Some(parent) = dest.parent() { fs::create_dir_all(parent)?; }
    let (hash_digest, file_len) = match mode {
        Mode::Copy => copy_and_hash(src, dest, buf_size)?,
        Mode::Hardlink => {
            let (h, len) = just_hash(src, buf_size)?;
            if dest.exists() { fs::remove_file(dest)?; }
            fs::hard_link(src, dest)?;
            (h, len)
        }
        Mode::Symlink => {
            let (h, len) = just_hash(src, buf_size)?;
            if dest.exists() { fs::remove_file(dest)?; }
            #[cfg(unix)] std::os::unix::fs::symlink(src, dest)?;
            #[cfg(windows)] std::os::windows::fs::symlink_file(src, dest)?;
            (h, len)
        }
    };
    let hash_str = format!("{:x}", hash_digest);
    let file_name = dest.file_name().unwrap().to_string_lossy();
    fs::write(md5_dest, format!("{}  {}\n", hash_str, file_name))?;
    Ok((file_len, hash_str))
}

fn just_hash(path: &Path, buffer_size: usize) -> Result<(Digest, u64)> {
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

fn copy_and_hash(src: &Path, dest: &Path, buffer_size: usize) -> Result<(Digest, u64)> {
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