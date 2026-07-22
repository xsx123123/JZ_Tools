use anyhow::{Context, Result};
use chrono::Local;
use clap::builder::styling::{AnsiColor, Effects, Styles};
use clap::Parser;
use indicatif::{MultiProgress, ParallelProgressIterator, ProgressBar, ProgressStyle};
use nu_ansi_term::{Color, Style};
use rayon::prelude::*;
use serde::Deserialize;
use std::fs::{self, File};
use std::io::{self, BufReader, Read, Write as _};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, warn, Event, Subscriber};
use tracing_subscriber::fmt::format::{FormatEvent, FormatFields, Writer};
use tracing_subscriber::fmt::FmtContext;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{fmt, layer::SubscriberExt, EnvFilter, Layer};

// --- Shared types ---

#[derive(Debug, Clone, clap::ValueEnum)]
enum LogFormat {
    Text,
    Json,
}

// --- Data structures ---

#[derive(Deserialize, Debug)]
struct RenamingReportEntry {
    sample_name: String,
    #[serde(rename = "library_type")]
    _library_type: String,

    new_r1_path_relative: Option<String>,
    md5_r1: Option<String>,
    new_r2_path_relative: Option<String>,
    md5_r2: Option<String>,

    new_se_path_relative: Option<String>,
    md5_se: Option<String>,
}

#[derive(Debug, Clone)]
struct VerificationTask {
    file_to_check: PathBuf,
    expected_md5: String,
    sample_name: String,
}

#[derive(Debug)]
struct VerificationResult {
    timestamp: String,
    sample_name: String,
    file_path: String,
    expected_md5: String,
    actual_md5: String,
    status: &'static str,
    message: String,
}

// --- CLI ---

const HELP_STYLES: Styles = Styles::styled()
    .header(AnsiColor::Green.on_default().effects(Effects::BOLD))
    .usage(AnsiColor::Cyan.on_default().effects(Effects::BOLD))
    .literal(AnsiColor::Blue.on_default().effects(Effects::BOLD))
    .placeholder(AnsiColor::Cyan.on_default())
    .error(AnsiColor::Red.on_default().effects(Effects::BOLD))
    .valid(AnsiColor::Green.on_default())
    .invalid(AnsiColor::Yellow.on_default());

const HELP_LOGO: &str = "\n\
\x1b[1;37m    ███╗   ███╗██████╗ ██████╗     ██╗   ██╗██╗███████╗██╗████████╗███████╗██████╗ \x1b[0m\n\
\x1b[1;37m    ████╗ ████║██╔══██╗╚════██╗    ██║   ██║██║██╔════╝██║╚══██╔══╝██╔════╝██╔══██╗\x1b[0m\n\
\x1b[1;37m    ██╔████╔██║██║  ██║ █████╔╝    ██║   ██║██║█████╗  ██║   ██║   █████╗  ██████╔╝\x1b[0m\n\
\x1b[1;37m    ██║╚██╔╝██║██║  ██║ ╚═══██╗    ╚██╗ ██╔╝██║██╔══╝  ██║   ██║   ██╔══╝  ██╔══██╗\x1b[0m\n\
\x1b[1;37m    ██║ ╚═╝ ██║██████╔╝██████╔╝     ╚████╔╝ ██║██║     ██║   ██║   ███████╗██║  ██║\x1b[0m\n\
\x1b[1;37m    ╚═╝     ╚═╝╚═════╝ ╚═════╝       ╚═══╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝\x1b[0m\n\
\x1b[36m              MD5 Checksum Verifier  │  Multi-threaded\x1b[0m\n";

/// Verify file MD5 checksums concurrently based on a JSON report.
#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about,
    long_about = None,
    color = clap::ColorChoice::Always,
    styles = HELP_STYLES,
    before_help = HELP_LOGO,
    help_template = r#"{before-help}
{about-with-newline}
{usage-heading} {usage}

