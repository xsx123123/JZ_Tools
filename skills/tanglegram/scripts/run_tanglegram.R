#!/usr/bin/env Rscript
# =============================================================================
# run_tanglegram.R — my.tanglegram() 的 CLI wrapper
#
# 用法：
#   Rscript run_tanglegram.R --input <树文件+注释表所在目录> --output <输出目录> \
#       [--tree1 xxx.treefile] [--tree2 yyy.treefile] [--metadata meta.csv] \
#       [--column family] [--colors colors.json] [--outgroup "tip1,tip2"] \
#       [--t2-pad 2] [--tip-size 2.5] [--t1-color "#C0392B"] [--t2-color "#2980B9"] \
#       [--bs-cutoff 70] [--line-alpha 0.55] [--line-lwd 0.5] \
#       [--format both] [--width 14] [--height 10] [--dpi 300] [--no-rotate] [--no-ladderize]
#
# 前置条件与常见报错处置见包内 references/usage.md。
# =============================================================================

suppressPackageStartupMessages(library(optparse))

args <- parse_args(OptionParser(
  description = "Draw a bootstrap-labeled, branch-color-controlled tanglegram from two phylogenetic trees (e.g. two IQ-TREE .treefile outputs with identical tip sets).",
  option_list = list(
    make_option("--input", type = "character",
                help = "输入目录：包含两棵树的 Newick/IQ-TREE 文件和注释 CSV。"),
    make_option("--output", type = "character",
                help = "输出目录（自动创建）。"),
    make_option("--tree1", type = "character", default = NULL,
                help = "左树文件名（--input 目录内）。缺省时若目录中恰有 2 个 *.treefile 则自动识别（按文件名字母序，第 1 个为左树）。"),
    make_option("--tree2", type = "character", default = NULL,
                help = "右树文件名（--input 目录内）。缺省自动识别规则同上，第 2 个为右树。"),
    make_option("--metadata", type = "character", default = NULL,
                help = "注释 CSV 文件名（--input 目录内），须含与 tip.label 一致的 label 列。缺省时若目录中恰有 1 个 *.csv 则自动识别。"),
    make_option("--column", type = "character", default = "family",
                help = "注释 CSV 中用于给连线/tip 点着色的列名。默认 family。"),
    make_option("--colors", type = "character", default = NULL,
                help = "可选：JSON 文件路径（绝对路径或 --input 目录内文件名），形如 {\"Fabaceae\":\"#0072B2\",...}。缺省用 viridisLite::turbo 调色板。"),
    make_option("--outgroup", type = "character", default = NULL,
                help = "可选：定根外群 tip，逗号分隔（如 \"Magnolia_obovata,Magnolia_officinalis\"）。缺省不做定根（假定树已 rooted）。"),
    make_option("--t2-pad", type = "double", default = 1.5,
                help = "两树之间的水平间距。默认 1.5。"),
    make_option("--tip-size", type = "double", default = 2.5,
                help = "tip 点大小。默认 2.5。"),
    make_option("--t1-color", type = "character", default = NULL,
                help = "左树分支颜色，默认 #C0392B（红）。注意：shell 会吃掉 # 后的内容，传色值务必加引号，如 --t1-color '#C0392B'。"),
    make_option("--t2-color", type = "character", default = NULL,
                help = "右树分支颜色，默认 #2980B9（蓝）。引号要求同上。"),
    make_option("--bs-cutoff", type = "double", default = 70,
                help = "bootstrap 显示阈值，仅标注 >= 该值的内部节点；0 = 全部标注，Inf = 关闭。默认 70。"),
    make_option("--line-alpha", type = "double", default = 0.55, help = "连线透明度。默认 0.55。"),
    make_option("--line-lwd", type = "double", default = 0.5, help = "连线线宽。默认 0.5。"),
    make_option("--format", type = "character", default = "both",
                help = "输出格式：pdf、png 或 both。默认 both。"),
    make_option("--width", type = "double", default = 14, help = "图宽（英寸）。默认 14。"),
    make_option("--height", type = "double", default = 10, help = "图高（英寸）。默认 10。"),
    make_option("--dpi", type = "integer", default = 300, help = "PNG 分辨率。默认 300（4200x3000 像素，足够看图；更高分辨率渲染极慢）。"),
    make_option("--no-rotate", action = "store_true", default = FALSE,
                help = "即使安装了 TangleR 也跳过 pre.rotate()（减少连线交叉的预旋转）。"),
    make_option("--no-ladderize", action = "store_true", default = FALSE,
                help = "跳过 my.tanglegram() 内部的 preserve_topology 重建（等价于 preserve_topology=FALSE）。默认重建坐标、关闭 ggtree 的 ladderize，按传入树原结构出图。")
  )
))

