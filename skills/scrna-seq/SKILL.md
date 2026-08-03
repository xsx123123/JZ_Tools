---
name: scrna-seq
description: 当输入为带细胞分组元数据的 Seurat RDS 且用户要求基于指定肿瘤/上皮组与正常参考组进行 inferCNV 推断时触发。不负责从 FASTQ 建库、细胞注释、恶性判定、跨样本整合或非人类基因组坐标供给。
skill_id: scrna-seq
version: 0.9.0
category: analysis
---

## 何时使用

该技能封装 Seurat 对象的 inferCNV 推断。选择目标细胞组和不重叠的参考细胞组后，输出 inferCNV 运行目录、每细胞 burden/event 指标以及分组汇总。

## 输入契约

| 参数 | 必填 | 说明 |
|---|---|---|
| `--input` | 是 | 单个 Seurat `.rds` 文件。 |
| `--output` | 是 | 唯一输出目录。 |
| `--group-col` | 是 | `meta.data` 内的细胞分组列。 |
| `--epi-groups` | 是 | 逗号分隔的待测组。 |
| `--ref-groups` | 是 | 逗号分隔的正常参考组；不能与待测组重叠。 |
| `--species` | 否 | `human`（默认）或 `mouse`。 |

可用 `--assay`、`--layer`、`--cutoff`、`--threads`、`--no-hmm`、`--no-denoise` 调整运行。

## 执行步骤

1. 检查 RDS、分组列、目标组和参考组；所有组名必须精确匹配元数据。
2. 运行：
```bash
Rscript /workspace/.skills/scrna-seq/scripts/infercnv_run.R --input {用户提供的seurat.rds} --output {用户提供的输出目录} --group-col cell_type --epi-groups Tumor --ref-groups Tcell,Bcell,Endothelial --species human --threads 8
```
3. 仅依据 `{output}/summary.json` 汇报细胞数、基因数、分组摘要和警告。

## 输出契约

- `infercnv/`：inferCNV 的原始运行产物。
- `cnv_by_cell.csv`、`cnv_by_group.csv`：细胞与细胞组结果。
- `seurat_with_cnv.rds`：添加 `cnv_burden`、`cnv_events` 的 Seurat 对象。
- `summary.json`：产物清单、输入细胞数、用于推断的细胞/基因数和 warnings。

## 质控与限制

- 依赖见 `references/environment.md`。基因 ID 类型必须与 `--gene-symbol-type` 相符。
- inferCNV 指标是推断结果，不等同于恶性细胞标签；须结合表达、CNV 参考和实验设计判读。
- 脚本不修改输入 RDS，且所有写入仅在 `--output`。失败时返回底层 stderr，不生成成功摘要。