{all-args}
"#
)]
struct Cli {
    /// JSON report produced by seq_preprocessor.
    #[arg(short, long)]
    input: PathBuf,

    /// Root directory containing the organized data (base for relative paths in the JSON report).
    #[arg(short, long, default_value = ".")]
    base_dir: PathBuf,

    /// Number of threads for concurrent verification (0 uses Rayon's default).
    #[arg(short, long, default_value_t = 0)]
    threads: usize,

    /// Output path for the TSV verification report.
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Log file path. If not provided, a timestamped log file is created automatically.
    #[arg(long, value_name = "FILE")]
    log_file: Option<PathBuf>,

    /// Console log level.
    #[arg(long, default_value = "info")]
    log_level: String,

    /// Console log format.
    #[arg(long, default_value = "text")]
    log_format: LogFormat,

    /// Read buffer size in bytes.
    #[arg(long, default_value_t = 1024 * 1024)]
    buffer_size: usize,
}

// --- Logging infrastructure ---

static GLOBAL_MP: std::sync::LazyLock<MultiProgress> =
    std::sync::LazyLock::new(MultiProgress::new);
static BARS_ACTIVE: AtomicBool = AtomicBool::new(false);

struct MpWriter {
    buf: Vec<u8>,
}

impl io::Write for MpWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.buf.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        if !self.buf.is_empty() {
            let s = String::from_utf8_lossy(&self.buf);
            let s = s.trim_end_matches('\n');
            if !s.is_empty() {
                if BARS_ACTIVE.load(Ordering::Relaxed) {
                    let _ = GLOBAL_MP.println(s);
                } else {
                    eprintln!("{}", s);
                }
            }
            self.buf.clear();
        }
        Ok(())
    }
}

impl Drop for MpWriter {
    fn drop(&mut self) {
        let _ = self.flush();
    }
}

struct ColoredFormatter;

/// Truncate a string to a maximum character count without splitting multi-byte chars.
fn truncate_to_width(s: &str, width: usize) -> String {
    s.chars().take(width).collect()
}

impl<S, N> FormatEvent<S, N> for ColoredFormatter
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> std::fmt::Result {
        let use_color = writer.has_ansi_escapes();

        let now = Local::now().format("%H:%M:%S");
        if use_color {
            write!(
                writer,
                "{} ",
                Style::new()
                    .fg(Color::Purple)
                    .dimmed()
                    .paint(format!("[{}]", now))
            )?;
        } else {
            write!(writer, "[{}] ", now)?;
        }

        let level = event.metadata().level();
        let level_text = format!("{:<5}", level);
        if use_color {
            let level_style = match *level {
                tracing::Level::TRACE => Style::new().fg(Color::Fixed(8)).dimmed(),
                tracing::Level::DEBUG => Style::new().fg(Color::Cyan).bold(),
                tracing::Level::INFO => Style::new().fg(Color::Green).bold(),
                tracing::Level::WARN => Style::new().fg(Color::Yellow).bold(),
                tracing::Level::ERROR => Style::new().fg(Color::Red).bold(),
            };
            write!(writer, "{} ", level_style.paint(level_text))?;
        } else {
            write!(writer, "{} ", level_text)?;
        }

        let target = event.metadata().target();
        let target_short = target
            .rsplit_once("::")
            .map(|(_, name)| name)
            .unwrap_or(target);
        let target_display = truncate_to_width(target_short, 12);
        let pad = 12usize.saturating_sub(target_display.len());
        let left = pad / 2;
        let right = pad - left;
        let target_centered = format!(
            "[{}{}{}]",
            " ".repeat(left),
            target_display,
            " ".repeat(right)
        );
        if use_color {
            write!(
                writer,
                "{} ",
                Style::new()
                    .fg(Color::Cyan)
                    .dimmed()
                    .paint(target_centered)
            )?;
        } else {
            write!(writer, "{} ", target_centered)?;
        }

        ctx.format_fields(writer.by_ref(), event)?;
        writeln!(writer)
    }
}

