---
name: ATAC 工具集
description: 当输入 GTF 注释或 ATAC-seq 峰位点与 BAM 清单，且用户要求生成 TSS BED 或峰计数矩阵时触发。不用于比对、peak calling 或完整 ATAC-seq 流程。
skill_id: atac-tools
version: 0.9.0
category: analysis
---

# ATAC 工具集

## 何时使用（Trigger）
- 对 GTF/GTF.GZ 提取指定 feature 的 TSS BED，或对共识 peaks 和 BAM 清单生成计数矩阵时使用。
- 不负责 FASTQ 比对、MACS peak calling、质控绘图或 IDR 共识峰判定。

## 输入契约（Input）
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--operation` | 是 | `tss` 或 `matrix`。 |
| `--input` | 是 | `tss` 时为 GTF/GTF.GZ；`matrix` 时为两列 TSV（`sample_id`、`bam`）。 |
| `--output` | 是 | 新建的结果目录。 |
| `--feature` | 否 | `tss` 提取的 GTF feature，默认 `transcript`。 |
| `--peaks` | matrix 必填 | 三列或更多列 BED 共识峰文件。 |

## 执行步骤（Workflow）
1. 先运行环境检查；失败时原样报告 stderr，不要尝试安装或替换工具。
2. TSS：
```bash
/workspace/.skills/atac-tools/scripts/check_env.sh --operation tss
python3 /workspace/.skills/atac-tools/scripts/run_atac_tools.py --operation tss --input {用户提供的注释.gtf.gz} --output {用户指定的输出目录} --feature transcript
```
3. 峰矩阵：输入清单必须有表头，且每个 BAM 路径存在。
```bash
/workspace/.skills/atac-tools/scripts/check_env.sh --operation matrix
python3 /workspace/.skills/atac-tools/scripts/run_atac_tools.py --operation matrix --input {用户提供的bam_manifest.tsv} --peaks {前置共识峰.bed} --output {用户指定的输出目录}
```
4. 成功后只读取 `{output}/summary.json` 汇报；缺失文件、清单列错误或外部命令失败时停止并返回错误。

## 输出契约（Output）
- `tss`：`tss.bed.gz` 和 `summary.json`。
- `matrix`：`peak_counts.tsv` 和 `summary.json`；列为 `chrom`、`start`、`end` 与清单中的样本名。

## 质控与限制（QC & Constraints）
- `tss` 忽略注释行、列数不足、未知链和无法解析坐标的记录；统计写入摘要。
- `matrix` 要求至少一个样本、每个 BAM 可读；使用安装态 `bedtools multicov`，不改输入文件。
- 产物只写入 `--output`；禁止把结果解读为 peak calling 或差异可及性结论。
