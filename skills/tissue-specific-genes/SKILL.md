---
name: tissue-specific-genes
description: 当输入为含 Geneid、Length 和重复样本计数列的表达计数表，且用户要求 TPM、Tau 或扩展 Tau 组织特异性基因筛选时触发。不负责比对定量、差异表达、基因注释或组织功能解释。
skill_id: tissue-specific-genes
version: 0.9.0
category: analysis
---

# Tissue-Specific Genes

## 何时使用
从 featureCounts 风格的原始基因计数表计算 TPM、合并同组织重复、计算 Tau，并使用扩展 Tau 规则标记候选组织特异性基因。

## 输入契约
| 参数 | 必填 | 说明 |
|---|---:|---|
| `--input` | 是 | 含 `Geneid`、`Length` 和至少两个计数列的 TSV/CSV。 |
| `--output` | 是 | 可写结果目录。 |
| `--count_pattern` | 否 | 选择计数列的正则，默认 `_rep`。 |
| `--min_total_tpm` | 否 | TPM 总和过滤阈值，默认 `10`。 |
| `--z_threshold` | 否 | 扩展 Tau 区间阈值，默认 `2`。 |

## 执行步骤
1. 使重复样本名遵循 `组织名_rep编号`；非此格式时设置合适的 `--count_pattern`，并确认组织名可由 `_rep` 前缀识别。
2. 运行：
```bash
Rscript /workspace/.skills/tissue-specific-genes/scripts/run_tissue_specific.R --input gene_counts.tsv --output results --count_pattern _rep --z_threshold 2
```
3. 根据 `summary.json` 复核保留基因数、组织数和候选数。

## 输出契约
输出 `tpm_by_sample.tsv`、`tpm_by_tissue.tsv`、`tau_scores.tsv`、`extended_tau_genes.tsv` 和 `summary.json`。扩展结果含候选组织、最大表达组织、最大 TPM、Tau 及各组织平均 TPM。

## 质控与限制
要求 Length 为正数、计数非负，且聚合后至少有两个组织。Tau 对组织面板和表达归一化敏感；候选只能作为表达特异性筛选，不能直接代表组织功能或细胞类型。依赖和错误处置见 `references/environment.md` 与 `references/usage.md`。