# '#' 开头默认值的字符参数在个别 optparse 版本下解析不稳，因此默认走 NULL 占位，
# 这里统一回填默认值
if (is.null(args$t1_color)) args$t1_color <- "#C0392B"
if (is.null(args$t2_color)) args$t2_color <- "#2980B9"

warnings_vec <- character(0)
# optparse 保留长选项中的连字符（args[["t2-pad"]]），统一转成下划线方便取用
names(args) <- gsub("-", "_", names(args))
warn <- function(msg) { warnings_vec <<- c(warnings_vec, msg); message("警告: ", msg) }
fail <- function(...) stop(paste0(...), call. = FALSE)

# ---------------------------------------------------------------------------
# 前置校验 1：R 版本（tanglegram.R 使用原生管道 |>，需 R >= 4.1）
# ---------------------------------------------------------------------------
if (getRversion() < "4.1.0")
  fail("需要 R >= 4.1.0（脚本使用原生管道 |>），当前版本: ", R.version.string)

# ---------------------------------------------------------------------------
# 前置校验 2：R 包齐备性（缺包时给出可执行的安装提示，而不是运行到一半报错）
# ---------------------------------------------------------------------------
need_pkgs <- c("ape", "ggtree", "ggplot2", "dplyr", "viridisLite")
missing_pkgs <- need_pkgs[!vapply(need_pkgs, requireNamespace, quietly = TRUE, logical(1))]
if (length(missing_pkgs) > 0) {
  hints <- vapply(missing_pkgs,
                  function(p) if (p == "ggtree") "BiocManager::install(\"ggtree\")"
                              else paste0("install.packages(\"", p, "\")"),
                  character(1))
  fail("缺少 R 包: ", paste(missing_pkgs, collapse = ", "),
       "\n请先安装：", paste(hints, collapse = "; "),
       "\n依赖清单见技能包 references/environment.md")
}
suppressPackageStartupMessages({ library(ape); library(ggtree); library(ggplot2) })

# 载入同目录下的 my.tanglegram() 函数库（与 wrapper 一起物化进沙盒）
script_arg <- commandArgs(trailingOnly = FALSE)
script_file <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)][1])
source(file.path(dirname(normalizePath(script_file)), "tanglegram.R"))

# ---------------------------------------------------------------------------
# 前置校验 3：输入目录与文件定位
# ---------------------------------------------------------------------------
if (is.null(args$input) || is.null(args$output)) fail("--input 和 --output 为必填参数。")
if (!dir.exists(args$input)) fail("--input 目录不存在: ", args$input)
if (!args$format %in% c("pdf", "png", "both")) fail("--format 必须是 pdf、png 或 both。")

treefiles <- list.files(args$input, pattern = "\\.treefile$", full.names = TRUE)
# 树文件：未指定时要求目录中恰有 2 个 *.treefile
if (is.null(args$tree1) && is.null(args$tree2)) {
  if (length(treefiles) != 2)
    fail("未指定 --tree1/--tree2 且 --input 目录中 .treefile 数量不为 2（实际 ",
         length(treefiles), " 个），无法自动识别，请显式指定。")
  tree1_path <- treefiles[order(basename(treefiles))][1]
  tree2_path <- treefiles[order(basename(treefiles))][2]
} else {
  tree1_path <- if (!is.null(args$tree1)) file.path(args$input, args$tree1) else
    fail("指定了 --tree2 就必须同时指定 --tree1。")
  tree2_path <- if (!is.null(args$tree2)) file.path(args$input, args$tree2) else
    fail("指定了 --tree1 就必须同时指定 --tree2。")
  for (p in c(tree1_path, tree2_path))
    if (!file.exists(p)) fail("树文件不存在: ", p)
}
# 注释表：未指定时要求目录中恰有 1 个 *.csv
csvs <- list.files(args$input, pattern = "\\.csv$", full.names = TRUE)
if (!is.null(args$metadata)) {
  meta_path <- file.path(args$input, args$metadata)
  if (!file.exists(meta_path)) fail("--metadata 指定的文件不存在: ", meta_path)
} else {
  if (length(csvs) != 1)
    fail("未指定 --metadata 且 --input 目录中 .csv 数量不为 1（实际 ", length(csvs),
         " 个），无法自动识别，请显式指定。")
  meta_path <- csvs[1]
}

# ---------------------------------------------------------------------------
# 读树 + 清理 tip.label
# ---------------------------------------------------------------------------
read_tree <- function(path) {
  tr <- tryCatch(read.tree(path),
                 error = function(e) fail("无法解析树文件 ", path, "：", conditionMessage(e),
                                          "\n请确认是合法的 Newick/IQ-TREE 输出（.treefile/.nwk）。"))
  # 去掉 tip.label 首尾可能存在的单/双引号（IQ-TREE 某些版本会给含特殊字符的 label 加引号）
  tr$tip.label <- gsub("^'|'$", "", tr$tip.label)
  tr$tip.label <- gsub("^\"|\"$", "", tr$tip.label)
  tr
}
tree1 <- read_tree(tree1_path)
tree2 <- read_tree(tree2_path)

