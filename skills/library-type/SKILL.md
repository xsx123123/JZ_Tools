---
name: RNA library strandedness detector
description: 当输入为 RSeQC 链特异性汇总文本且用户要求判断 RNA 文库类型或检查配置冲突时触发。不从 BAM 文件重新计算 RSeQC 指标。
skill_id: library-type
version: 0.9.0
category: analysis
---

# 何时使用
从 RSeQC `infer_experiment.py` 汇总文本检测 `fr-firststrand`、`fr-secondstrand` 或 `fr-unstranded`。

# 输入契约
| 参数 | 说明 |
|---|---|
| `--input` | RSeQC 输出文本。 |
| `--output` | 结果目录；所有产物仅写入此处。 |
| `--configured-type` | 可选，`auto` 或三种文库类型之一，默认 `auto`。 |

# 执行步骤
```bash
python /workspace/.skills/library-type/scripts/detect_library_type.py \
  --input /workspace/input/infer_experiment.txt \
  --output /workspace/output/library-type \
  --configured-type auto
```

# 输出契约
- `library_type.txt`：最终检测到的单个类型。
- `warning.txt`：配置与检测不一致时的说明，其他情况写入 `OK`。
- `summary.json`：检测分数、类型、冲突状态和产物清单。

# 质控与限制
只有平均证据值严格大于 `0.75` 才判定为相应链特异类型。无证据、格式错误或相互矛盾的低分证据会回退为 `fr-unstranded`。
