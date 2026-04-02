# seq_preprocessor

一个用于自动整理不同来源测序数据的 Rust 工具，支持双端（PE）和单端（SE）数据，统一命名和目录结构。

## 功能特性

- 🔗 **软链接方式**：Unix 系统下使用符号链接，不占用额外磁盘空间
- 🧬 **多类型支持**：支持 Illumina、SRA (SRR/ERR/DRR)、Generic 等多种数据格式
- 🔄 **PE/SE 自动识别**：自动区分双端（Short-read）和单端（Long-read）数据
- 📝 **MD5 校验**：支持解析和生成 MD5 校验文件
- 📊 **JSON 报告**：生成详细的样本重命名报告
- 🏷️ **样本重命名**：通过 CSV 样本表批量重命名样本

## 安装

```bash
# 克隆仓库
git clone <repository-url>
cd seq_preprocessor

# 编译发布版本
cargo build --release

# 二进制文件位于 target/release/seq_preprocessor
```

## 使用方法

### 基本用法

```bash
# 处理单个输入目录
seq_preprocessor -i /path/to/raw_data -o /path/to/output

# 处理多个输入目录
seq_preprocessor -i /data/batch1 -i /data/batch2 -o ./output

# 仅处理 PE 数据
seq_preprocessor -i /path/to/data -o ./output --library-type short-read

# 仅处理 SE 数据  
seq_preprocessor -i /path/to/data -o ./output --library-type long-read
```

### 高级选项

```bash
# 生成总 MD5 文件
seq_preprocessor -i ./raw -o ./output --summary-md5 checksums.txt

# 生成 JSON 报告
seq_preprocessor -i ./raw -o ./output --json-report report.json

# 使用样本表重命名
seq_preprocessor -i ./raw -o ./output --sample-sheet rename.csv

# 禁用每个样本的独立 MD5 文件
seq_preprocessor -i ./raw -o ./output --no-per-sample-md5
```

## 支持的文件格式

### 双端数据（PE）格式

| 格式类型 | 示例文件名 | 提取的样本名 |
|---------|-----------|-------------|
| **Illumina** | `sample_S1_L001_R1_001.fastq.gz` | `sample` |
| **下划线分隔** | `sample_R1.clean.fastq.gz` | `sample` |
| **点分隔** | `sample.1.trimmed.fq.gz` | `sample` |
| **带中间后缀** | `sample_R1.filtered.fastq.gz` | `sample` |
| **带 .raw** | `sample.R1.raw.fastq.gz` | `sample` |
| **SRA** | `SRR123456_1.fastq.gz` | `SRR123456` |

### 单端数据（SE）格式

| 格式类型 | 示例文件名 | 提取的样本名 |
|---------|-----------|-------------|
| **普通** | `sample.fq.gz` | `sample` |
| **SRA** | `ERR123456.fastq.gz` | `ERR123456` |

### 支持的中间后缀

`.clean`, `.trimmed`, `.trim`, `.filtered`, `.filter`, `.qc`, `.val`, `.processed`, `.raw` 等

## 样本表格式

CSV 文件必须包含以下表头：

```csv
sample,sample_name
WT-1,WildType_Rep1
KO-1,Knockout_Rep1
SRR123456,Control_1
```

- `sample`: 原始文件名中的样本名
- `sample_name`: 新的样本名

## 输出结构

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

## 命令行参数

```
Usage: seq_preprocessor [OPTIONS] --input <INPUT>... --output <OUTPUT>

Options:
  -i, --input <INPUT>...       原始数据所在的根目录路径 (可指定一个或多个)
  -o, --output <OUTPUT>        整理后数据的输出目录路径
      --md5-name <MD5_NAME>    指定每个样本文件夹中 MD5 文件的名称 [default: md5.txt]
      --summary-md5 <SUMMARY_MD5>  在输出目录顶层生成总 MD5 文件
      --no-per-sample-md5      禁止在每个样本子目录中创建独立的 MD5 文件
      --json-report <JSON_REPORT>  生成 JSON 格式的重命名报告文件
      --sample-sheet <SAMPLE_SHEET>  包含样本重命名信息的 CSV 文件
      --library-type <LIBRARY_TYPE>  指定要处理的文库类型 [default: auto]
                                 [possible values: short-read, long-read, auto]
  -h, --help                   打印帮助信息
  -V, --version                打印版本信息
```

## 示例

### 示例 1：基础数据处理

```bash
seq_preprocessor -i ./raw_fastq -o ./processed
```

### 示例 2：完整流程

```bash
# 1. 处理数据并生成报告
seq_preprocessor \
  -i ./raw_data \
  -o ./standardized \
  --summary-md5 md5_all.txt \
  --json-report rename_report.json \
  --sample-sheet sample_info.csv

# 2. 查看生成的目录结构
tree ./standardized

# 3. 验证 MD5
cd ./standardized && md5sum -c md5_all.txt
```

### 示例 3：处理来自不同来源的数据

```bash
# 合并处理 Illumina、SRA 和 Clean 数据
seq_preprocessor \
  -i ./illumina_data \
  -i ./sra_downloads \
  -i ./clean_data \
  -o ./combined_analysis \
  --library-type auto
```

## 依赖

- Rust 1.70+
- 支持的系统：Linux、macOS（Windows 使用文件复制而非软链接）

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
