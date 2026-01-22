# 🧬 GTF2TSS Converter

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue)](https://www.python.org/)
[![Bioinformatics](https://img.shields.io/badge/Topic-Bioinformatics-green)](https://github.com/topics/bioinformatics)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**GTF2TSS** 是一个高效的 Python 命令行工具，用于从基因组注释文件 (GTF/GFF) 中准确提取转录起始位点 (Transcription Start Sites, TSS)。

生成的 BED 文件完全兼容 **[ataqv](https://github.com/parkerlab/ataqv)** 等 ATAC-seq 质控工具，同时也适用于 ChIP-seq 的 TSS profile 分析。

## ✨ 主要功能

* **智能识别**：自动处理正链 (`+`) 和负链 (`-`) 的 TSS 坐标计算。
* **格式兼容**：支持直接读取纯文本 `.gtf` 或压缩的 `.gtf.gz` 文件。
* **交互友好**：基于 [Rich](https://github.com/Textualize/rich) 库构建，提供漂亮的进度条、彩色日志和详细的运行统计。
* **高度可定制**：支持提取特定的 Feature 类型（如 `transcript`, `gene`, `mRNA`）。

## 🛠️ 安装依赖

本脚本仅依赖 `rich` 库用于美化输出。

```bash
pip install rich
```

确保脚本具有执行权限：

```bash
chmod +x gtf2tss.py
```

## 🚀 使用方法

### 基础用法
将 GTF 文件转换为压缩的 TSS BED 文件：

```bash
./gtf2tss.py -i gencode.v49.annotation.gtf -o gencode.v49.tss.bed.gz
```

### 处理压缩文件
直接读取 .gz 输入并输出：

```bash
./gtf2tss.py -i gencode.v49.annotation.gtf.gz -o gencode.v49.tss.bed.gz
```

### 自定义 Feature
如果你的注释文件是植物（如生菜/番茄），特征名称可能是 gene 或 mRNA 而不是 transcript：

```bash
./gtf2tss.py -i Lsat_Salinas_v7.gtf.gz -o Lsat.tss.bed.gz --feature mRNA
```

### 查看帮助
```bash
./gtf2tss.py --help
```

## 📊 输出格式说明

输出文件为标准的 BED6 格式 (0-based)，可直接导入 IGV 或用于 bedtools：

| 列 | 含义 | 示例 |
|---|------|------|
| 1 | 染色体 | chr1 |
| 2 | 起始位置 (0-based) | 11868 |
| 3 | 终止位置 | 11869 |
| 4 | 名称 (Transcript ID) | ENST00000456328.2 |
| 5 | 分数 | . |
| 6 | 链方向 | + |

> 注意：
> - 对于 + 链：TSS = GTF Start (BED: Start-1, Start)
> - 对于 - 链：TSS = GTF End (BED: End-1, End)

## 🐍 Snakemake 集成

将此工具集成到你的 Snakemake 流程中非常简单：

```python
rule prepare_tss_file:
    input:
        gtf = config['ref']['gtf']
    output:
        tss = "00.ref/tss.bed.gz"
    params:
        script = "scripts/gtf2tss.py"
    shell:
        "python {params.script} -i {input.gtf} -o {output.tss}"
```

## 📝 示例截图

(此处可以放一张终端运行时的截图，显示进度条和最后的统计表格)

```
📂 输入文件: gencode.v49.annotation.gtf
💾 输出文件: gencode.v49.tss.bed.gz
🎯 提取特征: transcript

⠋ 正在读取 gencode.v49.annotation.gtf... ━━━━━━━━━━━━━━━━━━━━━━━━ 152,300 lines 0:00:05

───────────────────────────── 处理完成 ─────────────────────────────
✅ 成功生成文件: gencode.v49.tss.bed.gz
⏱️  耗时: 3.42 秒

┏━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┓
┃ 项目          ┃       数量 ┃
┡━━━━━━━━━━━━━━━╇━━━━━━━━━━━━┩
│ 总处理行数    │  3,250,120 │
│ 提取 TSS 数量 │    256,040 │
│ 跳过注释行    │          5 │
│ 跳过非目标特征│  2,994,075 │
└───────────────┴────────────┘
```

## 👤 作者
Jian Zhang - PhD Candidate in Vegetable Science