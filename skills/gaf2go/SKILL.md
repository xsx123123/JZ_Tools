---
name: GO Term Annotation
description: 当输入为基因-GO 对照表且用户要求用 GO OBO 本体补充术语名称、命名空间或废弃状态时触发。不负责 UniProt 标识符映射、GO 富集检验或下载本体文件。
skill_id: gaf2go
version: 0.9.0
category: analysis
---

## 何时使用
对已有的制表符分隔 `Gene_ID`/`GO_ID` 表附加 GO term 名称和 namespace。它识别 OBO 中的 `alt_id`，默认排除已废弃术语。

## 输入契约
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 含表头的基因-GO TSV。 |
| `--output` | 是 | 结果目录；仅此处写入产物。 |
| `--obo` | 否 | GO OBO 路径，默认 `ref/go-basic.obo`。 |
| `--gene-col` / `--go-col` | 否 | 输入列名，默认 `Gene_ID` / `GO_ID`。 |
| `--include-obsolete` | 否 | 保留废弃 GO term。 |

## 执行步骤
1. 由管理员将本体供给到 `ref/go-basic.obo`，或显式提供可读 OBO 路径。
2. 执行：
```bash
python /workspace/.skills/gaf2go/scripts/annotate_go_terms.py --input {gene_go.tsv} --output {result_dir} --obo ref/go-basic.obo
```
3. 读取 `{result_dir}/summary.json`，汇报注释行数、未知 GO ID 和被过滤废弃项。

## 输出契约
- `gene_go_annotated.tsv`：基因、GO ID、`GO_Namespace`、`GO_Term`、`GO_Obsolete`。
- `summary.json`：相对产物路径、OBO 条目数、未识别/排除数量及警告。

## 质控与限制
- 输入必须有表头和指定的两列；未知 GO ID 不会伪造名称，而是被计入摘要。
- 默认不包含 `is_obsolete: true` 的术语；可通过 `--include-obsolete` 覆盖。
- OBO 是外部参考数据，不包含在技能包内；缺失时按 `references/provisioning.md` 处置。环境与示例见 `references/environment.md`、`references/usage.md`。
