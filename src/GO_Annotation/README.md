# 🧬 GAF ID Mapper: High-Performance GO Annotation Converter

A specialized tool for converting Gene Association Files (GAF) to Ensembl-compatible formats for downstream enrichment analysis (e.g., clusterProfiler).

## 📖 简介 (Introduction)

在进行 GO 富集分析（如使用 `clusterProfiler`）时，通常需要 **Ensembl ID**，而原始的 GAF 注释文件（如来自 MGI）通常使用数据库特有的 ID（如 `MGI:xxxxx`）。

**GAF ID Mapper** 是一个稳健的解析工具，旨在解决 ID 不匹配的问题。它采用 "**外部映射表优先 + GAF内联注释兜底**" 的双重策略，实现了高达 99%+ 的 ID 转换覆盖率。

## ✨ 核心特性 (Features)

- **🚀 双重映射策略 (Dual-Strategy Mapping):**
  - **优先 (Priority):** 加载外部高置信度映射表 (Coordinates/ID Mapping file)。
  - **兜底 (Fallback):** 自动解析 GAF 文件第 8 列 (`With/From`) 提取潜在的 Ensembl ID。
- **📊 详细统计报告:** 运行结束后输出详细的 ID 转换统计（External Hit vs GAF Fallback vs Unmapped）。
- **⚡ 高性能体验:** 基于 `loguru` 和 `rich` 构建，提供美观的 CLI 界面、实时进度条和格式化的结果预览。
- **🛡️ 容错设计:** 自动处理不规范的行、空值和重复条目。

## 🛠️ 安装依赖 (Prerequisites)

本工具依赖 Python 3，并需要以下第三方库：

```bash
pip install pandas loguru rich
```

## 🚀 使用方法 (Usage)

### 基本命令

```bash
python MGI_gaf_parser.py -i <input.gaf> -m <mapping.txt> -o <output.tsv>
```

### 参数说明

| 参数 | 缩写 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `--input` | `-i` | ✅ | 原始 GAF 注释文件路径 (e.g., `mgi.gaf`) |
| `--mapping` | `-m` | ✅ | ID 映射文件路径 (Tab分隔, Col 0: MGI, Col 5: Ensembl) |
| `--output` | `-o` | ❌ | 输出 TSV 文件路径 (默认: `ensembl_go_annotation.tsv`) |

### 运行示例

```bash
python MGI_gaf_parser.py \
    -i raw_data/mgi_2025.gaf \
    -m raw_data/mgi_to_ensembl_coords.txt \
    -o results/clean_go_annotation.tsv
```

## 📝 输入文件格式说明

### 1. GAF 文件 (`-i`)
符合 GO Consortium 标准的 GAF 2.1/2.2 格式文件。
- **Col 2:** DB Object ID (e.g., `101757` or `MGI:101757`)
- **Col 5:** GO ID (e.g., `GO:0000281`)
- **Col 8:** With/From (Optional, used for fallback mapping)

### 2. 映射文件 (`-m`)
制表符分隔的文本文件（通常来自 MGI 坐标文件或其他 BioMart 导出文件）。

**脚本默认读取逻辑:**
- **第 0 列:** 原始 ID (e.g., `MGI:1915733`)
- **第 5 列:** 目标 Ensembl ID (e.g., `ENSMUSG00000102531`)

> 💡 **提示:** 如果你的映射文件列数不同，请修改脚本中的 `load_external_mapping` 函数。

## 📊 输出效果 (Output Preview)

工具运行完成后，会在终端打印详细的统计摘要：

```text
20:30:15 | INFO     | 正在加载外部 ID 映射表...
20:30:15 | SUCCESS  | 外部映射表加载完毕，共 20,000 个 MGI->Ensembl 对应关系
20:30:15 | INFO     | 开始解析 GAF 并进行 ID 转换...
Processing... ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% 0:00:02

             📈 ID 转换统计             
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━┓
┃ Category                          ┃ Count  ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━┩
│ Total GO Terms                    │ 744389 │
│ Mapped via External File (High... │ 737660 │
│ Mapped via GAF Col 8 (Fallback)   │ 5      │
│ Unmapped (Kept Original)          │ 6724   │
└───────────────────────────────────┴────────┘

          📊 最终数据预览 (Top 5)          
┏━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┓
┃ Gene ID (Ensembl)  ┃ GO ID      ┃
┡━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━┩
│ ENSMUSG00000102531 │ GO:0000281 │
│ ENSMUSG00000047661 │ GO:0001755 │
└────────────────────┴────────────┘
```

## 🤝 适用场景

- `clusterProfiler` 富集分析前的数据准备。
- 需要将 MGI/FlyBase/WormBase 等特有 ID 转换为 Ensembl ID 的场景。
- 处理更新滞后的 GAF 文件与较新的基因组版本之间的 ID 映射。

---
**Author:** Jian Zhang  
**Last Updated:** 2026-01-09
