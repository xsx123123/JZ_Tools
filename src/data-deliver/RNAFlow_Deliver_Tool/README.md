# RNAFlow Delivery Tool

**基于 Rust 加速的高性能生物信息数据交付系统。**

专门用于将复杂的分析流程（如 Snakemake）产生的零散结果，根据配置自动整理、过滤并交付到结构化的目标目录（本地或云端对象存储）。

## 🚀 核心特性

*   **Rust 核心驱动**: 采用 Rust 编写后端 (`data_deliver_rs`)，支持多线程并发传输与 MD5 计算，性能远超纯 Python 实现。
*   **结构化重组**: 支持通过配置文件将源文件映射到特定的子目录，实现“分类交付”。
*   **多级校验**: 
    *   **全局校验**: 根目录生成 `delivery_manifest.md5` 包含所有文件。
    *   **目录校验**: **[新]** 每个交付子目录下自动生成 `MD5.txt`，仅包含该目录内的文件，方便分发校验。
*   **智能报告**: 生成 `delivery_manifest.json`，包含所有交付文件的元数据与路径映射，完美对接 Quarto 等报告系统。
*   **云端支持**: 原生支持 S3 兼容的对象存储（如 AWS S3, 字节跳动 TOS 等），支持分片并发上传。

## 🛠️ 环境准备

由于该工具包含 Rust 扩展，在新的环境下需要重新编译：

```bash
# 1. 编译 Rust 后端
cd src/src/data-deliver/RNAFlow_Deliver_Tool
cargo build --release

# 2. 安装扩展
cp target/release/libdata_deliver_rs.so python/RNAFlow_Deliver/data_deliver_rs.so

# 3. 设置环境变量
export PYTHONPATH=$PYTHONPATH:$(pwd)/python
```

## 📖 配置文件指南 (`full_delivery_config.yaml`)

你可以通过 `pattern` 匹配文件，通过 `dest` 指定它在交付目录中的位置：

```yaml
data_delivery:
  output_dir: ./full_delivery
  threads: 8
  
  include_patterns:
    # 模式 1: 字符串 - 匹配并交付到根目录
    - "summary_table.csv"
    
    # 模式 2: 字典 - 匹配并重定向到子目录
    - pattern: "02.mapping/*.bam"
      dest: "02_Mapping/BAM"
      
    - pattern: "01.qc/*.html"
      dest: "01_QC/Reports"
```

## 📂 交付结果示例

交付后的目录结构如下所示：

```text
delivery_output/
├── 01_QC/
│   ├── Reports/
│   │   ├── sample1_report.html
│   │   └── MD5.txt              <-- 仅包含本目录文件的校验和
├── 02_Mapping/
│   ├── BAM/
│   │   ├── sample1.sort.bam
│   │   └── MD5.txt              <-- 仅包含本目录文件的校验和
├── delivery_manifest.json       <-- 用于自动化报告的 JSON 映射
├── delivery_manifest.md5        <-- 全局校验文件
└── ...
```

## 📊 自动化报告对接

`delivery_manifest.json` 为后续的 Quarto 报告模块提供了标准化的输入：

```json
{
    "meta": {
        "timestamp": "2026-01-10T...",
        "success": 100,
        "mode": "local",
        "output_location": "/abs/path/to/delivery"
    },
    "files": {
        "sample1.bam": "/abs/path/to/delivery/02_Mapping/BAM/sample1.bam"
    }
}
```

## ☁️ 云端交付 (S3/TOS)

使用 `--cloud` 参数开启云端模式：

```bash
python3 cli.py deliver --cloud --bucket my-results --prefix project_A/ -c config.yaml
```

*注意：云端模式下，凭证可通过环境变量 `TOS_ACCESS_KEY` / `TOS_SECRET_KEY` 或 `config` 子命令设置。*