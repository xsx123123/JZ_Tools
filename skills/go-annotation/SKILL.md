---
name: GO Annotation Table Preparation
description: 当输入为 GAF 或制表符 GO 注释且用户要求提取基因-GO 关联、或将 UniProt 注释映射到 Ensembl/GeneID 时触发。不负责 GO 术语层级扩展或富集统计。
skill_id: go-annotation
version: 0.9.0
category: analysis
---

## 何时使用
使用 `gaf_extract.py` 从 GAF/TSV 生成去重的基因-GO 表；使用 `uniprot_gaf_map.py` 在联网环境中将 UniProt GAF 映射到 Ensembl、GeneID 或 Ensembl Genomes。

## 输入契约
| 工具 | `--input` | `--output` | 关键可选参数 |
| --- | --- | --- | --- |
| `gaf_extract.py` | GAF 2.x 或带表头 TSV | 结果目录 | `--gene-col`、`--go-col`、`--filename` |
| `uniprot_gaf_map.py` | 含 UniProt accession 的 GAF | 结果目录 | `--to-db`、`--filename` |

## 执行步骤
1. 对已有目标基因 ID 的文件执行：
```bash
python /workspace/.skills/go-annotation/scripts/gaf_extract.py --input {annotations.gaf} --output {result_dir}
```
2. 对 UniProt accession 需要在线映射时执行：
```bash
python /workspace/.skills/go-annotation/scripts/uniprot_gaf_map.py --input {annotations.gaf} --output {result_dir} --to-db Ensembl
```
3. 读取各自输出目录的 `summary.json`，按映射数量、未映射数量和警告汇报。

## 输出契约
- `gene_go.tsv`：去重的 `Gene_ID` 与 `GO_ID` 两列。
- `mapped_gene_go.tsv`：目标 ID、GO、描述和原始 UniProt accession。
- `summary.json`：工具、成功状态、相对产物路径、行数统计与警告。

## 质控与限制
- TSV 的列名或零基列索引必须通过 `--gene-col`、`--go-col` 明确；默认值适用于标准 GAF。
- UniProt 映射依赖 HTTPS 和服务可用性；网络、限流或服务错误应原样返回，不应离线猜测映射。
- 所有输出仅写入 `--output`。详细参数和故障处置在 `references/usage.md`，依赖见 `references/environment.md`。
