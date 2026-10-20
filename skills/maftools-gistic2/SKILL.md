---
name: maftools-gistic2
description: 当输入为 GISTIC2 all_lesions、amp_genes 或 del_genes 结果，且用户要求按区域汇总阳性样本或提取区域基因时触发。不负责运行 GISTIC2、MAF 注释、拷贝数分段或临床解释。
skill_id: maftools-gistic2
version: 0.9.0
category: analysis
---

# GISTIC2 Result Tables

## 何时使用
清洗已完成的 GISTIC2 表：从 `amp_genes`/`del_genes` 提取区域基因，或从 `all_lesions` 和临床映射汇总每个 peak 的阳性样本。

## 输入契约
| 参数 | 必填 | 说明 |
|---|---:|---|
| `--input` | 是 | GISTIC2 制表符分隔结果。 |
| `--output` | 是 | 可写结果目录。 |
| `--mode` | 否 | `gene-list`（默认）或 `sample-summary`。 |
| `--prefix` | `gene-list` | 区域前缀，如 `AP` 或 `DP`。 |
| `--clinical` | `sample-summary` | 含 `Tumor_Sample_Barcode` 和 `ID` 的映射表。 |

## 执行步骤
1. 提取扩增区域基因：
```bash
Rscript /workspace/.skills/maftools-gistic2/scripts/run_gistic2.R --input amp_genes.conf_90.txt --output results --mode gene-list --prefix AP
```
2. 汇总 peak 样本：
```bash
Rscript /workspace/.skills/maftools-gistic2/scripts/run_gistic2.R --input all_lesions.conf_90.txt --output results --mode sample-summary --clinical clinical.tsv
```
3. 读取 `results/summary.json` 并检查输出行数与 GISTIC2 输入中的区域数是否一致。

## 输出契约
`gene-list` 生成 `gistic_region_genes.tsv`，含 `region_id`、逗号连接的 `merged_genes` 和 `gene_count`。`sample-summary` 生成 `gistic_peak_samples.tsv`，含 `region_id`、`sample_count`、`sample_list`。每次运行都生成 `summary.json`。

## 质控与限制
输入应保留 GISTIC2 原始表头；样本模式需要可映射的临床 ID。`sample_count` 是输入表中正值记录数，若表含重复列不必然是去重患者数。需要 R 的 `optparse`、`jsonlite`、`data.table`、`dplyr`、`tidyr`。详见 `references/usage.md`。
