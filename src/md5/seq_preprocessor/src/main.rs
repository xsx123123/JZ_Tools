use anyhow::{Context, Result};
use chrono::Local;
use clap::builder::styling::{AnsiColor, Effects, Styles};
use clap::{Parser, ValueEnum};
use nu_ansi_term::{Color, Style};
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::fs::read_link;
use std::io::{self, BufRead, BufReader, Write as _};
use std::path::PathBuf;
use std::sync::LazyLock;
use tracing::{info, warn, Event, Subscriber};
use tracing_subscriber::fmt::format::{FormatEvent, FormatFields, Writer};
use tracing_subscriber::fmt::FmtContext;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{fmt, layer::SubscriberExt, EnvFilter, Layer};
use walkdir::WalkDir;

use indicatif::MultiProgress;

// --- Shared types ---

#[derive(Debug, Clone, clap::ValueEnum)]
enum LogFormat {
    Text,
    Json,
}

#[cfg(unix)]
use std::os::unix::fs::symlink;

// --- Data structures ---

#[derive(Debug)]
struct SampleFileInfo {
    sample_name: String,
    read_pair: String,
    original_path: PathBuf,
    is_sra: bool,
}

#[derive(Debug)]
struct SingleEndFileInfo {
    sample_name: String,
    original_path: PathBuf,
    is_sra: bool,
}

#[derive(Debug, Default)]
struct PeSampleFiles {
    r1: Option<PathBuf>,
    r2: Option<PathBuf>,
    r1_is_sra: bool,
    r2_is_sra: bool,
}

