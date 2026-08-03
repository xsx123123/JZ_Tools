---
name: deg
description: 当输入为基因/峰计数矩阵、表达矩阵或 GTF，且用户要求差异分析、表达分布、热图或基因属性提取时触发。不负责原始测序数据处理、比对定量、峰调用或功能富集。
skill_id: deg
version: 0.9.0
category: analysis
---

# Differential Expression Analysis

## 何时使用
对已经量化的 RNA-seq 或 ATAC-seq 数据执行 DESeq2、表达分布图、静态/交互热图，或从 GTF 导出基因属性时使用。需要 GO/通路富集时使用 `enrichments`；需要原始 reads 处理时使用对应的上游流程。

## 输入契约
| 字段 | 必填 | 说明 |
|---|---:|---|
| `--input` | 是 | JSON manifest；必须含 `mode`。 |
| `--output` | 是 | 新建或可写结果目录。 |
| `counts` | DESeq2 模式 | 行为特征、列为样本的 CSV/TSV；ATAC 模式须有 peak 注释。 |
| `metadata` | 图形/DESeq2 模式 | 至少一个可与矩阵列名匹配的样本 ID 列。 |
| `pairs` | DESeq2 模式 | RNA/ATAC 对比表，含 Treat 与 Control。 |
| `matrix` 或 `gtf` | 指定模式 | 热图使用 `matrix`；GTF 提取使用 `gtf`。 |

## 执行步骤
1. 写入 manifest；可选 `mode` 为 `deseq2`、`atac-deseq2`、`distribution`、`pheatmap`、`plotly-heatmap` 或 `gtf2tsv`。
2. 运行统一入口：
```bash
python /workspace/.skills/deg/scripts/run_deg.py --input analysis.json --output results
```
3. 例如 RNA DESeq2 manifest：`{"mode":"deseq2","counts":"counts.csv","metadata":"metadata.csv","pairs":"pairs.csv","annotation":"genes.csv","lfc":1,"pval":0.05}`。
4. 读取 `results/summary.json`，再检查每个比较或图形的实际产物。

## 输出契约
输出目录始终包含 `summary.json`，其中记录状态、运行命令和所有产物。RNA 模式通常生成全局 PCA、每个比较的 `*_DEG.csv`、火山图和统计表；ATAC 模式生成 `*_Differential_Peaks.csv`；图形模式生成 PDF/PNG 或 HTML；GTF 模式生成 `gene_info.tsv`。只以 `summary.json` 中列出的文件为本次运行结果。

## 质控与限制
运行前确认矩阵列名与 metadata 有交集、计数为非负整数、每个比较两组均存在。DESeq2 依赖 R、`DESeq2`、`ggplot2`、`optparse`；交互热图还依赖 Python 的 `pandas`、`scipy`、`plotly`。DESeq2 脚本按 raw p-value 阈值筛选，不能将其误述为 FDR。详见 `references/usage.md` 与 `references/environment.md`。
