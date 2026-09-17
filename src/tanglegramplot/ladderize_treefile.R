# =============================================================================
# ladderize_treefile.R — 对 treefile 做节点旋转，输出整理后的 Newick
#
# 只旋转内部节点（交换左右子树），不改变拓扑和任何数值：
#   - 分支长度原样保留
#   - 内部节点 bootstrap 标签原样保留
#   - tip.label 原样保留
#
# 用法：
#   Rscript ladderize_treefile.R <输入.treefile> <输出.treefile>
# =============================================================================

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("用法: Rscript ladderize_treefile.R <输入> <输出>")

library(ape)

tree <- read.tree(args[1])
# ladderize 只做 rotate：把每个节点的子树按 clade 大小排向一侧，
# 边长和标签数值完全不动
tree <- ladderize(tree, right = TRUE)
write.tree(tree, file = args[2])

cat("完成:", args[2], "\n")
