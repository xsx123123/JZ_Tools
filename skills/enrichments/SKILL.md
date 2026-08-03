---
name: enrichments
description: 当输入为差异分析结果和 GO OBO/基因关联文件，且用户要求单个或批量 GO 富集时触发。不负责差异分析、基因 ID 注释构建、通路数据库下载或生物学结论外推。
skill_id: enrichments
version: 0.9.0
category: analysis
---

# GO Enrichment

## 何时使用
对已有差异结果表执行 GO 术语富集，或按差异分析统计表批量处理多个 contrast 时使用。输入是用户提供的 OBO 和基因关联文件，而非联网检索的参考库。

## 输入契约
| 字段 | 必填 | 说明 |
|---|---:|---|
| `--input` | 是 | JSON manifest；`mode` 为 `single` 或 `batch`。 |
| `--output` | 是 | 可写的结果目录。 |
| `obo`、`assoc` | 是 | GO 本体和物种基因关联文件。 |
| `table` | `single` | 差异表，默认基因列 `GeneID`、校正 p 列 `padj`、LFC 列 `log2FoldChange`。 |
| `deg_info`、`deg_dir` | `batch` | 对比统计表与对应差异结果目录。 |

## 执行步骤
1. 将 OBO 与关联文件提供在 `ref/`，或在 manifest 中给出已挂载的可读路径。
2. 运行统一入口：
```bash
python /workspace/.skills/enrichments/scripts/run_enrichment.py --input enrich.json --output results
```
3. 单表例子：`{"mode":"single","obo":"ref/go-basic.obo","assoc":"ref/gene_association.tsv","table":"contrast_DEG.csv","gene_col":"GeneID","padj_th":0.05,"lfc_th":1}`。
4. 检查 `results/summary.json` 和生成的 CSV；空结果表代表没有通过筛选的富集项，不等同于程序失败。

## 输出契约
输出目录始终写入 `summary.json`，包括运行状态、模式、命令和产物清单。单表模式按指定名称输出 GO 结果 CSV；批量模式按 contrast 建立结果。结果中的 p 值和候选基因都依赖输入关联文件版本。

## 质控与限制
确认 gene ID 类型与关联文件一致，差异表的列名正确，且阈值与研究设计一致。运行需要 R 的 `optparse`、`ontologyIndex`、`data.table` 等依赖；批量模式还需要 Python 的 `pandas`、`loguru`。大参考文件不随包分发，供给方式见 `references/provisioning.md`；参数、错误处理见 `references/usage.md`。
