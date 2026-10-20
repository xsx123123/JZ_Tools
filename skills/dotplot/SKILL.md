---
name: dotplot
description: 当输入为 NUCmer .delta 比对文件且用户要求生成基因组共线性点阵图时触发。不负责执行 NUCmer、组装质控、序列比对或变异调用。
skill_id: dotplot
version: 0.9.0
category: analysis
---

# NUCmer Dotplot

## 何时使用
在 NUCmer 已经生成 `.delta` 文件后，绘制参考序列与查询序列的共线性点阵图。它只读取 delta 格式，不接受 FASTA 直接比对。

## 输入契约
| 参数 | 必填 | 说明 |
|---|---:|---|
| `--input` | 是 | 可读的 NUCmer `.delta` 文件。 |
| `--output` | 是 | 可写结果目录。 |
| `--min_length` | 否 | 最小比对片段长度，默认 `10000`。 |
| `--flanks` | 否 | 查询坐标过滤侧翼，默认 `10000`。 |
| `--format` | 否 | `pdf` 或 `png`，默认 `pdf`。 |

## 执行步骤
1. 确认 delta 文件包含 NUCmer 的头部和 7 列比对记录。
2. 运行：
```bash
Rscript /workspace/.skills/dotplot/scripts/run_dotplot.R --input alignment.delta --output results --min_length 10000 --format pdf
```
3. 若过滤后没有线段，降低 `--min_length` 或检查 delta 是否来自 NUCmer。

## 输出契约
成功时输出 `nucmer_dotplot.pdf` 或 `nucmer_dotplot.png` 与 `summary.json`。摘要记录实际过滤参数、输入和产物字节数。

## 质控与限制
需要 R 的 `optparse`、`jsonlite`、`tidyverse`、`ggplot2`。图中正负链以颜色区分；坐标单位按最大坐标自动显示为 Kbp 或 Mbp。多染色体或高度重复组装可能造成图形拥挤，不能仅凭图形推断结构变异。详见 `references/usage.md`。
