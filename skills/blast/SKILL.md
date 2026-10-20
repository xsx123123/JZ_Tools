---
name: BLAST Homolog Locus Extraction
description: 当输入为标准化 BLAST HSP 制表符表且用户要求按 subject 坐标合并 HSP、筛选覆盖度并输出候选同源基因组位点时触发。不运行 BLAST、不创建数据库、也不提取 FASTA 序列。
skill_id: blast
version: 0.9.0
category: analysis
---

## 何时使用
将同一 database、query、subject 和链方向的 BLAST HSP 按 subject 坐标合并为位点，按非冗余 query 覆盖度和得分筛选。

## 输入契约
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 含 `database`、`method`、`query`、`sseqid`、坐标、`evalue`、`bitscore`、`qlen` 的 TSV。 |
| `--output` | 是 | 结果目录。 |
| `--max-gap` | 否 | 合并相邻 HSP 的最大 subject 间隔，默认 `10000`。 |
| `--min-cov` | 否 | 最低非冗余 query 覆盖百分比，默认 `0`。 |
| `--query` / `--method` | 否 | 输入记录过滤器。 |
| `--top-n` / `--global-top-n` | 否 | 保留每组或全局的最高分位点数；`0` 表示不限制。 |

## 执行步骤
1. 确认坐标和长度列为整数，`evalue`、`bitscore` 为数值。
2. 执行：
```bash
python /workspace/.skills/blast/scripts/extract_homolog_loci.py --input {blast_hsps.tsv} --output {result_dir} --max-gap 10000 --min-cov 30
```
3. 只读取 `{result_dir}/summary.json` 汇报 HSP 输入数、保留位点数和覆盖过滤阈值。

## 输出契约
- `loci_summary.tsv`：数据库、query、subject、方向、位点范围、HSP 数、非冗余覆盖度、得分与排名。
- `summary.json`：运行状态、相对产物路径、输入 HSP 数和位点数。

## 质控与限制
- 覆盖度按 query 坐标的非重叠并集计算；反向链由 `sstart > send` 推断。
- 此技能不提取序列，因此不能用输出替代实际 FASTA 验证。
- 缺少必需列或数值无法解析时停止执行。完整列规范和故障处置见 `references/usage.md`；环境见 `references/environment.md`。
