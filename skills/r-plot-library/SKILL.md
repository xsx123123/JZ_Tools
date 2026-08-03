---
name: r-plot-library
description: 当输入为基因集合 JSON、差异表达表或 ATAC 注释表且用户要求四集合 Venn、volcano 或 UpSet 图时触发。不负责差异检验、基因组注释生成、任意通用图形设计或超过四组的 Venn 图。
skill_id: r-plot-library
version: 0.9.0
category: analysis
---

## 何时使用

使用本技能将已有结果绘制为四集合 Venn、差异表达 volcano 或 ATAC 注释 UpSet 图。先按输入格式选择一个脚本；三者都会在输出目录写入 `summary.json`。

## 输入契约

| 脚本 | `--input` | 必要内容 | 主要可选参数 |
|---|---|---|---|
| `venn_plot.R` | JSON 文件 | 恰好四个命名数组 | `--title`、`--label`、`--label-size` |
| `volcano_plot.R` | CSV 或 TSV | `Symbol`、`log2FoldChange`、`pvalue`、`padj` | `--pval-cutoff`、`--lfc-cutoff`、`--label-n-top` |
| `atac_upset_plot.R` | CSV 或 TSV | `geneId`、`annotation` | `--sample-name`、`--top-n`、`--order-by` |

`--output` 必填且是唯一允许写入的位置。输入不会被修改。

## 执行步骤

1. 校验输入列或 JSON 顶层集合数量；不足时停止，不生成图。
2. 运行对应命令。例如绘制 volcano：
```bash
Rscript /workspace/.skills/r-plot-library/scripts/volcano_plot.R --input {用户提供的deg.csv} --output {用户提供的输出目录} --pval-cutoff 0.05 --lfc-cutoff 1 --label-n-top 15
```
3. 其他入口：
```bash
Rscript /workspace/.skills/r-plot-library/scripts/venn_plot.R --input {用户提供的four_sets.json} --output {用户提供的输出目录} --title "Four-set overlap"
Rscript /workspace/.skills/r-plot-library/scripts/atac_upset_plot.R --input {用户提供的annotation.csv} --output {用户提供的输出目录} --sample-name {样本名} --top-n 20
```
4. 只读取 `{output}/summary.json` 汇报产物和统计量。

## 输出契约

- Venn：`venn.png` 与 `venn.pdf`。
- Volcano：`volcano.png` 与 `volcano.pdf`。
- UpSet：`{sample-name}_atac_ann.png` 与 `{sample-name}_atac_ann.pdf`。
- 每次均产生 `{output}/summary.json`，包含 `tool`、`status`、`outputs`、`stats`、`warnings`。 

## 质控与限制

- 依赖与安装检查见 `references/environment.md`；缺包时由环境管理员配置，脚本不会下载软件。
- Venn 固定为四个集合；volcano 按 `padj < pval-cutoff` 和绝对 log2FC 判定显著性；UpSet 仅展示 `--top-n` 个注释类别。
- 所有写入都限制在 `--output`；已有同名结果会被覆盖。R 运行错误原样返回 stderr，不伪造 `summary.json`。
