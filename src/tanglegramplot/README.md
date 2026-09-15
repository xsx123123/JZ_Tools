# my.tanglegram — 可标注 bootstrap、可调分支颜色的 tanglegram（缠绕图）绘制函数

这是一个对 [`TangleR`](https://cran.r-project.org/package=TangleR) 包中 `common.tanglegram()` 的改进版 R 函数（`tanglegram.R`）。`TangleR` 虽然可以绘制 tanglegram，但存在两个明显不足：

1. **不能添加 bootstrap 支持度**——`common.tanglegram()` 会直接丢弃第二棵树上的所有自定义图层（节点标签、分支颜色等），并用硬编码默认值重绘；
2. **不能自定义拼接两棵树的分支颜色**。

`my.tanglegram()` 对两棵树**对称处理**：bootstrap 标签按同一套过滤逻辑同时标注在左右两棵树上（镜像对齐，不会压到树枝），分支颜色通过显式参数控制，连线、点、标签的所有视觉参数均可由用户调节。

## 特点

- **bootstrap 支持度标注**：自动读取内部节点的数字节点标签（IQ-TREE / RAxML 输出的支持度），按 `bs_cutoff` 阈值过滤后标注在**两棵**树上，左右对称对齐。
- **分支颜色可控**：`t1_color` / `t2_color` 分别控制左、右两棵树的分支颜色。
- **连线按 metadata 着色**：同名 tip 之间的连线按任意注释列（如 `family`）着色，`cols` 支持完全自定义配色（默认 viridis::turbo）。
- **tip 集合校验**：两棵树的 tip 不一致时直接报错并打印差异，避免连线静默错连。
- **保留拓扑**：镜像只是绘图坐标变换；配合 `pre.rotate()` 的节点旋转也不改变拓扑。
- **出版就绪**：返回标准 `ggplot` 对象，可继续叠加主题、图例、坐标轴后输出 PNG / PDF。

## 目录结构

```
src/tanglegramplot/
├── tanglegram.R      # my.tanglegram() 函数定义（source 此文件即可使用）
├── example.R         # 完整可运行的示例脚本（含数据导入、定根、绘图、保存）
├── Phylogenetic_tree_plot_3.pdf  # 示例输出
└── data/             # 测试数据
    ├── TnpA_protein_changeID.aligned.fa.treefile  # 左树（TnpA 蛋白，IQ-TREE 输出）
    ├── TnpD_protein_changeID.aligned.fa.treefile  # 右树（TnpD 蛋白，IQ-TREE 输出）
    └── tree_species_genus_family.csv              # tip 注释表（family/genus 等）
```

## 依赖项

- **R ≥ 4.1.0**（`tanglegram.R` 使用原生管道 `|>`，低于此版本会直接解析失败）。

```r
install.packages(c("ape", "ggplot2", "dplyr", "viridisLite", "optparse", "jsonlite"))
if (!requireNamespace("BiocManager", quietly = TRUE)) install.packages("BiocManager")
BiocManager::install("ggtree")

# 可选：用于 pre.rotate() 减少连线交叉（不使用也可正常运行）
install.packages("TangleR")
```

注意：配色用的是 **viridisLite**（viridis 包的轻量依赖，viridis 装了就一定有），不是 viridis。

## 使用前提（不满足会在画图前报错，请先逐条核对）

1. **两棵树的 tip 集合完全一致**（逐字符匹配）。`my.tanglegram()` 第 0 步会做双向 `setdiff` 校验，不一致直接 `stop` 并列出"仅在左树/仅在右树"的 tip。常见原因：两棵树的序列集不同、命名不一致（ID 后缀/大小写/引号）、有一棵的 tip 被过滤过。
2. **注释表（`%<+%` 挂接的 data.frame）必须有 `label` 列**，且树的每个 tip 都能在 `label` 列找到；`label` 不允许重复。多余的 label 不报错但会被 ggtree 忽略。
3. **`column` 参数指定的着色列必须存在于注释表中**（如 `"family"`），否则 `geom_line`/`geom_point` 的 `aes` 映射报错。
4. **bootstrap 值来源**：树上内部节点的**数字节点标签**（IQ-TREE/RAxML 的 `.treefile` 默认就是）。若你的树没有节点标签，bootstrap 标注会全部静默跳过（不是报错，但图上没有数字）；非数字标签（如根节点的空标签）自动跳过。
5. **用 `pre.rotate()` 旋转过节点后，构建 ggtree 必须 `ladderize = FALSE`**，否则旋转结果被梯子化重排覆盖。
6. 传 `cols` 自定义配色时，命名向量必须**覆盖该列全部水平**，缺水平 `scale_color_manual` 会直接报错（报信息会列出缺失水平）。
7. shell 里以 `#` 开头的颜色值（如 `"#C0392B"`）**必须加引号**，否则 `#` 后内容被 shell 当注释吃掉。

## 常见报错速查

| 报错 | 原因与处置 |
|---|---|
| `两棵树 tip 不一致：仅在左树: ... 仅在右树: ...` | 前提 1 不满足；按列出的 tip 核对两棵树的命名。 |
| 注释表挂接后连不上/`column` 找不到 | 前提 2/3；检查 CSV 是否有 `label` 列、列名拼写、`check.names=FALSE`。 |
| `could not find function "mutate"/"filter"` 等 | 依赖包没装全；按上面依赖项安装（函数内已用 `dplyr::` 前缀，装好包即可，无需 `library(dplyr)`）。 |
| `ggtree() 报警告 "Arguments in ... must be used"` | 你给 `ggtree()` 传了它不认识的参数（如旧写法 `color=`）；分支颜色由 `my.tanglegram()` 的 `t1_color/t2_color` 控制，无需在 `ggtree()` 传色。 |
| 图上没有 bootstrap 数字 | 树上没有数字节点标签，或全部低于 `bs_cutoff`；用 `bs_cutoff = 0` 排查。 |
| 提示找不到 TangleR | 可选依赖；装 `install.packages("TangleR")` 可减少连线交叉，不装不影响出图。 |

## 函数文档

### `my.tanglegram`

```r
my.tanglegram(
  tree1, tree2,
  column,
  cols      = NULL,
  t2_pad    = 1.5,
  lab_pad   = 0.15,
  line_alpha = 0.55,
  line_lwd  = 0.5,
  tip_size  = 2.5,
  t1_color  = "#C0392B",
  t2_color  = "#2980B9",
  bs_cutoff = 70,
  bs_size   = 2.2,
  bs_nudge  = 0.05,
  bs_color  = "grey20"
)
```

#### 参数

| 参数 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `tree1, tree2` | **必需** | 两个 `ggtree` 对象（通常用 `%<+%` 挂上注释表）。两棵树必须具有完全相同的 tip 集合，否则报错。若用 `pre.rotate()` 旋转过节点，构建时务必 `ladderize = FALSE`。 |
| `column` | **必需** | 注释列名（两棵树挂接的数据中都存在），用于给连线和 tip 点着色，如 `"family"`。 |
| `cols` | `NULL` | 该列各水平对应的颜色命名向量。为 `NULL` 时使用 viridis 的 `"turbo"` 调色板。 |
| `t2_pad` | `1.5` | 两棵树之间的水平间距。连线太陡或 tip 点相碰时调大。 |
| `lab_pad` | `0.15` | 连线起点/终点距离 tip 点的水平偏移（避免线段盖住 tip 点）。 |
| `line_alpha` | `0.55` | 连线透明度（0–1）。 |
| `line_lwd` | `0.5` | 连线线宽。 |
| `tip_size` | `2.5` | 两棵树 tip 点的大小。 |
| `t1_color` / `t2_color` | `"#C0392B"` / `"#2980B9"` | 左树 / 右树分支颜色（红 / 蓝）。 |
| `bs_cutoff` | `70` | bootstrap 显示阈值：数值节点标签**低于**该值的内部节点不标注。设为 `0` 标注全部节点，设为 `Inf` 完全关闭。非数字标签（如空的根节点标签）自动跳过。 |
| `bs_size` | `2.2` | bootstrap 标签字号。 |
| `bs_nudge` | `0.05` | 标签与节点的水平距离。左树标签右对齐节点（`hjust = 0`），右树镜像后左对齐（`hjust = 1`），两侧对称互不压枝。 |
| `bs_color` | `"grey20"` | bootstrap 标签颜色。 |

#### 返回值

一个 `ggtree`/`ggplot` 对象，可继续用 `ggplot2` 图层、主题和标度扩展。

#### 注意事项

- **右树的图层不会被保留**：函数只用 `tree2` 的坐标数据并重新 `geom_tree()` 绘制，因此挂在 `tree2` 上的图层（`geom_tiplab()` 等）不会生效；tip 标注请通过函数参数控制。`tree1` 的其他图层（如 `geom_tiplab()`）会保留，但其分支会被 `t1_color` 重绘覆盖——**两棵树的分支颜色都由 `t1_color` / `t2_color` 参数统一控制**，不要在 `ggtree()` 构造时传 `color`（不同 ggtree 版本行为不一致，新版本会将其忽略并报警告）。也不要给 `tree1` 加 `geom_nodelab()`，否则 bootstrap 标签会重复。
- **x 轴没有分支长含义**：返回图的 x 轴是"左树分支长 + 间隙 + 镜像右树"拼合出来的坐标，要么用 `theme_tree()` 隐藏坐标轴，要么在图注中说明。
- **拓扑安全**：镜像/旋转只改绘图坐标，不改 `phylo` 对象本身。可用 `ape::all.equal.phylo(tree, rotated_tree, use.edge.length = TRUE)` 验证。

## 使用示例

完整脚本见 [example.R](example.R)，可直接用 `data/` 下的测试数据运行：

```bash
cd src/tanglegramplot
Rscript example.R
```

核心流程如下：

```r
library(ape); library(ggtree); library(ggplot2)
source("tanglegram.R")

# ---------- 1. 读树 + 清理 tip.label ----------
TnpA_tree <- read.tree("data/TnpA_protein_changeID.aligned.fa.treefile")
TnpD_tree <- read.tree("data/TnpD_protein_changeID.aligned.fa.treefile")
TnpA_tree$tip.label <- gsub("^'|'$|^\"|\"$", "", TnpA_tree$tip.label)
TnpD_tree$tip.label <- gsub("^'|'$|^\"|\"$", "", TnpD_tree$tip.label)

# ---------- 2. 读注释表（label 列与 tip.label 对应）----------
tree_info <- read.csv("data/tree_species_genus_family.csv",
                      stringsAsFactors = FALSE, check.names = FALSE)

# ---------- 3. 外群定根 ----------
magnolia_tips    <- c("Magnolia_obovata", "Magnolia_officinalis")
TnpA_tree_rooted <- root(TnpA_tree, outgroup = magnolia_tips, resolve.root = TRUE)
TnpD_tree_rooted <- root(TnpD_tree, outgroup = magnolia_tips, resolve.root = TRUE)

# ---------- 4. 预旋转减少连线交叉（可选，需 TangleR）----------
rot      <- TangleR::pre.rotate(TnpA_tree_rooted, TnpD_tree_rooted)
TnpA_rot <- rot[[1]]
TnpD_rot <- rot[[2]]

# ---------- 5. 构建 ggtree 对象 ----------
# 分支颜色统一由 my.tanglegram() 的 t1_color / t2_color 参数控制，
# 不要在 ggtree() 里传 color（不同 ggtree 版本对该参数支持不一致）
tree1 <- ggtree(TnpA_rot, ladderize = FALSE) %<+% tree_info
tree2 <- ggtree(TnpD_rot, ladderize = FALSE) %<+% tree_info

# ---------- 6. 绘制 tanglegram ----------
p <- my.tanglegram(tree1, tree2,
                   column   = "family",       # 按 family 列给连线/tip 点着色
                   cols     = family_colors,  # 自定义配色；不传则用 viridis::turbo
                   t2_pad   = 2,              # 两树之间的间距
                   tip_size = 2.5,            # tip 点大小
                   t1_color = "#C0392B",      # 左树分支颜色
                   t2_color = "#2980B9") +    # 右树分支颜色
  theme_tree2() +
  theme(legend.position = "bottom")

# 图例只显示点、不显示线段
p <- p + guides(color = guide_legend(
  override.aes = list(linetype = 0, shape = 16, size = 4, alpha = 1)))

# ---------- 7. 保存 ----------
ggsave("Phylogenetic_tree_plot_3.png", width = 14, height = 10, dpi = 1000, plot = p)
ggsave("Phylogenetic_tree_plot_3.pdf", width = 14, height = 10, dpi = 1000, plot = p)
```

## 测试数据说明

| 文件 | 内容 |
| :--- | :--- |
| `data/TnpA_protein_changeID.aligned.fa.treefile` | TnpA 蛋白序列的系统发育树（IQ-TREE 输出，内部节点数字为 bootstrap 支持度） |
| `data/TnpD_protein_changeID.aligned.fa.treefile` | TnpD 蛋白序列的系统发育树（同上） |
| `data/tree_species_genus_family.csv` | tip 注释表：`label`（与 tip.label 一致）、`species`、`genus`、`family`、`family_cn`、`chinese_name`、`group` |

两棵树的 tip 集合一致（48 个物种 + `Reference`），可以两两配对连线。
