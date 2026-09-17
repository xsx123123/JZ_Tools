---
name: tanglegram
description: 当输入为两棵 tip 集合一致的系统发育树文件（如 IQ-TREE 的 .treefile）加一张含 label 列的注释表，且用户要求绘制 co-phylogenetic tanglegram（缠绕图）、并按 metadata 列着色连线、标注 bootstrap 支持度、分别调整左右树分支颜色，或要求出图保持输入树的原有结构（不 ladderize、不定根、不预旋转）时触发。不负责建树、比对或祖先状态重建；treefile 的预整理（仅旋转、不改拓扑）请配合 ladderize_treefile.R。
skill_id: tanglegram
version: 1.0.0
category: analysis
---

# Tanglegram（双树缠绕图）

## 何时使用

已有两棵**同一批 tip** 的系统发育树（如两个基因/蛋白家族分别用 IQ-TREE、RAxML 构建的 `.treefile`），希望面对面比较拓扑：镜像右树、同名 tip 连线、连线按某个注释列（如 family、genus、分组）着色、在**两棵树上**标注 bootstrap 支持度、左右树分支各自指定颜色。绘图默认**保持输入树的原有结构**（重建坐标并关闭 `ggtree()` 的默认 ladderize，不隐式定根或旋转）；如需减少连线交叉，先在输入侧做预整理。

不适用：只画单棵树（直接用 `ggtree`）；需要对树做比对、建树或祖先状态重建（本工具只可视化已有树）。

## 输入契约

| 参数 | 必填 | 说明 |
|---|---:|---|
| `--input` | 是 | 输入目录：含两棵树文件 + 一张注释 CSV。 |
| `--output` | 是 | 输出目录（自动创建）。 |
| `--tree1` / `--tree2` | 否 | 左右树文件名。缺省时若目录中恰有 2 个 `*.treefile` 则按字母序自动识别（第 1 个为左树）。 |
| `--metadata` | 否 | 注释 CSV 文件名。缺省时若目录中恰有 1 个 `*.csv` 自动识别。CSV 必须含 `label` 列（与树的 tip.label 完全一致），且包含 `--column` 指定的列。 |
| `--column` | 否 | 连线/tip 点的着色列名，默认 `family`。 |
| `--colors` | 否 | 配色 JSON 文件路径（绝对路径或 `--input` 内文件名），形如 `{"Fabaceae":"#0072B2"}`。必须覆盖该列全部水平。缺省用 viridisLite::turbo。 |
| `--outgroup` | 否 | 定根外群 tip，逗号分隔（如 `"Magnolia_obovata,Magnolia_officinalis"`）。缺省不定根。 |
| `--bs-cutoff` | 否 | bootstrap 显示阈值，只标注 ≥ 该值的内部节点；`0`=全部，`Inf`=关闭。默认 `70`。 |
| `--t2-pad` / `--tip-size` / `--line-alpha` / `--line-lwd` | 否 | 布局微调：两树间距 `1.5`、tip 点大小 `2.5`、连线透明度 `0.55`、线宽 `0.5`。 |
| `--t1-color` / `--t2-color` | 否 | 左/右树分支颜色，默认 `#C0392B` / `#2980B9`。**shell 会吃掉 `#` 后内容，传色值必须加引号**：`--t1-color '#C0392C'`。 |
| `--format` / `--width` / `--height` / `--dpi` | 否 | `pdf`/`png`/`both`（默认 `both`）、图宽 14、图高 10、PNG 分辨率 300（14x10 英寸 = 4200x3000 像素；更高分辨率渲染极慢）。 |
| `--no-rotate` | 否 | 即使装了 TangleR 也跳过预旋转（默认自动用 TangleR::pre.rotate 减少连线交叉）。 |
| `--no-ladderize` | 否 | 跳过绘图内部的坐标重建（等价 `preserve_topology=FALSE`）。默认重建坐标并关闭 ggtree 的 ladderize，按传入树原结构出图。 |

**输入硬前提（不满足会在前置校验直接报错并给出原因，不会画到一半失败）**：

1. 两棵树的 tip 集合**完全一致**（逐字符匹配；脚本会自动剥掉 tip.label 首尾的单/双引号）。
2. 注释 CSV 有 `label` 列，且树的每个 tip 都能在 `label` 列找到（多余的 label 只警告）。
3. `--column` 指定的列在 CSV 中真实存在。
4. 树上要有 bootstrap 值：内部节点的**数字节点标签**（IQ-TREE/RAxML 默认输出即是）。非数字标签（如根节点的空标签）自动跳过。
5. R ≥ 4.1；R 包 `ape`、`ggtree`(Bioconductor)、`ggplot2`、`dplyr`、`viridisLite` 已安装（缺哪个报错里会直接给安装命令）。

**拓扑与展示结构**：默认 `preserve_topology=TRUE` 会把两棵 ggtree 对象的坐标按其底层 phylo 重建（`ladderize = FALSE`），出图顺序与传入树完全一致，`%<+%` 挂的注释保留。注意：绘图**之前**的 `root()`/`pre.rotate()` 重排不受该参数控制——想让出图与原始 `.treefile` 一致，输入侧就不要做这些步骤；若只是想整理枝形（仅旋转内部节点、不改拓扑与数值），可先用 `ladderize_treefile.R`：`Rscript ladderize_treefile.R 输入.treefile 输出.treefile`。

## 执行步骤

```bash
Rscript /workspace/.skills/tanglegram/scripts/run_tanglegram.R \
  --input /workspace/input/trees \
  --output /workspace/output/tanglegram \
  --column family \
  --outgroup "Magnolia_obovata,Magnolia_officinalis" \
  --bs-cutoff 70 --format both
```

目录只有两棵 treefile + 一个 csv 时可省掉 `--tree1/--tree2/--metadata` 全走自动识别。运行后**只读 `summary.json` 汇报**，不解析大结果文件。

## 输出契约

- `tanglegram.pdf` / `tanglegram.png`：缠绕图（`--format` 决定）。
- `summary.json`：状态、输入/参数清单、产物路径与字节数、统计量（tip 数、内部节点数、被标注的 bootstrap 节点数）、警告列表。

## 质控与限制

- bootstrap 标注阈值默认 70，可被 `--bs-cutoff` 覆盖；根节点/空标签静默跳过。
- 未装 TangleR 时不做预旋转，连线交叉可能较多（warning 写入 summary.json，不影响正确性）。
- 返回图的 x 轴是"左树分支长 + 间隙 + 镜像右树"的拼合坐标，**没有分支长含义**；出图后建议隐藏坐标轴或在图注中说明。
- 镜像、旋转与 ladderize 重建只改绘图坐标不改拓扑；可用 `ape::all.equal.phylo` 校验。
- 输入文件只读，所有写入限定在 `--output` 内；失败时原样返回 stderr，不伪造结果。
- 完整参数表、常见报错处置与配色 JSON 模板见 `references/usage.md`。
