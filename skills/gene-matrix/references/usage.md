# RSEM Gene Matrix Preparation 使用手册

## 合并
`--input` 是单个目录，目录内应包含 `sample.genes.results` 或 `sample.isoforms.results`。可选样本映射 CSV 必须有 `sample,sample_name` 两列。

```bash
python /workspace/.skills/gene-matrix/scripts/merge_rsem.py --input rsem_results --output matrices --sample-map samples.csv --include-fpkm
```

## 基础 QC
矩阵第一列为 feature ID，后续列为样本数值。至少需要两个样本。

```bash
python /workspace/.skills/gene-matrix/scripts/qc_expression_matrix.py --input matrices/tpm_matrix.tsv --output matrix_qc --detect-cutoff 1
```

若提示没有 RSEM 文件，检查文件后缀和目录路径；若提示重复 sample name，使用 `--sample-map` 提供唯一名称；若 QC 数值转换失败，先清除非数值表达字段。
