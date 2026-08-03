---
name: mutational-patterns
description: 当输入为同一参考基因组构建的一组 somatic VCF 且用户要求 SBS-96 突变谱、de novo NMF signature 提取或样本贡献度时触发。不负责 VCF 变异检测、癌种专用 COSMIC 归因、SV/CNV signature 或临床因果解释。
skill_id: mutational-patterns
version: 0.9.0
category: analysis
---

## 何时使用

使用本技能从目录中的 VCF 文件构建 SNV 谱、96 trinucleotide 矩阵，并进行 de novo signature NMF。输入目录内的每个 `.vcf` 或 `.vcf.gz` 文件对应一个样本。

## 输入契约

| 参数 | 必填 | 说明 |
|---|---|---|
| `--input` | 是 | 含 VCF/VCF.GZ 的目录；文件名（去掉扩展名）为样本名。 |
| `--output` | 是 | 唯一输出目录。 |
| `--genome` | 否 | `hg38`（默认）或 `hg19`。 |
| `--rank` | 否 | NMF signature 数，默认 4，必须至少 2。 |
| `--nrun` | 否 | NMF 重复次数，默认 100。 |

## 执行步骤

1. 确认全部 VCF 是同一人类参考版本、包含 SNV，且样本名去扩展名后唯一。
2. 运行：
```bash
Rscript /workspace/.skills/mutational-patterns/scripts/mutational_patterns.R --input {用户提供的vcf目录} --output {用户提供的输出目录} --genome hg38 --rank 4 --nrun 100
```
3. 检查 `{output}/summary.json` 的样本数、SBS-96 矩阵维度和 NMF 参数；再使用列出的 CSV/图形做后续解读。

## 输出契约

- `snv_mutation_matrix.csv`：SBS-96 矩阵。
- `denovo_signatures.csv`、`denovo_contribution.csv`：NMF 输出。
- `mutation_spectrum.png`、`profile_96.png`、`denovo_signatures.png`、`denovo_contribution.png`：诊断图。
- `summary.json`：产物清单、样本数、SNV 总数、rank、nrun 和警告。

## 质控与限制

- 参考基因组包、依赖和缺失处理见 `references/environment.md` 与 `references/provisioning.md`。
- 该实现只做 SBS/SNV；indel、DBS、SV、COSMIC refitting 和癌种机制聚合不在本包范围。
- rank 不得大于样本数或 96；小样本 NMF 稳定性有限。所有写入仅在 `--output`，失败时不伪造摘要。
