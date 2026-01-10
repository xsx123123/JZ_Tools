# RNAFlow Delivery Tool

**A High-Performance, Rust-Accelerated Data Delivery System for Bio-Informatics Pipelines.**

This tool is designed to organize, filter, and transfer analysis results from complex directory structures (like Snakemake outputs) to a clean, structured delivery folder (Local or Cloud Object Storage).

## 🚀 Key Features

*   **Rust Core**: Powered by a Rust backend (`data_deliver_rs`) for multi-threaded, high-throughput file transfer and MD5 calculation.
*   **Structured Delivery**: Supports mapping flat or nested source files into specific destination subdirectories via configuration.
*   **Smart Reporting**: Generates a `delivery_manifest.json` containing metadata and exact file paths for downstream reporting (e.g., Quarto).
*   **Cloud Ready**: Native support for S3-compatible Object Storage (AWS S3, Volcengine TOS, etc.) with multipart upload.
*   **Integrity Check**: Automatically calculates and validates MD5 checksums.

## 🛠️ Installation & Setup

Ensure the Rust extension is compiled and the Python environment is set up.

```bash
# 1. Compile Rust Backend
cd src
cargo build --release
cp target/release/libdata_deliver_rs.so ../python/RNAFlow_Deliver/data_deliver_rs.so

# 2. Add to PYTHONPATH
export PYTHONPATH=$PYTHONPATH:$(pwd)/python
```

## 📖 Usage

### CLI Command

```bash
python3 python/RNAFlow_Deliver/cli.py deliver \
    --data-dir ./pipeline_results \
    --output-dir ./delivery_output \
    --config config/full_delivery_config.yaml
```

### Configuration (`config.yaml`)

The configuration supports flexible pattern matching and directory mapping:

```yaml
data_delivery:
  output_dir: ./final_delivery
  threads: 8
  
  include_patterns:
    # 1. Simple Copy: Matches files and copies them to the delivery root
    - "summary_table.csv"
    
    # 2. Structured Copy: Matches files and places them into 'dest' subdir
    - pattern: "02.mapping/*.bam"
      dest: "02_Mapping/BAM"
      
    - pattern: "01.qc/*.html"
      dest: "01_QC/Reports"
```

## 📊 Output Structure

The tool organizes output based on your config and generates a manifest:

```text
delivery_output/
├── 01_QC/
│   └── Reports/
├── 02_Mapping/
│   └── BAM/
├── delivery_manifest.json  <-- Key artifact for reporting
└── delivery_manifest.md5   <-- MD5 checksums
```

### JSON Manifest Format

```json
{
    "meta": {
        "timestamp": "2026-01-10T12:00:00",
        "success": 150,
        "failed": 0,
        "size_gb": 12.5,
        "mode": "local"
    },
    "files": {
        "sample1.bam": "/abs/path/to/delivery/02_Mapping/BAM/sample1.bam",
        "report.html": "/abs/path/to/delivery/01_QC/Reports/report.html"
    }
}
```

## ☁️ Cloud Mode

To upload directly to S3/TOS:

```bash
python3 cli.py deliver \
    --cloud \
    --bucket my-bucket \
    --prefix project_123/ \
    ...
```

*Note: Credentials can be set via env vars (`TOS_ACCESS_KEY`, `TOS_SECRET_KEY`) or the `config` command.*
