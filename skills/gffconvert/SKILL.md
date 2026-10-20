---
name: GFF Feature Table Conversion
description: 当输入为 GFF3 注释文件且用户要求提取指定 feature 为标准基因坐标表时触发。不负责 GTF 转换、序列提取或注释数据库下载。
skill_id: gffconvert
version: 0.9.0
category: analysis
---

## 何时使用
将 GFF3 中指定类型（默认 `gene`）的记录转为便于下游注释、区间分析或检查的 TSV。需要转录本、CDS 或其他类型时覆盖 `--feature-type`。

## 输入契约
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 可读的 UTF-8 GFF3 文件；非注释行必须至少有 9 列。 |
| `--output` | 是 | 新建或复用的结果目录；工具仅在此目录写文件。 |
| `--feature-type` | 否 | 要保留的第三列 feature，默认 `gene`。 |
| `--filename` | 否 | TSV 文件名，默认 `features.tsv`。 |

## 执行步骤
1. 确认输入是制表符分隔的 GFF3，且目标 feature 名称明确。
2. 执行：
```bash
python /workspace/.skills/gffconvert/scripts/gff_to_tsv.py --input {annotation.gff3} --output {result_dir} --feature-type gene
```
3. 只读取 `{result_dir}/summary.json` 汇报提取条目数与被跳过的异常行数。

## 输出契约
- `features.tsv`：`GeneID`、`GeneName`、染色体、坐标、链、类型及描述列。
- `summary.json`：状态、相对产物路径、feature 数及格式异常行数。

## 质控与限制
- GFF 属性仅解析 `key=value` 形式；缺失标识符时写入 `NA`。
- 工具跳过列数少于 9 的非注释行，并在 `summary.json` 记录数量。
- 不修改输入文件；脚本错误时返回非零状态且不伪造成功摘要。详见 `references/usage.md` 和 `references/environment.md`。