fn setup_logging(
    base_dir: &Path,
    log_file_override: Option<&Path>,
    log_level: &str,
    log_format: &LogFormat,
) -> Result<()> {
    let log_path = if let Some(path) = log_file_override {
        path.to_path_buf()
    } else {
        let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
        let log_name = format!("json_md5_verifier_{}.log", timestamp);
        base_dir.join(log_name)
    };

    if let Some(parent_dir) = log_path.parent() {
        fs::create_dir_all(parent_dir)?;
    }
    let file = File::create(&log_path)?;

    // File log: plain text, RFC 3339 timestamp, includes target and thread ID for troubleshooting.
    let file_layer = fmt::layer()
        .with_writer(file)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_timer(fmt::time::LocalTime::rfc_3339())
        .with_filter(EnvFilter::new("debug"));

    // Console log: respect RUST_LOG env var first, otherwise use --log-level.
    let stdout_filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new(log_level))
        .context("Invalid --log-level value")?;

    match log_format {
        LogFormat::Json => {
            let json_layer = fmt::layer()
                .json()
                .with_writer(|| MpWriter { buf: Vec::new() })
                .with_timer(fmt::time::LocalTime::rfc_3339())
                .flatten_event(true)
                .with_target(false)
                .with_filter(stdout_filter);

            let subscriber = tracing_subscriber::registry()
                .with(file_layer)
                .with(json_layer);
            tracing::subscriber::set_global_default(subscriber)
                .context("Failed to set subscriber")?;
        }
        LogFormat::Text => {
            let stdout_layer = fmt::layer()
                .compact()
                .event_format(ColoredFormatter)
                .with_writer(|| MpWriter { buf: Vec::new() })
                .with_filter(stdout_filter);

            let subscriber = tracing_subscriber::registry()
                .with(file_layer)
                .with(stdout_layer);
            tracing::subscriber::set_global_default(subscriber)
                .context("Failed to set subscriber")?;
        }
    }

    info!("Log file created: {}", log_path.display());
    Ok(())
}

// --- Banner ---

fn print_banner() {
    const LINES: &[&str] = &[
        "    ███╗   ███╗██████╗ ██████╗     ██╗   ██╗██╗███████╗██╗████████╗███████╗██████╗ ",
        "    ████╗ ████║██╔══██╗╚════██╗    ██║   ██║██║██╔════╝██║╚══██╔══╝██╔════╝██╔══██╗",
        "    ██╔████╔██║██║  ██║ █████╔╝    ██║   ██║██║█████╗  ██║   ██║   █████╗  ██████╔╝",
        "    ██║╚██╔╝██║██║  ██║ ╚═══██╗    ╚██╗ ██╔╝██║██╔══╝  ██║   ██║   ██╔══╝  ██╔══██╗",
        "    ██║ ╚═╝ ██║██████╔╝██████╔╝     ╚████╔╝ ██║██║     ██║   ██║   ███████╗██║  ██║",
        "    ╚═╝     ╚═╝╚═════╝ ╚═════╝       ╚═══╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝",
    ];

    const LOGO_WIDTH: usize = 72;
    let center = |s: &str| {
        let pad = LOGO_WIDTH.saturating_sub(s.chars().count()) / 2;
        format!("{}{}", " ".repeat(pad), s)
    };

    println!();
    for line in LINES {
        println!("{}", Color::White.bold().paint(*line));
    }
    println!(
        "{}",
        Color::Cyan.paint(center("MD5 Checksum Verifier  │  Multi-threaded"))
    );
    println!();
    println!("{}", Color::Cyan.paint(center("Integrity is doing the right thing, even when no one is watching.")));
    println!();
}

// --- Core functions ---

fn get_optimal_buffer_size(file_path: &Path) -> usize {
    match fs::metadata(file_path) {
        Ok(metadata) => {
            let file_size = metadata.len();
            if file_size > 1_000_000_000 {
                2 * 1024 * 1024
            } else if file_size > 100_000_000 {
                1024 * 1024
            } else {
                64 * 1024
            }
        }
        Err(_) => 1024 * 1024,
    }
}

