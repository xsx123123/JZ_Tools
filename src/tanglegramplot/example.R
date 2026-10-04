# =============================================================================
# example.R — my.tanglegram() 完整使用示例
#
# 用 data/ 下的测试数据（TnpA / TnpD 两棵系统发育树 + 物种注释表）
# 绘制带 bootstrap 支持度和分支颜色的 tanglegram（缠绕图）。
#
# 运行方式：
#   cd src/tanglegramplot
#   Rscript example.R
# =============================================================================

library(ape)
library(ggtree)
library(ggplot2)

source("tanglegram.R")   # 载入 my.tanglegram()

tree_dir <- "data"
save_dir <- "."

# ========== 1. 读树（IQ-TREE 输出的 .treefile，节点数字为 bootstrap）==========
TnpD_tree <- read.tree(file.path(tree_dir, "TnpD_protein_changeID.aligned.fa.treefile"))
TnpA_tree <- read.tree(file.path(tree_dir, "TnpA_protein_changeID.aligned.fa.treefile"))

# ========== 2. 去掉 tip.label 首尾可能存在的单/双引号 ==========
TnpD_tree$tip.label <- gsub("^'|'$", "", TnpD_tree$tip.label)
TnpA_tree$tip.label <- gsub("^'|'$", "", TnpA_tree$tip.label)
TnpD_tree$tip.label <- gsub("^\"|\"$", "", TnpD_tree$tip.label)
TnpA_tree$tip.label <- gsub("^\"|\"$", "", TnpA_tree$tip.label)

# ========== 3. 读注释表（label 列必须与 tip.label 一致）==========
tree_info <- read.csv(file.path(tree_dir, "tree_species_genus_family.csv"),
                      stringsAsFactors = FALSE, check.names = FALSE)

# ========== 4. 校验注释表与树的 tip 是否互相匹配（对两棵树分别 warning）=========
for (tree_nm in c("TnpD_tree", "TnpA_tree")) {
  tr <- get(tree_nm)
  missing_in_tree  <- setdiff(tree_info$label, tr$tip.label)
  missing_in_table <- setdiff(tr$tip.label, tree_info$label)
  if (length(missing_in_tree) > 0)
    warning(tree_nm, " — 注释表中有、树中没有的 label: ",
            paste(missing_in_tree, collapse = ", "), call. = FALSE)
  if (length(missing_in_table) > 0)
    warning(tree_nm, " — 树中有、注释表中没有的 tip: ",
            paste(missing_in_table, collapse = ", "), call. = FALSE)
}

# ========== 5. 科的配色（按 family 列着色连线 / tip 点）==========
family_colors <- c(
  "Amaranthaceae"   = "#fe65b3",
  "Asteraceae"      = "#CC79A7",
  "Brassicaceae"    = "#ffd2d8",
  "Fabaceae"        = "#0072B2",
  "Pinaceae"        = "#007aff",
  "Poaceae"         = "#56B4E9",
  "Rosaceae"        = "#009E73",
  "Rutaceae"        = "#4cd964",
  "Vitaceae"        = "#F5C710",
  "Lauraceae"       = "#E69F00",
  "Magnoliaceae"    = "#D55E00",
  "Annonaceae"      = "#ff3b30",
  "Aristolochiaceae" = "#8E44AD",
  "Saururaceae"     = "#16A085",
  "Canellaceae"     = "#95A5A6",
  "Reference"       = "#000000"
)

# ========== 6-7. 定根 / 预旋转（可选）==========
# preserve_input_topology = TRUE 时完全跳过 root() 和 pre.rotate()：
#   - ape::root() 会按 cladewise 重排边和 tip 顺序，改变输入树的展示结构
#   - tangler::pre.rotate() 会主动旋转内部节点以减少连线交叉
# 两者都会让出图与输入的 .treefile 结构不一致；置 FALSE 可恢复旧行为
preserve_input_topology <- FALSE

