---
name: RSEM Gene Matrix Preparation
description: 当输入为一批 RSEM result 文件且用户要求合并为 count/TPM 矩阵，或输入为特征×样本表达矩阵且用户要求基础样本质控时触发。不负责 RSEM 定量、差异表达检验或复杂图形报告。
skill_id: gene-matrix
version: 0.9.0
category: analysis
---

## 何时使用
用 `merge_rsem.py` 合并同一目录中的 RSEM `*.genes.results` 或 `*.isoforms.results` 文件；用 `qc_expression_matrix.py` 对一个合并矩阵生成库大小、检出特征数和 Pearson 相关性表。

## 输入契约
| 工具 | `--input` | `--output` | 关键可选参数 |
| --- | --- | --- | --- |
| `merge_rsem.py` | 含 RSEM 结果文件的目录 | 结果目录 | `--sample-map`、`--include-fpkm` |
| `qc_expression_matrix.py` | 有表头的特征×样本 TSV | 结果目录 | `--detect-cutoff`、`--filename-prefix` |

## 执行步骤
1. 合并 RSEM 输出：
```bash
python /workspace/.skills/gene-matrix/scripts/merge_rsem.py --input {rsem_result_dir} --output {matrix_dir} --include-fpkm
```
2. 对 TPM 或 count 矩阵执行基础 QC：
```bash
python /workspace/.skills/gene-matrix/scripts/qc_expression_matrix.py --input {matrix_dir/tpm_matrix.tsv} --output {qc_dir} --detect-cutoff 1
```
3. 每步只读取对应目录的 `summary.json` 汇报样本数、feature 数和生成文件。

## 输出契约
- 合并：`counts_matrix.tsv`、`tpm_matrix.tsv`，以及可选 `fpkm_matrix.tsv`。
- 质控：`matrix_qc_sample_metrics.tsv` 与 `matrix_qc_pearson.tsv`。
- 每个脚本均写入 `summary.json`，其中使用相对产物路径和关键统计量。

## 质控与限制
- 合并脚本只接受 RSEM 表的 `gene_id` 或 `transcript_id`、`expected_count`、`TPM` 列；特征 ID 会去除 `gene:` 前缀和末尾版本号。
- RSEM 文件按文件名第一个点前的部分命名样本；重名会失败而不是静默覆盖。
- QC 使用输入的数值矩阵，不绘制 PCA 或小提琴图；如需复杂绘图，应由专门可视化技能处理。详见 `references/usage.md`、`references/environment.md`。