fn calculate_md5(filepath: &Path, buffer_size: usize) -> io::Result<String> {
    let file = File::open(filepath)?;
    let mut reader = BufReader::new(file);

    let optimal_buffer_size = get_optimal_buffer_size(filepath);
    let effective_buffer_size = buffer_size.max(optimal_buffer_size);

    let mut context = md5::Context::new();
    let mut buffer = vec![0; effective_buffer_size];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        context.consume(&buffer[..bytes_read]);
    }
    Ok(format!("{:x}", context.compute()))
}

fn verify_file_task(task: &VerificationTask, buffer_size: usize) -> VerificationResult {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let file_path_str = task.file_to_check.to_string_lossy().to_string();

    if !task.file_to_check.exists() {
        return VerificationResult {
            timestamp,
            sample_name: task.sample_name.clone(),
            file_path: file_path_str,
            expected_md5: task.expected_md5.clone(),
            actual_md5: "N/A".to_string(),
            status: "FAIL",
            message: "File not found".to_string(),
        };
    }

    match calculate_md5(&task.file_to_check, buffer_size) {
        Ok(actual_md5) => {
            if task.expected_md5.eq_ignore_ascii_case("SRA") {
                VerificationResult {
                    timestamp,
                    sample_name: task.sample_name.clone(),
                    file_path: file_path_str,
                    expected_md5: task.expected_md5.clone(),
                    actual_md5,
                    status: "PASS",
                    message: "SRA MD5 calculated".to_string(),
                }
            } else if actual_md5.eq_ignore_ascii_case(&task.expected_md5) {
                VerificationResult {
                    timestamp,
                    sample_name: task.sample_name.clone(),
                    file_path: file_path_str,
                    expected_md5: task.expected_md5.clone(),
                    actual_md5,
                    status: "PASS",
                    message: "MD5 match".to_string(),
                }
            } else {
                VerificationResult {
                    timestamp,
                    sample_name: task.sample_name.clone(),
                    file_path: file_path_str,
                    expected_md5: task.expected_md5.clone(),
                    actual_md5,
                    status: "FAIL",
                    message: "MD5 mismatch".to_string(),
                }
            }
        }
        Err(e) => VerificationResult {
            timestamp,
            sample_name: task.sample_name.clone(),
            file_path: file_path_str,
            expected_md5: task.expected_md5.clone(),
            actual_md5: "N/A".to_string(),
            status: "FAIL",
            message: format!("Read error: {}", e),
        },
    }
}

fn generate_report(results: &[VerificationResult], output_file: &Path) -> Result<()> {
    info!("Generating verification report: {}", output_file.display());
    let mut writer = csv::WriterBuilder::new()
        .delimiter(b'\t')
        .from_path(output_file)?;
    writer.write_record(&[
        "CheckTime",
        "SampleName",
        "FilePath",
        "ExpectedMD5",
        "ActualMD5",
        "Status",
        "Message",
    ])?;
    for res in results {
        writer.write_record(&[
            &res.timestamp,
            &res.sample_name,
            &res.file_path,
            &res.expected_md5,
            &res.actual_md5,
            res.status,
            &res.message,
        ])?;
    }
    writer.flush()?;
    info!("Report generated successfully");
    Ok(())
}

fn print_summary_line(label: &str, passed: usize, failed: usize, fail_word: &str) {
    let ok = Color::Green.bold().paint(format!("{} passed", passed));
    let bad = if failed > 0 {
        Color::Red.bold().paint(format!("{} {}", failed, fail_word))
    } else {
        Color::Green.paint(format!("0 {}", fail_word))
    };
    let head = if failed > 0 {
        Color::Red.bold().paint(format!("✗ {}", label))
    } else {
        Color::Green.bold().paint(format!("✓ {}", label))
    };
    eprintln!("\n{}  ·  {}  ·  {}", head, ok, bad);
}