if (preserve_input_topology) {
  message("preserve_input_topology = TRUE：跳过定根和预旋转，按输入树原结构出图")
  magnolia_tips <- c("Magnolia_obovata", "Magnolia_officinalis")
  TnpA_tree_rooted <- root(TnpA_tree, outgroup = magnolia_tips, resolve.root = TRUE)
  TnpD_tree_rooted <- root(TnpD_tree, outgroup = magnolia_tips, resolve.root = TRUE)
  TnpA_rot <- TnpA_tree_rooted
  TnpD_rot <- TnpD_tree_rooted
} else {
  # root() 要求外群单系；当前两棵树中两棵 Magnolia 互为姐妹，可直接作外群
  magnolia_tips <- c("Magnolia_obovata", "Magnolia_officinalis")
  TnpA_tree_rooted <- root(TnpA_tree, outgroup = magnolia_tips, resolve.root = TRUE)
  TnpD_tree_rooted <- root(TnpD_tree, outgroup = magnolia_tips, resolve.root = TRUE)

  # pre.rotate() 来自 tangler 包；未安装时跳过（仅影响美观，不影响正确性）
  if (requireNamespace("tangler", quietly = TRUE)) {
    rot      <- tangler::pre.rotate(TnpA_tree_rooted, TnpD_tree_rooted)
    TnpA_rot <- rot[[1]]
    TnpD_rot <- rot[[2]]
  } else {
    message("未安装 TangleR，跳过 pre.rotate()（连线交叉可能较多）")
    TnpA_rot <- TnpA_tree_rooted
    TnpD_rot <- TnpD_tree_rooted
  }
}

# ========== 8. 构建两棵 ggtree（左 TnpA、右 TnpD）==========
# my.tanglegram() 会丢弃 tree2 上挂载的图层（只用其坐标重绘），bootstrap 标签
# 由函数按 bs_cutoff 对称地画在两棵树上，因此这里都不需要手动加 geom_nodelab；
# 给 tree1 加 geom_nodelab 会导致 bootstrap 标签重复。
tree1 <- ggtree(TnpA_rot, ladderize = FALSE) %<+% tree_info
tree2 <- ggtree(TnpD_rot, ladderize = FALSE) %<+% tree_info

# ========== 9. 绘制带标签的 tanglegram ==========
p <- my.tanglegram(
  tree1, tree2,
  column      = "family",
  cols        = family_colors,
  tiplab      = TRUE,   # 右树 tip 标签（右对齐成一列）
  t2_pad      = 6,
  lab_pad     = 0.3,
  # tip 标签列右缘距最右 tip 点的距离；右树同时有 bootstrap 节点标签，
  # 标签列需整体右移（≥ 最长标签宽度）才不会与节点标签重叠
  tiplab_pad  = 1.2,
  tiplab_size = 2.2
) +
  # expand 给右侧标签列留出边距，避免贴边/被裁剪
  scale_x_continuous(breaks = seq(0, 10, by = 0.5),
                     expand = expansion(mult = c(0.01, 0.08))) +
  theme_tree2() +
  theme(legend.position = "bottom")

# 图例只显示点、不显示线段
p <- p + guides(color = guide_legend(
  override.aes = list(linetype = 0, shape = 16, size = 4, alpha = 1))) +
  theme(legend.position = "bottom")

# ========== 9b. 不含 tip 标签的 tanglegram（结构更紧凑）==========
# 与 p 共用 tree1 / tree2，仅关闭 tiplab；bootstrap 仍对称标注在两棵树上
p_nolab <- my.tanglegram(
  tree1, tree2,
  column      = "family",
  cols        = family_colors,
  tiplab      = FALSE,
  t2_pad      = 6,
  lab_pad     = 0.3
) +
  scale_x_continuous(breaks = seq(0, 10, by = 0.5)) +
  theme_tree2() +
  theme(legend.position = "bottom")

p_nolab <- p_nolab + guides(color = guide_legend(
  override.aes = list(linetype = 0, shape = 16, size = 4, alpha = 1))) +
  theme(legend.position = "bottom")

# ========== 10. 保存 ==========
ggsave(file.path(save_dir, "Phylogenetic_tree_plot_2.png"),
       width = 15, height = 8, dpi = 1000, plot = p)
ggsave(file.path(save_dir, "Phylogenetic_tree_plot_2.pdf"),
       width = 15, height = 8, dpi = 1000, plot = p)
ggsave(file.path(save_dir, "Phylogenetic_tree_plot_3.png"),
       width = 12, height = 8, dpi = 1000, plot = p_nolab)
ggsave(file.path(save_dir, "Phylogenetic_tree_plot_3.pdf"),
       width = 12, height = 8, dpi = 1000, plot = p_nolab)

message("完成：Phylogenetic_tree_plot_2.png / .pdf（带标签），Phylogenetic_tree_plot_3.png / .pdf（无标签）")
