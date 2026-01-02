# 🧬 RSEM Matrix Merger (Snakemake & CLI)

> **一个优雅、健壮且双模运行的 RSEM 结果合并工具。** > *Powered by Pandas, Rich-Click & Loguru.*

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Snakemake](https://img.shields.io/badge/Snakemake-Compatible-green)
![Style](https://img.shields.io/badge/Style-Rich--Click-purple)

## 📖 简介 (Introduction)

在 RNA-seq 分析流程中，RSEM 定量通常会生成成百上千个独立的 `.genes.results` 或 `.isoforms.results` 文件。
本工具旨在高效地将这些分散的结果合并为下游分析（如 DESeq2, edgeR）所需的标准表达矩阵。

**核心亮点：**
* **🔌 双模运行**：自动检测环境，既可作为 Snakemake 的 `script` 模块直接调用，也可作为独立 CLI 工具使用。
* **✨ 颜值在线**：集成 `rich-click` 和 `rich.progress`，提供漂亮的帮助文档和实时进度条。
* **🛡️ 健壮稳定**：内置完善的错误捕获与 `loguru` 日志记录，防止因个别坏文件导致整个流程崩溃。
* **🏷️ 智能映射**：支持将文件名 ID（如 `S01`）自动映射为人类可读的样本名（如 `Control_Rep1`）。
* **📁 目录合并**：支持从指定目录中批量合并所有 `.genes.results` 或 `.isoforms.results` 文件。
* **🧬 基因/转录本支持**：同时支持基因水平（genes）和转录本水平（isoforms）结果的合并。
* **📝 详细日志**：日志文件保存在与输出矩阵相同的目录中，格式为 `merge_rsem_YYYYMMDD_HHMMSS.log`。

---

## 📦 安装依赖 (Requirements)

本工具依赖以下 Python 库，请确保你的环境已安装：

```bash
pip install pandas rich rich-click loguru
```

## 🚀 使用方法 (Usage)
### 方式一：在 Snakemake 流程中调用 (推荐)
这是本工具的核心设计场景。它可以直接读取 Snakemake 的 input、output 和 params。
Snakefile 示例：
```python
# 假设 SAMPLES 字典包含 {SampleID: SampleName} 的映射关系
SAMPLE_MAP = {sid: config["samples"][sid]["name"] for sid in SAMPLES}

rule merge_matrix:
    input:
        rsem_files = expand("03.count/rsem/{sample}.genes.results", sample=SAMPLES.keys()),
        sample_sheet = config["sample_csv"]
    output:
        tpm = "03.count/matrix/TPM.tsv",
        counts = "03.count/matrix/Counts.tsv",
        fpkm = "03.count/matrix/FPKM.tsv"
    params:
        log_level = "INFO",  # 设置日志级别
        # ✨ 你可以在这里自定义校验列，如果不写则默认检查 sample, sample_name, group
        check_cols = ["sample", "sample_name", "group", "condition"]
    script:
        "workflow/scripts/merge_rsem.py"
```

### 方式二：命令行手动运行 (CLI)
用于单独测试、调试或在非 Snakemake 环境下处理数据。

```bash
# 查看帮助：
# 你将看到一个非常漂亮的富文本帮助界面
python workflow/scripts/merge_rsem.py -h

# 使用默认校验列合并指定文件
python workflow/scripts/merge_rsem.py merge \
    -i S1.genes.results \
    -i S2.genes.results \
    --tpm tpm.tsv --counts counts.tsv --fpkm fpkm.tsv \
    --map sample.csv \
    --log-level DEBUG

# 自定义校验列 (覆盖默认值)
python workflow/scripts/merge_rsem.py merge \
    -i S1.genes.results \
    -i S2.genes.results \
    --tpm tpm.tsv --counts counts.tsv \
    --map sample.csv \
    --check-cols sample --check-cols sample_name --check-cols batch_id
```

### 方式三：从目录合并所有 RSEM 结果文件
支持从指定目录中合并所有 `.genes.results` 或 `.isoforms.results` 文件。

```bash
# 合并目录中的所有 .genes.results 文件
python workflow/scripts/merge_rsem.py merge-from-dir \
    --input-dir /path/to/rsem/results/ \
    --tpm tpm.genes.tsv --counts counts.genes.tsv --fpkm fpkm.genes.tsv \
    --map sample.csv \
    --extension .genes.results \
    --log-level INFO

# 合并目录中的所有 .isoforms.results 文件
python workflow/scripts/merge_rsem.py merge-from-dir \
    --input-dir /path/to/rsem/results/ \
    --tpm tpm.isoforms.tsv --counts counts.isoforms.tsv \
    --map sample.csv \
    --extension .isoforms.results \
    --log-level DEBUG
```

## 📂 输入输出说明 (Input & Output)
### 输入文件 (Input)
格式：RSEM 标准输出 (.genes.results 或 .isoforms.results)。
内容：必须包含 gene_id, TPM, expected_count, FPKM 列。

### 输出文件 (Output)
生成标准的 Tab 分隔符 (.tsv) 矩阵文件。

**基因水平结果 (.genes.results)：**
1. TPM 矩阵 (--tpm)
| GeneID | Control_1 | Control_2 | Treat_1 |
| :--- | :--- | :--- | :--- |
| ENSG001 | 12.5 | 13.1 | 50.2 |
| ENSG002 | 0.0 | 0.1 | 0.0 |

2. Counts 矩阵 (--counts)
| GeneID | Control_1 | Control_2 | Treat_1 |
| :--- | :--- | :--- | :--- |
| ENSG001 | 450 | 480 | 1200 |
| ENSG002 | 0 | 2 | 0 |

3. FPKM 矩阵 (--fpkm)
| GeneID | Control_1 | Control_2 | Treat_1 |
| :--- | :--- | :--- | :--- |
| ENSG001 | 5.5 | 6.1 | 20.2 |
| ENSG002 | 0.0 | 0.05 | 0.0 |

**转录本水平结果 (.isoforms.results)：**
对于转录本结果，输出矩阵使用多级索引，包含 transcript_id 和 gene_id：
| transcript_id | gene_id | Control_1 | Control_2 | Treat_1 |
| :--- | :--- | :--- | :--- | :--- |
| ENST00000000233 | ENSG00000000003 | 5.0 | 5.5 | 20.1 |
| ENST00000000412 | ENSG00000000005 | 0.0 | 0.05 | 0.0 |

### 日志文件
- 日志文件保存在与 TPM 输出文件相同的目录中
- 文件名格式：`merge_rsem_YYYYMMDD_HHMMSS.log`
- 包含详细的处理信息、进度和错误信息

## 🛠️ 常见问题 (FAQ)
Q: 为什么生成的列名是 S01, S02 而不是样本名？ A: 如果在 CLI 模式下运行，默认不提供映射字典，列名将使用文件名（去除后缀）。如果在 Snakemake 模式下，请确保 params.sample_map 正确传递了 {ID: Name} 字典。

Q: 支持多线程吗？ A: 文件读取主要受限于 I/O，且 Pandas 的合并操作已高度优化。对于几百个样本，单线程通常在几秒到几分钟内即可完成，无需额外配置多线程。

Q: 如何合并转录本水平的结果？ A: 使用 `merge-from-dir` 命令并指定 `--extension .isoforms.results` 参数，输出文件将包含 transcript_id 和 gene_id 的多级索引。

## 📝 维护者 (Maintainer)
Author: Jian Zhang
Tool: Hajimi Bio-Toolbox 🐱