# RNAFlow CLI (Data Deliver Tool)

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![Rust](https://img.shields.io/badge/Core-Rust-orange)
![Python](https://img.shields.io/badge/Interface-Python%20%26%20Rich-green)

**RNAFlow CLI** 是一个高性能的生物信息学数据交付与质控汇总工具。它采用混合架构设计：Python 负责灵活的业务逻辑与解析，Rust 负责高性能的 I/O 操作、哈希计算与云端并发上传。

## ✨ 核心特性

### 1. 🧬 QC 汇总 (`qc`)
*   **多格式解析**：自动解析 FastQC (.zip), Fastp (.json), FastQ Screen (.txt) 结果。
*   **关键指标提取**：Raw/Clean Reads, Q30, GC Content, Duplication Rate, Insert Size, 物种污染比例。
*   **报表生成**：生成详细 CSV 数据表与 JSON 统计摘要，支持终端富文本预览。

### 2. 🚀 高性能交付 (`deliver`)
*   **本地交付**：支持多线程复制、硬链接 (Hardlink)、软链接 (Symlink)。
*   **云端交付**：支持直接上传到 S3 兼容对象存储 (如火山引擎 TOS)。
    *   基于 Rust `tokio` 异步运行时，支持高并发分片上传。
    *   自动计算文件 MD5 并校验。
    *   **MD5 校验和汇总**：所有文件的 MD5 校验和现在统一保存在 `all_files.md5` 文件中，便于管理和验证。

### 3. 🔐 安全配置 (`config`)
*   **加密存储**：敏感信息 (AK/SK) 使用 AES-GCM 加密存储于本地 (`~/.data_deliver/config.yaml`)。
*   **自动读取**：交付任务会自动读取解密后的配置，无需在脚本中明文硬编码密钥。

## 🛠️ 安装与卸载指南

### 预备条件
*   Python >= 3.8
*   Rust (仅源码编译需要)

### 安装方法
```bash
# 从源码安装 (推荐)
pip install maturin
maturin develop --release  # 开发模式
# 或
maturin build --release && pip install target/wheels/*.whl
```

### 卸载方法
```bash
# 1. 卸载 Python 包
pip uninstall data_deliver_rs

# 2. 清理 Rust 编译产物
cd /path/to/RNAFlow_Deliver_Tool  # 替换为实际路径
cargo clean

# 3. 如需彻底清理所有构建产物
rm -rf build/ dist/ *.egg-info/ target/
```

## 📖 使用指南

工具主命令为 `rnaflow-cli` (或 `python -m RNAFlow_Deliver.cli`)。

### 1. 质控汇总 (QC Summary)

扫描指定目录下的质控文件并生成汇总报告。

```bash
rnaflow-cli qc -d ./01.qc -o ./qc_report
```
*   `-d`: 输入目录 (默认当前目录)
*   `-o`: 输出目录

### 2. 数据交付 (Data Delivery)

将文件从源目录分发到目标位置（本地目录或云存储桶）。

**本地模式：**
```bash
# 将 bam 文件硬链接到 delivery 目录
rnaflow-cli deliver -d ./analysis -o ./delivery -c config/delivery_config.yaml
```
*   交付完成后，所有文件的 MD5 校验和将保存在输出目录的 `all_files.md5` 文件中。

**云端模式：**
```bash
# 上传到 S3/TOS 存储桶
rnaflow-cli deliver --cloud --bucket my-bucket --prefix project_A/ -d ./analysis
```
*   云模式下，工具会自动查找环境变量 `TOS_ACCESS_KEY`/`TOS_SECRET_KEY` 或本地加密配置。

### 3. 配置管理 (Config Management)

交互式设置云端访问凭证（AK/SK 将被加密存储）。

```bash
rnaflow-cli config
# 或者单行设置
rnaflow-cli config --endpoint https://tos-cn-beijing.volces.com --region cn-beijing --ak YOUR_AK --sk YOUR_SK
```

## ⚙️ 配置文件示例

**QC 配置 (`qc_summary_config.yaml`)**:
```yaml
qc_files:
  fastqc: ["01.qc/*_fastqc.zip"]
  fastp: ["01.qc/*.json"]
  contamination: ["01.qc/*_screen.txt"]
```

**交付配置 (`delivery_config.yaml`)**:
```yaml
data_delivery:
  output_dir: "./delivery"
  delivery_mode: "symlink" # copy, hardlink, symlink
  threads: 4
  include_patterns:
    - "*.bam"
    - "*.vcf.gz"
    - "qc_summary_*.csv"
  exclude_patterns:
    - "tmp_*"
  
  # 云端默认配置 (可选)
  cloud:
    enabled: false
    bucket: "default-bucket"
    endpoint: "https://tos-cn-beijing.volces.com"
    region: "cn-beijing"
    task_num: 4
```

## ⚡ 性能基准

*   **MD5 计算**: Rust 引擎利用 SIMD 指令集与多线程，速度是标准 `md5sum` 命令的 1.5-2 倍。
*   **MD5 管理**: 所有文件的 MD5 校验和统一保存在单个 `all_files.md5` 文件中，便于管理和批量验证。
*   **文件扫描**: 并行文件系统扫描，支持百万级小文件快速处理。
*   **云上传**: 自动根据网络带宽调整并发度，支持断点续传（依赖于云厂商 SDK 实现）。

---
© 2026 JZ Tools Team.