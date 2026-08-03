---
name: KEGG 离线注释下载
description: 当输入一个包含 KEGG organism code 的文本文件且用户要求下载 KEGG REST 原始注释并生成物种 TSV/GMT 文件时触发。不用于通路富集统计、私有数据库同步或无网络环境的首次下载。
skill_id: kegg-pull
version: 0.9.0
category: analysis
---

# KEGG 离线注释下载

## 何时使用（Trigger）
- 用 organism code 清单（每行一个，如 `ath`、`hsa`）生成可离线使用的 KEGG 原始表、TSV 和 GMT 时使用。
- 不执行富集分析；网络受限时可用已存在的 raw 文件配合 `--skip-download` 重建。

## 输入契约（Input）
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | UTF-8 文本文件；每行一个 KEGG organism code，空行和 `#` 注释被忽略。 |
| `--output` | 是 | 新建的输出根目录。 |
| `--skip-download` | 否 | 不联网，仅从既有 raw 文件重建派生文件。 |
| `--raw-only` | 否 | 仅下载原始表，不写 TSV/GMT。 |
| `--delay` | 否 | 请求间隔秒数，默认 `1.0`。 |
| `--timeout` | 否 | 单次请求超时秒数，默认 `60`。 |

## 执行步骤（Workflow）
1. 检查 Python 和网络策略；首次下载必须允许访问 KEGG REST。
```bash
/workspace/.skills/kegg-pull/scripts/check_env.sh
```
2. 下载并构建：
```bash
python3 /workspace/.skills/kegg-pull/scripts/run_kegg_pull.py --input {用户提供的organisms.txt} --output {用户指定的输出目录} --delay 1.0 --timeout 60
```
3. 成功后仅读取 `{output}/summary.json` 汇报各物种状态；某物种失败时 wrapper 默认继续其余物种，并把失败写入 `warnings`。

## 输出契约（Output）
- 每个物种目录包含 `raw/` 原始响应、`gene_pathway.tsv`、`pathway_names.tsv`、`pathway_gene.gmt` 和物种 `summary.json`。
- 根目录 `summary.json` 汇总成功/失败物种和全部产物路径。

## 质控与限制（QC & Constraints）
- organism code 必须是 KEGG 支持代码；HTTP 或响应格式失败会记录为 warning，不伪造注释。
- 默认每次请求间隔 `1.0` 秒；不要设置为零。
- 不改输入清单，所有下载与派生产物只写入 `--output`。
