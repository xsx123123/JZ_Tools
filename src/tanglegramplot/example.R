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

# ========== 4. 校验注释表与树的 tip 是否互相匹配 ==========
missing_in_tree  <- setdiff(tree_info$label, TnpD_tree$tip.label)
missing_in_table <- setdiff(TnpD_tree$tip.label, tree_info$label)
if (length(missing_in_tree) > 0)
  warning("注释表中有、树中没有的 label: ", paste(missing_in_tree, collapse = ", "))
if (length(missing_in_table) > 0)
  warning("树中有、注释表中没有的 tip: ", paste(missing_in_table, collapse = ", "))

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

# ========== 6. 以木兰类物种为外群定根 ==========
magnolia_tips <- c("Magnolia_obovata", "Magnolia_officinalis")
TnpA_tree_rooted <- root(TnpA_tree, outgroup = magnolia_tips, resolve.root = TRUE)
TnpD_tree_rooted <- root(TnpD_tree, outgroup = magnolia_tips, resolve.root = TRUE)

# ========== 7. 预旋转，尽量减少两树之间的连线交叉（可选）==========
# pre.rotate() 来自 TangleR 包；未安装时跳过（仅影响美观，不影响正确性）
if (requireNamespace("TangleR", quietly = TRUE)) {
  rot      <- TangleR::pre.rotate(TnpA_tree_rooted, TnpD_tree_rooted)
  TnpA_rot <- rot[[1]]
  TnpD_rot <- rot[[2]]
} else {
  message("未安装 TangleR，跳过 pre.rotate()（连线交叉可能较多）")
  TnpA_rot <- TnpA_tree_rooted
  TnpD_rot <- TnpD_tree_rooted
}

# ========== 8. 构建两棵 ggtree（ladderize = FALSE 保住旋转结果）==========
# 分支颜色由 my.tanglegram() 的 t1_color / t2_color 参数统一控制，
# 无需在 ggtree() 里传 color（不同 ggtree 版本对该参数支持不一致）
tree1 <- ggtree(TnpA_rot, ladderize = FALSE) %<+% tree_info  # 左树（TnpA）
tree2 <- ggtree(TnpD_rot, ladderize = FALSE) %<+% tree_info  # 右树（TnpD）

# ========== 9. 绘制 tanglegram ==========
p <- my.tanglegram(tree1, tree2,
                   column   = "family",        # 按 family 列给连线/tip 点着色
                   cols     = family_colors,   # 自定义配色；不传则用 viridis::turbo
                   t2_pad   = 2,               # 两树之间的间距
                   tip_size = 2.5,             # tip 点大小
                   t1_color = "#C0392B",       # 左树（TnpA）分支颜色：红
                   t2_color = "#2980B9",       # 右树（TnpD）分支颜色：蓝
                   bs_cutoff = 70) +           # 仅标注 bootstrap >= 70 的节点
  theme_tree2() +
  scale_x_continuous(breaks = seq(0, 10, by = 0.5)) +
  theme(legend.position = "bottom",
        legend.title    = element_text(size = 10),
        legend.text     = element_text(size = 9))

# 图例只显示点、不显示线段
p <- p + guides(color = guide_legend(
  override.aes = list(linetype = 0,  # 去掉图例中的线段
                      shape    = 16, # 实心圆点
                      size     = 4,  # 图例里点的大小
                      alpha    = 1))) +
  theme(legend.position = "bottom")

# ========== 10. 保存 ==========
ggsave(file.path(save_dir, "Phylogenetic_tree_plot_3.png"),
       width = 14, height = 10, dpi = 1000, plot = p)
ggsave(file.path(save_dir, "Phylogenetic_tree_plot_3.pdf"),
       width = 14, height = 10, dpi = 1000, plot = p)

message("完成：Phylogenetic_tree_plot_3.png / .pdf")
