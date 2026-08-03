# 使用手册

脚本从 Seurat `meta.data` 中读取 `--group-col`，只保留 `--epi-groups` 和 `--ref-groups` 指定的细胞。两个参数为逗号分隔名称；空格会被去除。默认读取 `RNA` assay 的 `counts` layer。

端到端命令：

```bash
Rscript /workspace/.skills/scrna-seq/scripts/infercnv_run.R --input {seurat.rds} --output {输出目录} --group-col cell_type --epi-groups Tumor --ref-groups Tcell,Bcell --species human --threads 8
```

常见错误：

- `group-col is not found`：用 Seurat 元数据中的精确列名替换参数。
- `Some epi-groups/ref-groups are not present`：检查拼写、大小写与逗号分隔。
- `No expression genes overlap`：确认基因 ID 类型，并设置匹配的 `--gene-symbol-type`。
- `there is no package called`：由管理员按 `references/environment.md` 预置镜像。
