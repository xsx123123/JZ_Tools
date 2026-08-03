# 使用手册

`--input` 必须反序列化为 list：

- `datExpr`：样本 × 基因的数值矩阵或 data.frame；列名是基因名。
- `datTraits`：样本 × 性状的 data.frame；行名与 `datExpr` 一致。
- `MEs`：样本 × module eigengene 的矩阵；列名为 `MEturquoise` 等。
- `moduleColors`：长度等于基因数、顺序与 `datExpr` 列一致的颜色向量。

端到端命令：

```bash
Rscript /workspace/.skills/wgcna/scripts/identify_wgcna_hub_genes.R --input {wgcna_objects.rds} --output {输出目录} --target-module turquoise --target-trait phenotype
```

常见错误：

- `Input RDS list must contain`：在上游网络步骤按上述键名保存对象。
- `Sample row names do not match`：对齐三个矩阵的样本行名后重新导出 RDS。
- `target module is absent`：传不含 `ME` 前缀的真实模块色名。
