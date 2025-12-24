# RNAFlow 脚本工具 README

## 概述

本目录包含三个用于处理和验证测序数据 MD5 的工具：

1. **seq_preprocessor**  : 自动整理不同来源的测序数据（支持Short-read和Long-read），统一命名和目录结构。
2. **json_md5_verifier** : 基于 JSON 报告的多线程 MD5 校验和验证工具，用于验证由 `seq_preprocessor` 处理后的数据。
3. **check_md5.py**        : 基于标准 MD5 列表（md5sum 格式）的并发校验工具，适用于通用的批量文件完整性验证。

---

## seq_preprocessor

`seq_preprocessor` 是一个用于自动整理不同来源的测序数据的工具，支持 Short-read（双端）和 Long-read（单端）数据，并统一命名和目录结构。

### 功能特性

- **支持多种数据格式**：
  - Illumina 数据 (PE): `<样本名>_S..._L..._R[12]_...fq.gz`
  - 通用格式 (PE): `<样本名>[._][R12|12].fq.gz`
  - SRA 数据 (PE): `[SED]RR#######[._][12].fq.gz` (如 SRR######_1.fq.gz)
  - SRA 数据 (SE): `[SED]RR#######.fq.gz` (如 SRR#######.fq.gz)
  - Long-read 数据 (SE): `<样本名>.fq.gz`

- **自动检测文库类型**：支持自动检测、仅处理双端数据或仅处理单端数据

- **智能文件处理**：
  - 在 Unix 系统上使用软链接（symlink）指向原始文件，不消耗额外磁盘空间
  - 非 Unix 系统上复制文件
  - 自动验证和重建损坏的链接

- **JSON 报告生成**：生成详细的重命名报告，包含原始路径和新路径信息

- **SRA 数据特殊处理**：对于 SRA 数据，JSON 报告中的 MD5 值标记为 "SRA"，且不需要在输入目录中提供 MD5 文件

### 编译方法

使用以下命令编译脚本：

```bash
# 编译 seq_preprocessor 并放置到指定目录
cargo build --target-dir ../release/seq_preprocessor_x86_64 --release
```

编译后的可执行文件将位于 `../release/seq_preprocessor_x86_64/release/` 目录下。

### 使用示例

```bash
# 自动检测并处理 PE 和 SE 数据
./seq_preprocessor --input /path/to/raw_data --output /path/to/processed_data

# 仅处理双端 (PE) 数据
./seq_preprocessor --input /path/to/raw_data --output /path/to/processed_data --library-type ShortRead

# 生成 JSON 报告和总 MD5 文件
./seq_preprocessor --input /path/to/raw_data --output /path/to/processed_data --json-report report.json --summary-md5 checksums.txt

# 处理多个输入目录
./seq_preprocessor --input /path/to/raw_data1 --input /path/to/raw_data2 --output /path/to/processed_data
```

---

## json_md5_verifier

`json_md5_verifier` 是一个基于 JSON 报告的多线程 MD5 校验和验证工具，用于验证经过 `seq_preprocessor` 处理后的文件完整性。

### 功能特性

- **多线程并发验证**：支持指定线程数进行并发验证，提高处理效率
- **JSON 报告解析**：读取 `seq_preprocessor` 生成的 JSON 报告文件
- **详细验证结果**：生成包含时间戳、样本名、文件路径、预期/实际 MD5 值、状态和消息的 TSV 格式报告
- **SRA 数据特殊处理**：对于 MD5 值标记为 "SRA" 的样本，不进行 MD5 校验，而是直接计算并记录实际的 MD5 值
- **进度显示**：实时显示验证进度和统计信息
- **日志记录**：生成详细的日志文件记录验证过程
- **智能缓冲区**：根据文件大小自动调整缓冲区大小以优化性能

### 编译方法

使用以下命令编译脚本：

```bash
# 编译 json_md5_verifier 并放置到指定目录
cargo build --target-dir ../release/json_md5_verifier_x86_64 --release
```

编译后的可执行文件将位于 `../release/json_md5_verifier_x86_64/release/` 目录下。

### 使用示例

```bash
# 基本验证
./json_md5_verifier --input report.json --base-dir /path/to/processed_data

# 使用 8 个线程进行并发验证
./json_md5_verifier --input report.json --base-dir /path/to/processed_data --threads 8

# 生成验证报告并指定日志文件
./json_md5_verifier --input report.json --base-dir /path/to/processed_data --output verification_report.tsv --log-file custom.log

# 指定自定义缓冲区大小
./json_md5_verifier --input report.json --base-dir /path/to/processed_data --buffer-size 2097152
```

---

## check_md5.py

`check_md5.py` 是一个轻量级的 Python 脚本，旨在通过并发处理提高标准 MD5 列表文件的验证速度。它非常适合验证由 `md5sum` 命令或 `seq_preprocessor`（通过 `--summary-md5` 选项）生成的传统校验和文件。

### 功能特性

- **简单易用**：支持标准的 `md5sum` 格式（`MD5值  文件名`）。
- **并发加速**：使用多线程（ThreadPoolExecutor）显著提升大量大文件的校验效率。
- **美观的日志**：集成 `loguru` 库，提供清晰的控制台实时反馈，并自动按日期生成详细的日志文件。
- **错误处理**：能够准确识别并报告“校验通过”、“文件丢失”、“MD5不匹配”和“读取错误”四种状态。

### 依赖要求

运行此脚本需要安装 `loguru` 库：

```bash
pip install loguru
```

### 使用方法

```bash
# 基本用法：指定校验列表文件，默认使用 4 线程
python3 check_md5.py --file checksums.txt

# 指定使用 8 个线程进行并发校验
python3 check_md5.py -f checksums.txt -t 8
```

### 校验列表格式示例

```text
d41d8cd98f00b204e9800998ecf8427e  sample1_R1.fq.gz
e80b5017098950fc58aad83c8c14978e  sample1_R2.fq.gz
```

---

## 工作流程

1. **整理数据**：使用 `seq_preprocessor` 整理原始测序数据。建议使用 `--json-report` 生成结构化报告，或使用 `--summary-md5` 生成标准校验列表。
2. **验证数据**：
   - **方式 A (推荐)**：使用 `json_md5_verifier` 基于 JSON 报告进行验证。此方式支持 SRA 数据的特殊处理及生成详细的 TSV 验证报告。
   - **方式 B (通用)**：使用 `check_md5.py` 基于生成的总 MD5 文件（如 `checksums.txt`）进行快速验证。
3. **确认结果**：检查输出日志或报告，确保所有文件通过校验。

这两个工具共同构成了一个完整的测序数据预处理和验证流程，确保数据的正确性和完整性。