// --- Main ---

fn main() -> Result<()> {
    let cli = Cli::parse();

    print_banner();
    setup_logging(
        &cli.base_dir,
        cli.log_file.as_deref(),
        &cli.log_level,
        &cli.log_format,
    )?;

    if cli.threads > 0 {
        rayon::ThreadPoolBuilder::new()
            .num_threads(cli.threads)
            .thread_name(|i| format!("md5-worker-{}", i))
            .build_global()?;
    }

    info!("Starting MD5 verification pipeline");
    info!("Reading JSON report: {}", cli.input.display());

    let json_content = fs::read_to_string(&cli.input)
        .context(format!("Cannot read JSON file: {}", cli.input.display()))?;
    let report_entries: Vec<RenamingReportEntry> = serde_json::from_str(&json_content)
        .context("Failed to parse JSON file, please check the format.")?;

    let mut tasks = Vec::new();

    info!("Collecting verification tasks from report...");
    for entry in &report_entries {
        if let (Some(md5_r1), Some(path_r1)) = (&entry.md5_r1, &entry.new_r1_path_relative) {
            tasks.push(VerificationTask {
                file_to_check: cli.base_dir.join(path_r1),
                expected_md5: md5_r1.clone(),
                sample_name: entry.sample_name.clone(),
            });
        }

        if let (Some(md5_r2), Some(path_r2)) = (&entry.md5_r2, &entry.new_r2_path_relative) {
            tasks.push(VerificationTask {
                file_to_check: cli.base_dir.join(path_r2),
                expected_md5: md5_r2.clone(),
                sample_name: entry.sample_name.clone(),
            });
        }

        if let (Some(md5_se), Some(path_se)) = (&entry.md5_se, &entry.new_se_path_relative) {
            tasks.push(VerificationTask {
                file_to_check: cli.base_dir.join(path_se),
                expected_md5: md5_se.clone(),
                sample_name: entry.sample_name.clone(),
            });
        }
    }

    let num_tasks = tasks.len();
    if num_tasks == 0 {
        warn!("No valid MD5 records found in JSON report, nothing to verify.");
        return Ok(());
    }

    info!(
        "Found {} files to verify using {} threads",
        num_tasks,
        rayon::current_num_threads()
    );

    let pb = ProgressBar::new(num_tasks as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({percent}%) | {per_sec} | ETA: {eta}")?
            .progress_chars("##-"),
    );
    pb.enable_steady_tick(Duration::from_millis(100));

    let mp = GLOBAL_MP.clone();
    let pb = mp.add(pb);
    BARS_ACTIVE.store(true, Ordering::Relaxed);

    let has_failures = Arc::new(AtomicBool::new(false));

    let results: Vec<VerificationResult> = tasks
        .par_iter()
        .progress_with(pb)
        .map(|task| {
            let result = verify_file_task(task, cli.buffer_size);
            if result.status == "FAIL" {
                has_failures.store(true, Ordering::Relaxed);
                error!(
                    "[FAIL] Sample: {}, File: {}, Reason: {}",
                    task.sample_name,
                    task.file_to_check.display(),
                    result.message
                );
                if result.message == "MD5 mismatch" {
                    error!("    - Expected: {}", result.expected_md5);
                    error!("    - Actual:   {}", result.actual_md5);
                }
            }
            result
        })
        .collect();

    BARS_ACTIVE.store(false, Ordering::Relaxed);

    if let Some(output_path) = &cli.output {
        generate_report(&results, output_path)?;
    }

    let passed = results.iter().filter(|r| r.status == "PASS").count();
    let failed = results.iter().filter(|r| r.status == "FAIL").count();
    print_summary_line("Verification finished", passed, failed, "failed");

    if has_failures.load(Ordering::Relaxed) {
        anyhow::bail!("Errors found during verification. Check log and report for details.");
    }

    Ok(())
}
