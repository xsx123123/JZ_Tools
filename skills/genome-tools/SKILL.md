---
name: VCFtools heterozygosity calculator
description: 当输入为 VCFtools `--het` 结果且用户要求计算观测与期望杂合率时触发。不执行变异检测、VCF 解析或群体统计推断。
skill_id: genome-tools
version: 0.9.0
category: analysis
---

# 何时使用
将 VCFtools 杂合度结果表转换为附带 Ho（观测杂合率）和 He（期望杂合率）的 TSV。

# 输入契约
| 参数 | 说明 |
|---|---|
| `--input` | VCFtools `--het` 输出；首个非空行是表头，数据行须含五列。 |
| `--output` | 新建或已有的结果目录；脚本只在此目录写文件。 |
| `--decimals` | 可选，Ho/He 小数位，默认 `6`。 |

# 执行步骤
```bash
python /workspace/.skills/genome-tools/scripts/calculate_heterozygosity.py \
  --input /workspace/input/sample.het \
  --output /workspace/output/heterozygosity \
  --decimals 6
```

# 输出契约
- `heterozygosity.tsv`：原始列及 `Ho`、`He` 两列。
- `summary.json`：成功状态、产物相对路径、处理和跳过的记录数。

# 质控与限制
`N_SITES` 为零时 Ho/He 写为 `NA`。格式不为五列或数值无效的行会跳过并计入摘要；没有有效数据时命令失败。详见 `references/usage.md`。
