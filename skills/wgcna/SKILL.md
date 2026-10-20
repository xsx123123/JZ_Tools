---
name: wgcna
description: 当输入为已完成 WGCNA 网络计算的 RDS 对象且用户要求针对一个模块和一个性状筛选 hub genes、输出 MM-GS 散点图时触发。不负责网络构建、软阈值选择、模块检测、性状编码或通用差异表达分析。
skill_id: wgcna
version: 0.9.0
category: analysis
---

## 何时使用

本技能接收已产生的 WGCNA 中间对象，计算给定模块的 Module Membership（MM）和指定性状的 Gene Significance（GS），并按阈值筛选 hub genes。

## 输入契约

| 参数 | 必填 | 说明 |
|---|---|---|
| `--input` | 是 | RDS list，含 `datExpr`、`datTraits`、`MEs`、`moduleColors`。行名必须是样本 ID。 |
| `--output` | 是 | 唯一输出目录。 |
| `--target-module` | 是 | 模块颜色名，不带 `ME` 前缀。 |
| `--target-trait` | 是 | `datTraits` 的数值性状列。 |
| `--mm-cutoff` | 否 | MM 绝对值阈值，默认 0.8。 |
| `--gs-cutoff` | 否 | GS 绝对值阈值，默认 0.5。 |

## 执行步骤

1. 确认四个对象、基因顺序和样本行名完全可对应，且性状为数值。
2. 运行：
```bash
Rscript /workspace/.skills/wgcna/scripts/identify_wgcna_hub_genes.R --input {用户提供的wgcna_objects.rds} --output {用户提供的输出目录} --target-module turquoise --target-trait phenotype --mm-cutoff 0.8 --gs-cutoff 0.5
```
3. 从 `{output}/summary.json` 读取 hub gene 数量与模块内基因数，再报告结果。

## 输出契约

- `HubGenes_{module}_{trait}.csv`：满足 MM、GS 阈值的基因及相关值。
- `Scatter_MM_GS_{module}_{trait}.png`：模块内 MM 与 GS 图。
- `summary.json`：产物、样本数、模块基因数、hub gene 数和阈值。

## 质控与限制

- 输入对象结构、R 包见 `references/usage.md` 与 `references/environment.md`。
- 相关性不表示因果关系；样本数过少、性状近乎恒定或模块过小时应停止解读。
- 脚本不重建 WGCNA 网络，不修改输入，只写 `--output`；底层错误会保留在 stderr。
