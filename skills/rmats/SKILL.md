---
name: rMATS event merger
description: 当输入为一个或多个 rMATS 事件结果目录且用户要求按 FDR、PSI 和支持 reads 汇总可变剪接事件时触发。不运行 rMATS 本身或生成 BAM 比对结果。
skill_id: rmats
version: 0.9.0
category: analysis
---

# 何时使用
递归合并 `SE`、`MXE`、`A3SS`、`A5SS` 与 `RI` 的 `MATS.JC` 结果，并输出汇总或事件明细。

# 输入契约
| 参数 | 说明 |
|---|---|
| `--input` | 包含 rMATS 结果目录的根目录。 |
| `--output` | 结果目录。 |
| `--mode` | `summary` 或 `details`，默认 `details`。 |
| `--fdr` / `--psi` / `--min-reads` | 阈值，默认 `0.05`、`0.1`、`10`。 |

# 执行步骤
```bash
python /workspace/.skills/rmats/scripts/merge_rmats.py \
  --input /workspace/input/rmats \
  --output /workspace/output/rmats-merged \
  --mode summary --fdr 0.05 --psi 0.1 --min-reads 10
```

# 输出契约
- `rmats_summary.tsv` 或 `rmats_details.tsv`：模式对应的结果表。
- `summary.json`：发现的比较目录、保留事件数、阈值和产物清单。

# 质控与限制
有 `FDR` 的成对比较同时应用 FDR、`IncLevelDifference` 绝对值和 reads 阈值；无 FDR 的结果只应用 reads 阈值。缺失事件文件会跳过，完全找不到 `SE.MATS.JC.txt` 时失败。
