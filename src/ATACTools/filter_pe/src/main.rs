use anyhow::Result;
use clap::Parser;
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use log::info;
use rust_htslib::bam::{self, Read, Record};
use serde::Serialize;
use std::fs::File;
use std::path::Path;
use std::time::Instant;

/// 命令行参数定义
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// 输入的 BAM 文件 (必须是 Name-sorted)
    #[arg(short, long)]
    input: String,

    /// 输出的 BAM 文件 (保留下来的 reads)
    #[arg(short, long)]
    output: String,

    /// [新增] 输出被丢弃的 BAM 文件 (可选)
    #[arg(short, long)]
    discarded: Option<String>,

    /// 用于压缩/解压的线程数
    #[arg(short, long, default_value_t = 4)]
    threads: usize,
}

/// 用于输出 JSON 的统计结构体
#[derive(Serialize)]
struct FilterStats {
    sample_name: String,
    total_pairs: u64,
    kept_pairs: u64,
    discarded_pairs: u64,
    fraction_kept: f64,
}

fn main() -> Result<()> {
    // 1. 初始化日志
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    print_banner();

    let args = Args::parse();
    let start_time = Instant::now();

    // 2. 配置多线程读取
    info!("Opening input bam: {} (Threads: {})", args.input.cyan(), args.threads);
    let mut bam_reader = bam::Reader::from_path(&args.input)?;
    bam_reader.set_threads(args.threads)?; // 启用解压多线程

    // 读取 Header
    let header = bam::Header::from_template(bam_reader.header());

    // 3. 配置主要输出 Writer (Kept Reads)
    let mut bam_writer = bam::Writer::from_path(&args.output, &header, bam::Format::Bam)?;
    bam_writer.set_threads(args.threads)?; // 启用压缩多线程

    // 4. [新增] 配置丢弃 Reads 的 Writer (Discarded Reads)
    // 使用 Option 处理，如果用户没传参数，就是 None
    let mut discarded_writer = if let Some(path) = &args.discarded {
        info!("Discarded reads will be saved to: {}", path.yellow());
        let mut writer = bam::Writer::from_path(path, &header, bam::Format::Bam)?;
        writer.set_threads(args.threads)?; // 同样启用多线程加速
        Some(writer)
    } else {
        None
    };

    // 设置进度条
    let pb = ProgressBar::new_spinner();
    pb.set_style(ProgressStyle::default_spinner()
        .template("{spinner:.green} [{elapsed_precise}] {msg} {pos:.cyan} reads processed ({per_sec})")?
        .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"));
    pb.set_message("Filtering...");

    // 统计变量
    let mut total_pairs = 0u64;
    let mut kept_pairs = 0u64;
    let mut prev_record: Option<Record> = None;

    // 5. 核心循环
    for (i, result) in bam_reader.records().enumerate() {
        let record = result?;

        if i % 10000 == 0 {
            pb.set_position(i as u64);
        }

        if record.is_unmapped() {
            continue;
        }

        match prev_record {
            Some(prev) => {
                if prev.qname() == record.qname() {
                    // 找到一对
                    total_pairs += 1;
                    let r1 = &prev;
                    let r2 = &record;

                    if is_valid_pair(r1, r2) {
                        // --- 通过过滤：写入主文件 ---
                        bam_writer.write(r1)?;
                        bam_writer.write(r2)?;
                        kept_pairs += 1;
                    } else {
                        // --- 未通过过滤：如果有 discarded_writer，写入丢弃文件 ---
                        if let Some(w) = &mut discarded_writer {
                            w.write(r1)?;
                            w.write(r2)?;
                        }
                    }
                    prev_record = None;
                } else {
                    // Singleton: 旧的直接丢掉(或写入discard)，缓存新的
                    // 注意：Singleton 这里我们简单处理，直接忽略或视为 discard
                    // 如果你想把 Singleton 也写入 discard，可以在这里加逻辑
                    prev_record = Some(record);
                }
            }
            None => {
                prev_record = Some(record);
            }
        }
    }

    pb.finish_with_message("Done!");
    eprintln!();

    // 6. 生成统计信息
    let discarded_pairs = total_pairs - kept_pairs;
    let fraction = if total_pairs > 0 {
        kept_pairs as f64 / total_pairs as f64
    } else {
        0.0
    };

    // 自动生成 JSON 路径
    let out_path = Path::new(&args.output);
    let file_stem = out_path.file_stem().unwrap_or_default();
    let parent_dir = out_path.parent().unwrap_or(Path::new("./"));
    let json_path = parent_dir.join(format!("{}.filter_stats.json", file_stem.to_string_lossy()));

    let stats = FilterStats {
        sample_name: file_stem.to_string_lossy().to_string(),
        total_pairs,
        kept_pairs,
        discarded_pairs,
        fraction_kept: fraction,
    };
    
    let file = File::create(&json_path)?;
    serde_json::to_writer_pretty(file, &stats)?;

    // 7. 打印日志
    let duration = start_time.elapsed();
    info!("--------------------------------------------------");
    info!("Time Elapsed    : {:.2?}", duration);
    info!("Total Pairs     : {}", total_pairs.to_string().yellow());
    info!("Kept Pairs      : {}", kept_pairs.to_string().green());
    info!("Discarded Pairs : {}", discarded_pairs.to_string().red());
    info!("Output BAM      : {}", args.output.cyan());
    if let Some(d_path) = &args.discarded {
        info!("Discarded BAM   : {}", d_path.yellow());
    }
    info!("Stats JSON      : {}", json_path.display().to_string().cyan());
    info!("--------------------------------------------------");

    Ok(())
}

fn is_valid_pair(r1: &Record, r2: &Record) -> bool {
    // 1. 同染色体
    if r1.tid() != r2.tid() {
        return false;
    }
    // 2. FR 方向
    if r1.is_reverse() == r2.is_reverse() {
        return false;
    }
    true
}

fn print_banner() {
    let banner = r#"
    ██╗  ██╗ █████╗      ██╗██╗███╗   ███╗██╗
    ██║  ██║██╔══██╗     ██║██║████╗ ████║██║
    ███████║███████║     ██║██║██╔████╔██║██║
    ██╔══██║██╔══██║██   ██║██║██║╚██╔╝██║██║
    ██║  ██║██║  ██║╚█████╔╝██║██║ ╚═╝ ██║██║
    ╚═╝  ╚═╝╚═╝  ╚═╝ ╚════╝ ╚═╝╚═╝     ╚═╝╚═╝
          ATAC-seq Filter Tool v0.3.0
    "#;
    println!("{}", banner.bright_green().bold());
}