# ---------------------------------------------------------------------------
# 前置校验 4：两棵树 tip 集合必须完全一致（连线靠 label 配对）
# ---------------------------------------------------------------------------
only1 <- setdiff(tree1$tip.label, tree2$tip.label)
only2 <- setdiff(tree2$tip.label, tree1$tip.label)
if (length(only1) > 0 || length(only2) > 0)
  fail("两棵树的 tip 集合不一致，无法绘制 tanglegram：\n  仅在左树: ",
       paste(only1, collapse = ", "), "\n  仅在右树: ", paste(only2, collapse = ", "),
       "\n常见原因：两棵树的序列集不同、tip.label 命名不一致，或有一棵树的 tip 被过滤过。")

# ---------------------------------------------------------------------------
# 读注释表 + 前置校验 5：label 列、着色列、tip 与注释表的互相匹配
# ---------------------------------------------------------------------------
meta <- tryCatch(read.csv(meta_path, stringsAsFactors = FALSE, check.names = FALSE),
                 error = function(e) fail("无法读取注释 CSV ", meta_path, "：", conditionMessage(e)))
if (!"label" %in% names(meta))
  fail("注释 CSV 缺少 label 列（用于与树的 tip.label 配对）。实际列名: ",
       paste(names(meta), collapse = ", "))
if (!args$column %in% names(meta))
  fail("注释 CSV 中不存在 --column 指定的着色列 '", args$column, "'。实际列名: ",
       paste(names(meta), collapse = ", "))
dup_labels <- unique(meta$label[duplicated(meta$label)])
if (length(dup_labels) > 0)
  fail("注释 CSV 的 label 列存在重复值（无法与 tip 一一配对）: ",
       paste(head(dup_labels, 10), collapse = ", "),
       ifelse(length(dup_labels) > 10, " ...", ""))
meta_missing <- setdiff(tree1$tip.label, meta$label)
if (length(meta_missing) > 0)
  fail("树中有 ", length(meta_missing), " 个 tip 在注释 CSV 的 label 列中找不到（连线无法着色），例如: ",
       paste(head(meta_missing, 10), collapse = ", "),
       "\n请补全注释表，或检查 tip.label 与 label 列的命名是否一致（含引号、空格、ID 后缀等）。")
meta_extra <- setdiff(meta$label, tree1$tip.label)
if (length(meta_extra) > 0)
  warn(paste0("注释 CSV 中有 ", length(meta_extra), " 个 label 不在任何一棵树的 tip 中，已忽略（如: ",
              paste(head(meta_extra, 5), collapse = ", "), ifelse(length(meta_extra) > 5, " ...", ""), "）"))

# ---------------------------------------------------------------------------
# 配色：JSON 文件存在性 + 覆盖完整性校验（缺水平时 scale_color_manual 会报错）
# ---------------------------------------------------------------------------
cols <- NULL
if (!is.null(args$colors)) {
  cols_path <- args$colors
  if (!file.exists(cols_path)) {
    alt <- file.path(args$input, args$colors)
    if (file.exists(alt)) cols_path <- alt else
      fail("--colors 指定的文件不存在: ", args$colors, "（也不在 --input 目录中）")
  }
  cols <- tryCatch(jsonlite::fromJSON(cols_path),
                   error = function(e) fail("无法解析 --colors JSON 文件 ", cols_path,
                                            "：", conditionMessage(e),
                                            "\n要求形如 {\"Fabaceae\":\"#0072B2\",\"Poaceae\":\"#56B4E9\"} 的命名 JSON 对象。"))
  if (is.null(names(cols)) || any(names(cols) == ""))
    fail("--colors JSON 必须是命名对象（{\"水平名\":\"颜色值\",...}），检测到未命名的颜色值。")
  lvls <- unique(meta[[args$column]][meta$label %in% tree1$tip.label])
  cols_missing <- setdiff(lvls, names(cols))
  if (length(cols_missing) > 0)
    fail("--colors 配色未覆盖着色列 '", args$column, "' 的全部 ", length(lvls), " 个水平，缺少: ",
         paste(cols_missing, collapse = ", "))
  bad_color <- cols[!grepl("^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$", cols) &
                    !cols %in% grDevices::colors()]
  if (length(bad_color) > 0)
    warn(paste0("--colors 中有 ", length(bad_color), " 个值不是合法颜色（应为 #RRGGBB 或 R 颜色名）: ",
                paste(head(names(bad_color), 5), collapse = ", ")))
}

