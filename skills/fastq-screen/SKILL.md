---
name: FastQ Screen 污染筛查
description: 当输入单端或双端 FASTQ 且用户要求评估多参考库比对比例、识别潜在污染时触发。不用于 FASTQ 质控剪切、比对或物种注释。
skill_id: fastq-screen
version: 0.9.0
category: analysis
---

# FastQ Screen 污染筛查

## 何时使用（Trigger）
- 对 FASTQ 运行已安装的 `fastq_screen`，汇总其文本与 HTML 报告时使用。
- 不创建参考索引；索引供给由 `references/provisioning.md` 管理。

## 输入契约（Input）
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 单端 FASTQ/FASTQ.GZ；双端时为 read 1。 |
| `--output` | 是 | 新建的结果目录。 |
| `--mate2` | 否 | read 2 FASTQ/FASTQ.GZ。 |
| `--config` | 是 | 管理员提供的 FastQ Screen 配置文件。 |
| `--threads` | 否 | 默认 `1`，不得超过平台分配 CPU。 |
| `--subset` | 否 | 每个 FASTQ 抽样 reads 数；不传则由安装态工具决定。 |

## 执行步骤（Workflow）
1. 确认配置和每个 FASTQ 均存在；先检查安装态命令及配置中声明的 aligner。
```bash
/workspace/.skills/fastq-screen/scripts/check_env.sh --config {管理员提供的fastq_screen.conf}
```
2. 执行单端或双端筛查：
```bash
python3 /workspace/.skills/fastq-screen/scripts/run_fastq_screen.py --input {用户提供的R1.fastq.gz} --output {用户指定的输出目录} --config {管理员提供的fastq_screen.conf} --threads 4 --subset 100000
```
```bash
python3 /workspace/.skills/fastq-screen/scripts/run_fastq_screen.py --input {用户提供的R1.fastq.gz} --mate2 {用户提供的R2.fastq.gz} --output {用户指定的输出目录} --config {管理员提供的fastq_screen.conf} --threads 4
```
3. 只读取 `summary.json` 汇报报告文件和 `*_screen.txt` 路径；若工具失败，返回 stderr，不得从部分结果推断污染结论。

## 输出契约（Output）
- 保留安装态 `fastq_screen` 生成的报告文件。
- 根目录 `summary.json` 记录命令、成败产物清单和发现的文本报告数。

## 质控与限制（QC & Constraints）
- 配置中的数据库路径、aligner 及索引必须由管理员预置；缺失时停止。
- `--subset` 是抽样，适合快速筛查；正式报告应记录实际值。
- wrapper 不改 FASTQ、配置或参考库，仅在 `--output` 写文件。
