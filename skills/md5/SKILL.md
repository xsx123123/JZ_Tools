---
name: MD5 manifest verifier
description: 当输入为包含 MD5 与文件路径的清单且用户要求批量核验测序或交付文件完整性时触发。不负责下载、复制、重命名或生成原始数据。
skill_id: md5
version: 0.9.0
category: analysis
---

# 何时使用
并行校验 md5sum 格式清单中的文件，生成可审计 TSV 和结构化摘要。

# 输入契约
| 参数 | 说明 |
|---|---|
| `--input` | 每行 `MD5 文件路径` 的文本清单；相对路径相对于清单所在目录。 |
| `--output` | 结果目录。 |
| `--threads` | 可选并发数，默认 `4`。 |

# 执行步骤
```bash
python /workspace/.skills/md5/scripts/verify_manifest.py \
  --input /workspace/input/md5.txt \
  --output /workspace/output/md5-check \
  --threads 8
```

# 输出契约
- `verification.tsv`：每个条目的期望值、实际值、状态和路径。
- `summary.json`：状态计数、产物清单与失败提示。

# 质控与限制
成功退出码仅表示全部条目通过；不匹配、缺失或无法读取时仍写完整报告并以非零退出。文件名可含空格，但清单中的 MD5 必须在第一列。