# ---------------------------------------------------------------------------
# 定根（可选）
# ---------------------------------------------------------------------------
outgroup <- NULL
if (!is.null(args$outgroup)) {
  outgroup <- trimws(strsplit(args$outgroup, ",", fixed = TRUE)[[1]])
  bad_og <- setdiff(outgroup, tree1$tip.label)
  if (length(bad_og) > 0)
    fail("--outgroup 中有 tip 不在树中: ", paste(bad_og, collapse = ", "),
         "\n树内 tip 示例: ", paste(head(tree1$tip.label, 10), collapse = ", "))
  tree1 <- root(tree1, outgroup = outgroup, resolve.root = TRUE)
  tree2 <- root(tree2, outgroup = outgroup, resolve.root = TRUE)
}

# ---------------------------------------------------------------------------
# 预旋转（可选，需 TangleR）：只减少连线交叉，不影响正确性
# ---------------------------------------------------------------------------
rotated <- FALSE
if (!isTRUE(args$no_rotate)) {
  if (requireNamespace("TangleR", quietly = TRUE)) {
    rot <- TangleR::pre.rotate(tree1, tree2)
    tree1 <- rot[[1]]; tree2 <- rot[[2]]; rotated <- TRUE
  } else {
    warn("未安装 TangleR，跳过 pre.rotate()（连线交叉可能较多；安装 install.packages('TangleR') 可改善）")
  }
}

# ---------------------------------------------------------------------------
# 构建 ggtree 对象并绘图
# ---------------------------------------------------------------------------
gg1 <- ggtree(tree1, ladderize = FALSE) %<+% meta
gg2 <- ggtree(tree2, ladderize = FALSE) %<+% meta

p <- my.tanglegram(gg1, gg2,
                   column    = args$column,
                   cols      = cols,
                   preserve_topology = !isTRUE(args$no_ladderize),
                   t2_pad    = args$t2_pad,
                   tip_size  = args$tip_size,
                   t1_color  = args$t1_color,
                   t2_color  = args$t2_color,
                   bs_cutoff = args$bs_cutoff,
                   line_alpha = args$line_alpha,
                   line_lwd  = args$line_lwd) +
  theme_tree2() +
  ggplot2::guides(color = ggplot2::guide_legend(
    override.aes = list(linetype = 0, shape = 16, size = 4, alpha = 1))) +
  theme(legend.position = "bottom")

# ---------------------------------------------------------------------------
# 保存产物 + summary.json
# ---------------------------------------------------------------------------
dir.create(args$output, recursive = TRUE, showWarnings = FALSE)
formats <- if (args$format == "both") c("pdf", "png") else args$format
outputs <- list()
for (fmt in formats) {
  f <- file.path(args$output, paste0("tanglegram.", fmt))
  if (fmt == "png") ggsave(f, plot = p, width = args$width, height = args$height, dpi = args$dpi)
  else ggsave(f, plot = p, width = args$width, height = args$height)
  outputs[[length(outputs) + 1]] <- list(path = basename(f), type = "figure",
                                         bytes = file.info(f)$size)
}

count_bs <- function(tr, cutoff)
  sum(suppressWarnings(as.numeric(tr$node.label)) >= cutoff, na.rm = TRUE)

summary <- list(
  tool      = "my.tanglegram",
  version   = "0.9.0",
  status    = "success",
  inputs    = list(tree1 = basename(tree1_path), tree2 = basename(tree2_path),
                   metadata = basename(meta_path), column = args$column),
  parameters = list(outgroup = outgroup, pre_rotated = rotated,
                    preserve_topology = !isTRUE(args$no_ladderize),
                    t2_pad = args$t2_pad, tip_size = args$tip_size,
                    t1_color = args$t1_color, t2_color = args$t2_color,
                    bs_cutoff = args$bs_cutoff,
                    line_alpha = args$line_alpha, line_lwd = args$line_lwd),
  outputs   = outputs,
  stats     = list(n_tips = ape::Ntip(tree1),
                   n_internal_nodes = ape::Nnode(tree1) + ape::Nnode(tree2),
                   n_bootstrap_labeled = count_bs(tree1, args$bs_cutoff) +
                     count_bs(tree2, args$bs_cutoff),
                   bs_cutoff = args$bs_cutoff),
  warnings  = as.list(warnings_vec)
)
jsonlite::write_json(summary, file.path(args$output, "summary.json"),
                     auto_unbox = TRUE, pretty = TRUE, na = "null")
cat("完成：", paste(vapply(outputs, `[[`, "", "path"), collapse = ", "),
    "（含 summary.json）\n", sep = "")