#[derive(Serialize, Debug)]
struct RenamingReportEntry {
    sample_name: String,
    library_type: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    new_r1_path_relative: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    new_r2_path_relative: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    original_r1_path_absolute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    original_r2_path_absolute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    md5_r1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    md5_r2: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    new_se_path_relative: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    original_se_path_absolute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    md5_se: Option<String>,
}

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum LibraryType {
    ShortRead,
    LongRead,
    Auto,
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
\x1b[1;37m    ███████╗███████╗ ██████╗     ██████╗ ██████╗ ███████╗██████╗  █████╗ ████████╗ ██████╗ ██████╗ \x1b[0m\n\
\x1b[1;37m    ██╔════╝██╔════╝██╔═══██╗    ██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗\x1b[0m\n\
\x1b[1;37m    ███████╗█████╗  ██║   ██║    ██████╔╝██████╔╝█████╗  ██████╔╝███████║   ██║   ██║   ██║██████╔╝\x1b[0m\n\
\x1b[1;37m    ╚════██║██╔══╝  ██║▄▄ ██║    ██╔═══╝ ██╔══██╗██╔══╝  ██╔══██╗██╔══██║   ██║   ██║   ██║██╔══██╗\x1b[0m\n\
\x1b[1;37m    ███████║███████╗╚██████╔╝    ██║     ██║  ██║███████╗██║  ██║██║  ██║   ██║   ╚██████╔╝██║  ██║\x1b[0m\n\
\x1b[1;37m    ╚══════╝╚══════╝ ╚══▀▀═╝    ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝\x1b[0m\n\
\x1b[36m         Sequencing Data Preprocessor  │  Rename & Organize\x1b[0m\n";

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about,
    long_about = None,
    name = "seq_preprocessor",
    color = clap::ColorChoice::Always,
    styles = HELP_STYLES,
    before_help = HELP_LOGO,
    help_template = r#"{before-help}
{about-with-newline}
{usage-heading} {usage}

{all-args}
"#
)]
#[command(about = "Automatically organize sequencing data from various sources (Short-read and Long-read) with unified naming and directory structure.")]
struct Cli {
    /// Root directory(ies) containing raw data. Can be specified multiple times.
    #[arg(short, long, num_args = 1..)]
    input: Vec<PathBuf>,

    /// Output directory for organized data.
    #[arg(short, long)]
    output: PathBuf,

    /// Name of the per-sample MD5 file created inside each sample folder.
    #[arg(long, default_value = "md5.txt")]
    md5_name: String,

    /// Create a combined MD5 file at the top level of the output directory.
    #[arg(long)]
    summary_md5: Option<PathBuf>,

    /// Do not create per-sample MD5 files in sample subdirectories.
    #[arg(long)]
    no_per_sample_md5: bool,

    /// Generate a JSON renaming report.
    #[arg(long)]
    json_report: Option<PathBuf>,

    /// Optional CSV file with sample renaming rules.
    #[arg(long)]
    sample_sheet: Option<PathBuf>,

    /// Library type to process.
    #[arg(long, value_enum, default_value_t = LibraryType::Auto)]
    library_type: LibraryType,

    /// Log file path. If not provided, a timestamped log file is created automatically.
    #[arg(long, value_name = "FILE")]
    log_file: Option<PathBuf>,

    /// Console log level.
    #[arg(long, default_value = "info")]
    log_level: String,

    /// Console log format.
    #[arg(long, default_value = "text")]
    log_format: LogFormat,
}

// --- Logging infrastructure ---

/// Global MultiProgress instance used to render log lines above active progress bars.
static GLOBAL_MP: std::sync::LazyLock<MultiProgress> =
    std::sync::LazyLock::new(MultiProgress::new);

/// Tracks whether any progress bars are currently active.
static BARS_ACTIVE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Custom writer: routes through MultiProgress::println when progress bars are active,
/// otherwise writes directly to stderr to avoid overlapping logs and bars.
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
                if BARS_ACTIVE.load(std::sync::atomic::Ordering::Relaxed) {
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
    output_dir: &PathBuf,
    log_file_override: Option<&PathBuf>,
    log_level: &str,
    log_format: &LogFormat,
) -> Result<()> {
    let log_path = if let Some(path) = log_file_override {
        path.to_path_buf()
    } else {
        let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");
        let log_name = format!("seq_preprocessor_{}.log", timestamp);
        output_dir.join(log_name)
    };

    if let Some(parent_dir) = log_path.parent() {
        fs::create_dir_all(parent_dir)?;
    }
    let file = fs::File::create(&log_path)?;

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
        "    ███████╗███████╗ ██████╗     ██████╗ ██████╗ ███████╗██████╗  █████╗ ████████╗ ██████╗ ██████╗ ",
        "    ██╔════╝██╔════╝██╔═══██╗    ██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗",
        "    ███████╗█████╗  ██║   ██║    ██████╔╝██████╔╝█████╗  ██████╔╝███████║   ██║   ██║   ██║██████╔╝",
        "    ╚════██║██╔══╝  ██║▄▄ ██║    ██╔═══╝ ██╔══██╗██╔══╝  ██╔══██╗██╔══██║   ██║   ██║   ██║██╔══██╗",
        "    ███████║███████╗╚██████╔╝    ██║     ██║  ██║███████╗██║  ██║██║  ██║   ██║   ╚██████╔╝██║  ██║",
        "    ╚══════╝╚══════╝ ╚══▀▀═╝    ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝",
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
        Color::Cyan.paint(center("Sequencing Data Preprocessor  │  Rename & Organize"))
    );
    println!();
    println!("{}", Color::Cyan.paint(center("Order emerges from careful naming.")));
    println!();
}

// --- Helper functions ---

static RE_ILLUMINA: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(.*?)_S\d+_L\d+_([Rr][12])_\d+\.f(ast)?q\.gz$").unwrap()
});
static RE_GENERIC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(.+?)[\._]([Rr][12]|[12])(?:\.[a-zA-Z0-9_-]+)?\.f(ast)?q\.gz$").unwrap()
});
static RE_WITH_RAW: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(.+)\.([Rr][12])\.raw\.f(ast)?q\.gz$").unwrap());
static RE_LONG_READ: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(.*?)(\.f(ast)?q\.gz)$").unwrap());
static RE_SRA_PE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([SED]RR\d+)[\._]([12])\.f(ast)?q\.gz$").unwrap());
static RE_SRA_SINGLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([SED]RR\d+)\.f(ast)?q\.gz$").unwrap());

/// Return the file name of `path` as a lossy String.
fn file_name_str(path: &PathBuf) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

#[cfg(unix)]
fn process_file_link(
    new_path: &PathBuf,
    original_path: &PathBuf,
    read_name: &str,
    sample_name: &str,
) -> Result<()> {
    if new_path.exists() {
        match read_link(new_path) {
            Ok(target) => {
                let same_target = fs::canonicalize(&target)
                    .ok()
                    .zip(fs::canonicalize(original_path).ok())
                    .map(|(a, b)| a == b)
                    .unwrap_or(false);
                if same_target {
                    info!(
                        "  File {} ({}) already exists with correct target, skipping",
                        file_name_str(new_path),
                        read_name
                    );
                    return Ok(());
                } else {
                    warn!(
                        "  File {} ({}) exists but points to wrong target (current: {}, expected: {}), rebuilding...",
                        file_name_str(new_path),
                        read_name,
                        target.display(),
                        original_path.display()
                    );
                    fs::remove_file(new_path)
                        .context(format!("Cannot remove old file/link: {}", new_path.display()))?;
                }
            }
            Err(_) => {
                warn!(
                    "  File {} ({}) exists but is not a valid symlink, rebuilding...",
                    file_name_str(new_path),
                    read_name,
                );
                fs::remove_file(new_path)
                    .context(format!("Cannot remove old file: {}", new_path.display()))?;
            }
        }
    }

    symlink(original_path, new_path).context(format!(
        "Cannot create symlink for sample {} {}: {}",
        sample_name,
        read_name,
        new_path.display()
    ))?;
    info!(
        "  Created symlink {}: {}",
        read_name,
        file_name_str(new_path)
    );
    Ok(())
}

#[cfg(not(unix))]
fn process_file_copy(
    new_path: &PathBuf,
    original_path: &PathBuf,
    read_name: &str,
    _sample_name: &str,
) -> Result<()> {
    if new_path.exists() {
        info!(
            "  File {} ({}) already exists, skipping copy",
            file_name_str(new_path),
            read_name
        );
    } else {
        fs::copy(original_path, new_path)
            .context(format!("Cannot copy file: {}", new_path.display()))?;
        info!(
            "  Copied file {}: {}",
            read_name,
            file_name_str(new_path)
        );
    }
    Ok(())
}

// --- Main ---

fn main() -> Result<()> {
    let cli = Cli::parse();

    print_banner();
    setup_logging(
        &cli.output,
        cli.log_file.as_ref(),
        &cli.log_level,
        &cli.log_format,
    )?;

    // 0. Load sample sheet
    let mut sample_rename_map: HashMap<String, String> = HashMap::new();
    if let Some(sheet_path) = &cli.sample_sheet {
        if !sheet_path.exists() {
            anyhow::bail!("Sample sheet file not found: {}", sheet_path.display());
        }
        info!("Loading sample sheet: {}", sheet_path.display());
        let file = fs::File::open(sheet_path)?;
        let mut rdr = csv::Reader::from_reader(file);

        let headers = rdr.headers()?;
        let sample_idx = headers
            .iter()
            .position(|h| h == "sample")
            .context("CSV missing 'sample' column")?;
        let name_idx = headers
            .iter()
            .position(|h| h == "sample_name")
            .context("CSV missing 'sample_name' column")?;

        for result in rdr.records() {
            let record = result?;
            let original_name = record.get(sample_idx).unwrap_or_default().trim().to_string();
            let new_name = record.get(name_idx).unwrap_or_default().trim().to_string();
            if !original_name.is_empty() && !new_name.is_empty() {
                sample_rename_map.insert(original_name, new_name);
            }
        }
        info!("Loaded {} renaming rules", sample_rename_map.len());
    }

    fs::create_dir_all(&cli.output)
        .context(format!("Cannot create output directory: {}", cli.output.display()))?;

    // 1. Collect all FASTQ and MD5 file information
    let mut pe_fastq_files: Vec<SampleFileInfo> = Vec::new();
    let mut se_fastq_files: Vec<SingleEndFileInfo> = Vec::new();
    let mut md5_files: Vec<PathBuf> = Vec::new();
    let mut unmatched_fastq_files: Vec<PathBuf> = Vec::new();

    for input_path in &cli.input {
        if !input_path.exists() {
            anyhow::bail!("Input path does not exist: {}", input_path.display());
        }
        info!("Scanning input directory: {}", input_path.display());

        for entry in WalkDir::new(input_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                let file_name = match path.file_name().and_then(|s| s.to_str()) {
                    Some(name) => name,
                    None => continue,
                };

                let mut matched = false;

                if !matched
                    && (cli.library_type == LibraryType::Auto
                        || cli.library_type == LibraryType::ShortRead)
                {
                    if let Some(caps) = RE_SRA_PE.captures(file_name) {
                        if let (Some(accession), Some(pair_cap)) = (caps.get(1), caps.get(2)) {
                            let read_pair = match pair_cap.as_str() {
                                "1" => "R1".to_string(),
                                "2" => "R2".to_string(),
                                _ => unreachable!(),
                            };
                            pe_fastq_files.push(SampleFileInfo {
                                sample_name: accession.as_str().to_string(),
                                read_pair,
                                original_path: path.to_path_buf(),
                                is_sra: true,
                            });
                            matched = true;
                        }
                    }
                }

                if !matched
                    && (cli.library_type == LibraryType::Auto
                        || cli.library_type == LibraryType::ShortRead)
                {
                    if let Some(caps) = RE_ILLUMINA.captures(file_name) {
                        if let (Some(sample), Some(pair_cap)) = (caps.get(1), caps.get(2)) {
                            let read_pair = if pair_cap.as_str().to_lowercase() == "r1" {
                                "R1"
                            } else {
                                "R2"
                            }
                            .to_string();
                            pe_fastq_files.push(SampleFileInfo {
                                sample_name: sample.as_str().to_string(),
                                read_pair,
                                original_path: path.to_path_buf(),
                                is_sra: false,
                            });
                            matched = true;
                        }
                    }
                }

                if !matched
                    && (cli.library_type == LibraryType::Auto
                        || cli.library_type == LibraryType::ShortRead)
                {
                    if let Some(caps) = RE_WITH_RAW.captures(file_name) {
                        if let (Some(sample), Some(pair_cap)) = (caps.get(1), caps.get(2)) {
                            let read_pair = if pair_cap.as_str().to_lowercase() == "r1" {
                                "R1"
                            } else {
                                "R2"
                            }
                            .to_string();
                            pe_fastq_files.push(SampleFileInfo {
                                sample_name: sample.as_str().to_string(),
                                read_pair,
                                original_path: path.to_path_buf(),
                                is_sra: false,
                            });
                            matched = true;
                        }
                    }
                }

                if !matched
                    && (cli.library_type == LibraryType::Auto
                        || cli.library_type == LibraryType::ShortRead)
                {
                    if let Some(caps) = RE_GENERIC.captures(file_name) {
                        if let (Some(sample), Some(pair_cap)) = (caps.get(1), caps.get(2)) {
                            let read_pair = match pair_cap.as_str().to_lowercase().as_str() {
                                "r1" | "1" => "R1".to_string(),
                                "r2" | "2" => "R2".to_string(),
                                _ => unreachable!(),
                            };
                            pe_fastq_files.push(SampleFileInfo {
                                sample_name: sample.as_str().to_string(),
                                read_pair,
                                original_path: path.to_path_buf(),
                                is_sra: false,
                            });
                            matched = true;
                        }
                    }
                }

                if !matched
                    && (cli.library_type == LibraryType::Auto
                        || cli.library_type == LibraryType::LongRead)
                {
                    if file_name.ends_with(".fq.gz") || file_name.ends_with(".fastq.gz") {
                        if let Some(caps) = RE_SRA_SINGLE.captures(file_name) {
                            if let Some(accession) = caps.get(1) {
                                se_fastq_files.push(SingleEndFileInfo {
                                    sample_name: accession.as_str().to_string(),
                                    original_path: path.to_path_buf(),
                                    is_sra: true,
                                });
                                matched = true;
                            }
                        }
                    }
                }

                if !matched
                    && (cli.library_type == LibraryType::Auto
                        || cli.library_type == LibraryType::LongRead)
                {
                    if file_name.ends_with(".fq.gz") || file_name.ends_with(".fastq.gz") {
                        if let Some(caps) = RE_LONG_READ.captures(file_name) {
                            if let Some(sample) = caps.get(1) {
                                se_fastq_files.push(SingleEndFileInfo {
                                    sample_name: sample.as_str().to_string(),
                                    original_path: path.to_path_buf(),
                                    is_sra: false,
                                });
                                matched = true;
                            }
                        }
                    }
                }

                if !matched {
                    if file_name.ends_with(".fq.gz") || file_name.ends_with(".fastq.gz") {
                        unmatched_fastq_files.push(path.to_path_buf());
                    } else if file_name.to_lowercase().contains("md5") && file_name.ends_with(".txt")
                    {
                        md5_files.push(path.to_path_buf());
                    }
                }
            }
        }
    }

    if !unmatched_fastq_files.is_empty() {
        let mut error_message =
            "Error: The following FASTQ files do not match expected naming patterns:\n".to_string();
        for path in &unmatched_fastq_files {
            error_message.push_str(&format!("  - {}\n", path.display()));
        }
        error_message.push_str("\nExpected patterns based on --library-type:\n");
        if cli.library_type == LibraryType::Auto || cli.library_type == LibraryType::ShortRead {
            error_message.push_str(
                "  1. PE (Illumina): <sample>_S..._L..._R[12]_...fq.gz\n",
            );
            error_message.push_str(
                "  2. PE (with .raw): <sample>.<R1/R2>.raw.fq.gz\n",
            );
            error_message.push_str(
                "  3. PE (Generic): <sample>[._][R12|12][.suffix].fq.gz\n",
            );
            error_message.push_str(
                "  4. PE (SRA): [SED]RR#######[._][12].fq.gz\n",
            );
        }
        if cli.library_type == LibraryType::Auto || cli.library_type == LibraryType::LongRead {
            error_message.push_str("  5. SE: <sample>.fq.gz\n");
            error_message.push_str("  6. SE (SRA): [SED]RR#######.fq.gz\n");
        }
        anyhow::bail!(error_message);
    }

    info!(
        "Scan complete: {} PE files, {} SE files, {} MD5 files",
        pe_fastq_files.len(),
        se_fastq_files.len(),
        md5_files.len()
    );

    // 2. Parse all MD5 files
    let mut checksum_map: HashMap<String, String> = HashMap::new();
    info!("Parsing MD5 files...");
    for md5_file_path in &md5_files {
        let file = fs::File::open(md5_file_path)?;
        let reader = BufReader::new(file);
        for line in reader.lines().filter_map(|l| l.ok()) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }
            let checksum = parts[0].to_string();
            let original_filename = PathBuf::from(parts[1])
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if !original_filename.is_empty() {
                checksum_map.insert(original_filename, checksum);
            }
        }
    }
    info!("MD5 parsing complete: {} records loaded", checksum_map.len());

    // 3. Organize PE samples
    let mut pe_samples: HashMap<String, PeSampleFiles> = HashMap::new();
    for file_info in &pe_fastq_files {
        let entry = pe_samples
            .entry(file_info.sample_name.clone())
            .or_default();
        if file_info.read_pair == "R1" {
            entry.r1 = Some(file_info.original_path.clone());
            entry.r1_is_sra = file_info.is_sra;
        } else if file_info.read_pair == "R2" {
            entry.r2 = Some(file_info.original_path.clone());
            entry.r2_is_sra = file_info.is_sra;
        }
    }

    let pe_count = pe_samples.len();
    let se_count = se_fastq_files.len();
    info!("Organized {} PE samples", pe_count);
    info!("Found {} SE samples", se_count);

    let mut summary_md5_lines: Vec<String> = Vec::new();
    let mut json_report_entries: Vec<RenamingReportEntry> = Vec::new();

    // 5. Process PE samples
    for (sample_name, pe_files) in pe_samples {
        let final_sample_name = if let Some(new_name) = sample_rename_map.get(&sample_name) {
            info!("Processing PE sample: {} -> {} (renamed)", sample_name, new_name);
            new_name.clone()
        } else {
            info!("Processing PE sample: {}", sample_name);
            sample_name.clone()
        };

        let (original_r1, original_r2) = match (pe_files.r1, pe_files.r2) {
            (Some(r1), Some(r2)) => (r1, r2),
            _ => {
                warn!("Sample {} missing R1 or R2 file, skipping", sample_name);
                continue;
            }
        };

        let sample_output_dir = cli.output.join(&final_sample_name);
        fs::create_dir_all(&sample_output_dir)
            .context(format!("Cannot create directory for sample {}", final_sample_name))?;

        let new_r1_name = format!("{}_R1.fq.gz", final_sample_name);
        let new_r2_name = format!("{}_R2.fq.gz", final_sample_name);
        let new_r1_path = sample_output_dir.join(&new_r1_name);
        let new_r2_path = sample_output_dir.join(&new_r2_name);

        #[cfg(unix)]
        {
            process_file_link(&new_r1_path, &original_r1, "R1", &final_sample_name)?;
            process_file_link(&new_r2_path, &original_r2, "R2", &final_sample_name)?;
        }
        #[cfg(not(unix))]
        {
            process_file_copy(&new_r1_path, &original_r1, "R1", &final_sample_name)?;
            process_file_copy(&new_r2_path, &original_r2, "R2", &final_sample_name)?;
        }

        let original_r1_filename = file_name_str(&original_r1);
        let original_r2_filename = file_name_str(&original_r2);

        let checksum_r1 = if pe_files.r1_is_sra {
            Some("SRA".to_string())
        } else {
            checksum_map.get(&original_r1_filename).cloned()
        };
        let checksum_r2 = if pe_files.r2_is_sra {
            Some("SRA".to_string())
        } else {
            checksum_map.get(&original_r2_filename).cloned()
        };

        if !cli.no_per_sample_md5 {
            let mut per_sample_md5_content = String::new();
            if let Some(c) = &checksum_r1 {
                per_sample_md5_content.push_str(&format!("{}  {}\n", c, new_r1_name));
            }
            if let Some(c) = &checksum_r2 {
                per_sample_md5_content.push_str(&format!("{}  {}\n", c, new_r2_name));
            }

            if !per_sample_md5_content.is_empty() {
                let per_sample_md5_path = sample_output_dir.join(&cli.md5_name);
                fs::write(&per_sample_md5_path, per_sample_md5_content).context(format!(
                    "Cannot write sample MD5 file: {}",
                    per_sample_md5_path.display()
                ))?;
                info!("  Generated sample MD5 file: {}", cli.md5_name);
            }
        }

        let relative_r1_path = PathBuf::from(&final_sample_name).join(&new_r1_name);
        let relative_r2_path = PathBuf::from(&final_sample_name).join(&new_r2_name);
        if let Some(c) = &checksum_r1 {
            summary_md5_lines.push(format!("{}  {}", c, relative_r1_path.display()));
        }
        if let Some(c) = &checksum_r2 {
            summary_md5_lines.push(format!("{}  {}", c, relative_r2_path.display()));
        }

        if cli.json_report.is_some() {
            json_report_entries.push(RenamingReportEntry {
                sample_name: final_sample_name.clone(),
                library_type: "PE".to_string(),

                new_r1_path_relative: Some(relative_r1_path.to_string_lossy().to_string()),
                original_r1_path_absolute: Some(
                    fs::canonicalize(&original_r1)?.to_string_lossy().to_string(),
                ),
                new_r2_path_relative: Some(relative_r2_path.to_string_lossy().to_string()),
                original_r2_path_absolute: Some(
                    fs::canonicalize(&original_r2)?.to_string_lossy().to_string(),
                ),
                md5_r1: checksum_r1,
                md5_r2: checksum_r2,

                new_se_path_relative: None,
                original_se_path_absolute: None,
                md5_se: None,
            });
        }
    }

    // 6. Process SE samples
    for se_file_info in &se_fastq_files {
        let original_sample_name = &se_file_info.sample_name;
        let original_path = &se_file_info.original_path;
        let is_se_sra = se_file_info.is_sra;

        let final_sample_name = if let Some(new_name) = sample_rename_map.get(original_sample_name)
        {
            info!(
                "Processing SE sample: {} -> {} (renamed)",
                original_sample_name, new_name
            );
            new_name.clone()
        } else {
            info!("Processing SE sample: {}", original_sample_name);
            original_sample_name.clone()
        };

        let sample_output_dir = cli.output.join(&final_sample_name);
        fs::create_dir_all(&sample_output_dir).context(format!(
            "Cannot create directory for SE sample {}",
            final_sample_name
        ))?;

        let new_se_name = format!("{}.fq.gz", final_sample_name);
        let new_se_path = sample_output_dir.join(&new_se_name);

        #[cfg(unix)]
        {
            process_file_link(&new_se_path, original_path, "SE", &final_sample_name)?;
        }
        #[cfg(not(unix))]
        {
            process_file_copy(&new_se_path, original_path, "SE", &final_sample_name)?;
        }

        let original_se_filename = file_name_str(original_path);

        let checksum_se = if is_se_sra {
            Some("SRA".to_string())
        } else {
            checksum_map.get(&original_se_filename).cloned()
        };

        if !cli.no_per_sample_md5 {
            let mut per_sample_md5_content = String::new();
            if let Some(c) = &checksum_se {
                per_sample_md5_content.push_str(&format!("{}  {}\n", c, new_se_name));
            }

            if !per_sample_md5_content.is_empty() {
                let per_sample_md5_path = sample_output_dir.join(&cli.md5_name);
                fs::write(&per_sample_md5_path, per_sample_md5_content).context(format!(
                    "Cannot write SE sample MD5 file: {}",
                    per_sample_md5_path.display()
                ))?;
                info!("  Generated sample MD5 file: {}", cli.md5_name);
            }
        }

        let relative_se_path = PathBuf::from(&final_sample_name).join(&new_se_name);
        if let Some(c) = &checksum_se {
            summary_md5_lines.push(format!("{}  {}", c, relative_se_path.display()));
        }

        if cli.json_report.is_some() {
            json_report_entries.push(RenamingReportEntry {
                sample_name: final_sample_name.clone(),
                library_type: "SE".to_string(),

                new_r1_path_relative: None,
                original_r1_path_absolute: None,
                new_r2_path_relative: None,
                original_r2_path_absolute: None,
                md5_r1: None,
                md5_r2: None,

                new_se_path_relative: Some(relative_se_path.to_string_lossy().to_string()),
                original_se_path_absolute: Some(
                    fs::canonicalize(original_path)?.to_string_lossy().to_string(),
                ),
                md5_se: checksum_se,
            });
        }
    }

    // 7. Generate combined MD5 and JSON report
    if let Some(summary_md5_filename) = &cli.summary_md5 {
        let summary_path = cli.output.join(summary_md5_filename);
        if !summary_md5_lines.is_empty() {
            summary_md5_lines.sort();
            let final_content = summary_md5_lines.join("\n") + "\n";
            fs::write(&summary_path, final_content).context(format!(
                "Cannot write summary MD5 file: {}",
                summary_path.display()
            ))?;
            info!("Summary MD5 file generated: {}", summary_path.display());
        } else {
            warn!("No MD5 information found, summary MD5 file not generated");
        }
    }

    if let Some(report_path) = &cli.json_report {
        if !json_report_entries.is_empty() {
            info!("Generating JSON report...");
            let report_json = serde_json::to_string_pretty(&json_report_entries)?;
            fs::write(report_path, report_json).context(format!(
                "Cannot write JSON report file: {}",
                report_path.display()
            ))?;
            info!("JSON report generated: {}", report_path.display());
        } else {
            warn!("No samples found, JSON report not generated");
        }
    }

    info!(
        "All tasks completed! Standardized data is at: {}",
        cli.output.display()
    );
    info!("Hint: On Unix systems, symlinks are used by default (no extra disk space).");
    info!("Hint: Supports Illumina, Generic, and SRA (SRR/ERR/DRR) formats.");

    print_summary_line("Preprocessing finished", pe_count, se_count);

    Ok(())
}

/// One-line summary of preprocessing results.
fn print_summary_line(label: &str, pe_count: usize, se_count: usize) {
    let head = Color::Green.bold().paint(format!("✓ {}", label));
    let pe = Color::Cyan.paint(format!("{} PE samples", pe_count));
    let se = Color::Cyan.paint(format!("{} SE samples", se_count));
    eprintln!("\n{}  ·  {}  ·  {}", head, pe, se);
}
