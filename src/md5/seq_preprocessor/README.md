# seq_preprocessor

A Rust tool for automatically organizing sequencing data from various sources. It supports paired-end (PE) and single-end (SE) data and unifies naming and directory structure.

## Features

- 🔗 **Symlink mode**: Uses symbolic links on Unix systems without consuming extra disk space.
- 🧬 **Multiple format support**: Supports Illumina, SRA (SRR/ERR/DRR), Generic, and other naming formats.
- 🔄 **PE/SE auto-detection**: Automatically distinguishes paired-end (Short-read) and single-end (Long-read) data.
- 📝 **MD5 checksums**: Parses and generates MD5 checksum files.
- 📊 **JSON report**: Generates a detailed sample renaming report.
- 🏷️ **Sample renaming**: Batch-renames samples via a CSV sample sheet.
- 📜 **Structured logging**: Supports `--log-level` / `--log-format`; log files are automatically named with timestamps.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd seq_preprocessor

# Build the release binary
cargo build --release

# The binary is located at target/release/seq_preprocessor
```

## Usage

### Basic usage

```bash
# Process a single input directory
seq_preprocessor -i /path/to/raw_data -o /path/to/output

# Process multiple input directories
seq_preprocessor -i /data/batch1 -i /data/batch2 -o ./output

# Process PE data only
seq_preprocessor -i /path/to/data -o ./output --library-type short-read

# Process SE data only
seq_preprocessor -i /path/to/data -o ./output --library-type long-read
```

### Advanced options

```bash
# Generate a combined MD5 file
seq_preprocessor -i ./raw -o ./output --summary-md5 checksums.txt

# Generate a JSON report
seq_preprocessor -i ./raw -o ./output --json-report report.json

# Rename using a sample sheet
seq_preprocessor -i ./raw -o ./output --sample-sheet rename.csv

# Disable per-sample MD5 files
seq_preprocessor -i ./raw -o ./output --no-per-sample-md5

# Use JSON-format console logs
seq_preprocessor -i ./raw -o ./output --log-format json

# Adjust console log level (RUST_LOG env var is also supported)
seq_preprocessor -i ./raw -o ./output --log-level debug
```

> Log files are automatically named with timestamps (e.g. `seq_preprocessor_2026-07-22_14-47-15.log`) and saved under `--output`. Use `--log-file` to override the path.

## Supported file formats

### Paired-end (PE) formats

| Format type | Example filename | Extracted sample name |
|-------------|------------------|-----------------------|
| **Illumina** | `sample_S1_L001_R1_001.fastq.gz` | `sample` |
| **Underscore-separated** | `sample_R1.clean.fastq.gz` | `sample` |
| **Dot-separated** | `sample.1.trimmed.fq.gz` | `sample` |
| **With middle suffix** | `sample_R1.filtered.fastq.gz` | `sample` |
| **With .raw** | `sample.R1.raw.fq.gz` | `sample` |
| **SRA** | `SRR123456_1.fastq.gz` | `SRR123456` |

### Single-end (SE) formats

| Format type | Example filename | Extracted sample name |
|-------------|------------------|-----------------------|
| **Generic** | `sample.fq.gz` | `sample` |
| **SRA** | `ERR123456.fastq.gz` | `ERR123456` |

### Supported middle suffixes

`.clean`, `.trimmed`, `.trim`, `.filtered`, `.filter`, `.qc`, `.val`, `.processed`, `.raw`, etc.

## Sample sheet format

The CSV file must contain the following headers:

```csv
sample,sample_name
WT-1,WildType_Rep1
KO-1,Knockout_Rep1
SRR123456,Control_1
```

- `sample`: The sample name as it appears in the original filename.
- `sample_name`: The new sample name.

## Output structure

```
output/
├── sampleA/
│   ├── sampleA_R1.fq.gz -> /original/path/sampleA_R1.clean.fastq.gz
│   ├── sampleA_R2.fq.gz -> /original/path/sampleA_R2.clean.fastq.gz
│   └── md5.txt
├── sampleB/
│   ├── sampleB_R1.fq.gz -> /original/path/sampleB_1.fastq.gz
│   ├── sampleB_R2.fq.gz -> /original/path/sampleB_2.fastq.gz
│   └── md5.txt
├── Nanopore/
│   ├── Nanopore.fq.gz -> /original/path/Nanopore_reads.fq.gz
│   └── md5.txt
└── (optional) checksums.txt
```

## Command-line options

```
Usage: seq_preprocessor [OPTIONS] --input <INPUT>... --output <OUTPUT>

Options:
  -i, --input <INPUT>...         Root directory(ies) containing raw data. Can be specified multiple times
  -o, --output <OUTPUT>          Output directory for organized data
      --md5-name <MD5_NAME>      Name of the per-sample MD5 file created inside each sample folder [default: md5.txt]
      --summary-md5 <SUMMARY_MD5>  Create a combined MD5 file at the top level of the output directory
      --no-per-sample-md5        Do not create per-sample MD5 files in sample subdirectories
      --json-report <JSON_REPORT>  Generate a JSON renaming report
      --sample-sheet <SAMPLE_SHEET>  Optional CSV file with sample renaming rules
      --library-type <LIBRARY_TYPE>  Library type to process [default: auto]
                                   [possible values: short-read, long-read, auto]
      --log-file <FILE>          Log file path (auto-generated timestamped log by default)
      --log-level <LOG_LEVEL>    Console log level [default: info]
      --log-format <LOG_FORMAT>  Console log format [default: text]
                                   [possible values: text, json]
  -h, --help                     Print help
  -V, --version                  Print version
```

## Examples

### Example 1: Basic data processing

```bash
seq_preprocessor -i ./raw_fastq -o ./processed
```

### Example 2: Full workflow

```bash
# 1. Process data and generate reports
seq_preprocessor \
  -i ./raw_data \
  -o ./standardized \
  --summary-md5 md5_all.txt \
  --json-report rename_report.json \
  --sample-sheet sample_info.csv

# 2. Inspect the generated directory structure
tree ./standardized

# 3. Verify MD5 checksums
cd ./standardized && md5sum -c md5_all.txt
```

### Example 3: Process data from different sources

```bash
# Combine Illumina, SRA, and clean data
seq_preprocessor \
  -i ./illumina_data \
  -i ./sra_downloads \
  -i ./clean_data \
  -o ./combined_analysis \
  --library-type auto
```

## Dependencies

- Rust 1.70+
- Supported systems: Linux, macOS (Windows uses file copy instead of symlinks)

## License

MIT

## Contributing

Issues and Pull Requests are welcome!
