# RNAFlow CLI

**High-Performance Bioinfo Data Delivery & QC Tool**

A unified tool for RNA-Seq QC summarization and high-speed data delivery, built with Rust for maximum performance.

## 🚀 Core Features

*   **Rust-Powered Engine**: Built with Rust for superior performance, supporting multi-threaded concurrent transfers and MD5 computation.
*   **Structured Reorganization**: Supports file matching via `pattern` and redirection/rename using `dest`.
*   **Multi-Level Verification**:
    *   **Global Check**: Generates `delivery_manifest.md5` at root containing all files.
    *   **Directory Check**: Auto-generates `MD5.txt` in each delivery subdirectory containing files in that directory.
*   **Smart Reporting**: Generates `delivery_manifest.json` for seamless integration with Quarto reporting systems.

## 📦 Installation

Install the tool using pip:

```bash
pip install rnaflow-deliver-tool
```

## 💻 Usage

### Main Interface

```
rnaflow-cli

╭───────────────────────────────────────────────╮
│                                               │
│  RNAFlow CLI                                  │
│  High-Performance Bioinfo Data Delivery & QC  │
│                                               │
╰───────────────────────────────────────────────╯

A unified tool for RNA-Seq QC summarization and high-speed data delivery.

Available Commands:
  deliver    High-performance file delivery using Rust engine
  config     Manage cloud credentials (encrypted)

Global Options:
  -h, --help       show this help message and exit
  -v, --version    Show program's version number and exit

Version: 0.2.0
Use 'rnaflow-cli <command> -h' for command-specific help.
```

### Deliver Command

Use the `deliver` command for high-performance file delivery:

```bash
rnaflow-cli deliver [OPTIONS]
```

### Config Command

Use the `config` command to manage cloud credentials securely:

```bash
rnaflow-cli config [OPTIONS]
```

## ⚙️ Delivery Modes (`delivery_mode`)

In the configuration file, you can specify how files are processed using `delivery_mode`:

| Mode | Description | Advantages | Disadvantages |
| :--- | :--- | :--- | :--- |
| `copy` | **Physical Copy**. Files are fully copied to the destination. | Delivered results are completely independent; moving or deleting source code doesn't affect delivered data. | Consumes disk space, slower for large files. |
| `symlink` | **Symbolic Link**. Creates a shortcut pointing to the source. | Instant, no extra disk space required. | Links become invalid if source is moved or deleted. |
| `hardlink` | **Hard Link**. Creates a new file entry pointing to the same physical data. | Instant, no space usage, delivered data remains valid after source deletion. | Cannot cross partitions/disks, doesn't support directories (tool automatically hard-links directory contents). |

## 📝 Configuration Guide (`full_delivery_config.yaml`)

The configuration file supports different types of delivery patterns:

```yaml
data_delivery:
  delivery_mode: copy        # Set delivery mode (copy, symlink, hardlink)
  output_dir: ./full_delivery
  threads: 8

  include_patterns:
    # Type "file": Deliver individual files with optional renaming
    - pattern: "01.qc/.../multiqc_fastq_screen.txt"
      dest: "Summary/fastq_screen_result.txt"
      type: "file"

    # Type "dir": Deliver entire directories with all contents
    - pattern: "02.mapping/"
      dest: "02_Mapping/"
      type: "dir"

    # File delivery with renaming
    - pattern: "02.mapping/*.bam"
      dest: "02_Mapping/BAM/"
      type: "file"
```

### Pattern Types

*   **`type: "file"`**: Used for delivering individual files. Allows for file renaming and reorganization.
    *   Can match specific files and rename them during delivery
    *   Can place files in specific destination directories
    *   Supports wildcards and recursive patterns

*   **`type: "dir"`**: Used for delivering entire directories. All contents of the matched directory will be delivered.
    *   Delivers the entire directory structure and all files within
    *   Maintains the internal structure of the directory
    *   Useful for delivering complete analysis results organized in folders

## 📂 Delivery Result Example

```text
delivery_output/
├── 01_QC/
│   ├── Reports/
│   │   ├── sample1_report.html
│   │   └── MD5.txt              <-- Directory checksum
├── delivery_manifest.json       <-- Automated report mapping
├── delivery_manifest.md5        <-- Global checksum file
└── ...
```

## ☁️ Cloud Delivery (S3/TOS)

Use the `--cloud` parameter to enable cloud mode (in this mode `delivery_mode` is ignored, always uses upload mode).

## 📄 License

This project is licensed under the **CC BY-NC 4.0** (Creative Commons Attribution-NonCommercial 4.0 International) license.

This means you are free to:
*   **Share** — copy and redistribute the material in any medium or format
*   **Adapt** — remix, transform, and build upon the material

Under the following terms:
*   **Attribution** — You must give appropriate credit to the original author
*   **NonCommercial** — You may not use the material for commercial purposes

See the LICENSE file for full details.
