#' Draw a co-phylogenetic tanglegram from two ggtree objects
#'
#' @description
#' `my.tanglegram()` renders two phylogenetic trees face-to-face in a single
#' ggplot panel: the right-hand tree is mirrored along the y-axis and shifted
#' rightwards, matching tips are connected by straight lines colored by an
#' arbitrary metadata column, and bootstrap support values are drawn on the
#' internal nodes of \strong{both} trees with symmetric alignment.
#'
#' Unlike \code{tangler::common.tanglegram()}, which silently discards all
#' user-added layers of the second tree (branch colors, node labels, etc.)
#' and redraws it with hard-coded defaults, this function treats both trees
#' symmetrically: branch colors are explicit arguments, bootstrap labels are
#' rendered for both trees from the same filtering logic, and every visual
#' parameter (line, point, label) is user-controllable.
#'
#' @param tree1,tree2 \code{ggtree} objects (typically annotated via
#'   \code{\%<+\%} with a metadata \code{data.frame}). The two trees must
#'   share an identical tip-label set; the function stops with an informative
#'   message listing mismatched tips otherwise. If the trees were reordered
#'   with \code{tangler::pre.rotate()} (or any manual node rotation), build
#'   the \code{ggtree} objects with \code{ladderize = FALSE} so the rotation
#'   is preserved.
#' @param preserve_topology Logical. If \code{TRUE} (default), the plotting
#'   coordinates of both trees are re-fortified from their underlying
#'   \code{phylo} objects with \code{ladderize = FALSE}, so the rendered
#'   topology and tip order are exactly those of the objects passed in —
#'   \code{ggtree()}'s default ladderization is undone. Set to \code{FALSE}
#'   to keep the \code{ggtree} objects' existing coordinates untouched
#'   (e.g. when they were deliberately ladderized at build time). Note that
#'   any reordering done \emph{before} building the \code{ggtree} objects
#'   (e.g. \code{ape::root()} or \code{tangler::pre.rotate()}) is not affected
#'   by this argument — skip those steps upstream if the raw input structure
#'   is wanted. Attached metadata (via \code{\%<+\%}) is preserved for tips.
#' @param column Character scalar. Name of the metadata column (present in
#'   the attached data of both trees) used to color the connecting lines and
#'   tip points, e.g. \code{"family"}.
#' @param cols Named character vector of colors for the levels of
#'   \code{column}. If \code{NULL} (default), the \code{"turbo"} palette of
#'   \code{viridisLite} is used.
#' @param t2_pad Numeric. Width of the gap between the two trees, i.e. the
#'   horizontal shift applied to the mirrored right tree. Increase it when
#'   connecting lines are too steep or tip points collide. Default \code{1.5}.
#' @param lab_pad Numeric. Extra horizontal offset from each tip point at
#'   which the connecting line starts/ends. Default \code{0.15}.
#' @param line_alpha Numeric in \eqn{[0,1]}. Transparency of the connecting
#'   lines. Default \code{0.55}.
#' @param line_lwd Numeric. Line width of the connecting lines. Default
#'   \code{0.5}.
#' @param tip_size Numeric. Size of the tip points on both trees. Default
#'   \code{2.5}.
#' @param t1_color,t2_color Colors of the left and right tree branches.
#'   Defaults \code{"#C0392B"} (red) and \code{"#2980B9"} (blue).
#' @param bs_cutoff Numeric in \eqn{[0,100]}. Internal nodes whose numeric
#'   node label (bootstrap support) is \strong{below} this threshold are not
#'   annotated. Non-numeric node labels (e.g. empty root labels) are silently
#'   skipped. Set to \code{0} to annotate every node, or to \code{Inf} to
#'   disable bootstrap labels entirely. Default \code{70}.
#' @param bs_size Numeric. Font size of the bootstrap labels. Default
#'   \code{2.2}.
#' @param bs_nudge Numeric. Horizontal distance between a node and its
#'   bootstrap label. Labels of the left tree are placed to the right of the
#'   node (\code{hjust = 0}); labels of the mirrored right tree are placed
#'   symmetrically to the left (\code{hjust = 1}), so text never overlaps
#'   branches. Default \code{0.05}.
#' @param bs_color Color of the bootstrap labels. Default \code{"grey20"}.
#'
#' @details
#' \strong{How the layout works.} Only the coordinate data
#' (\code{tree$data}) of \code{tree2} are used: x-coordinates are mirrored
#' as \code{(max(x) - x) + max(tree1$x) + t2_pad} and the right tree is
#' redrawn with \code{geom_tree()}. Consequently, layers added to
#' \code{tree2} itself (e.g. \code{geom_tiplab()}) are \emph{not} carried
#' over — annotate tips and nodes through this function's arguments instead.
#' Layers of \code{tree1} \emph{are} kept, but its branches are overpainted
#' with \code{t1_color}, so the branch colors of both trees are controlled
#' solely by this function's arguments (do not rely on \code{color} in
#' \code{ggtree()}, whose behaviour differs across ggtree versions).
#' Adding \code{geom_nodelab()} to \code{tree1} will duplicate the bootstrap
#' labels drawn by this function.
#'
#' \strong{Axis caveat.} The x-axis of the returned plot is a stitched
#' coordinate system (left tree branch lengths + gap + mirrored right tree)
#' and has no direct branch-length interpretation. Either hide it with
#' \code{theme_tree()} or state this explicitly in the figure legend.
#'
#' \strong{Topology safety.} Mirroring only transforms plotting coordinates;
#' rotating internal nodes (as done by \code{pre.rotate()}) swaps daughter
#' branches without changing topology. Verify with
#' \code{ape::all.equal.phylo(tree, rotated_tree, use.edge.length = TRUE)}.
#'
#' @return A \code{ggtree}/\code{ggplot} object that can be further extended
#'   with \code{ggplot2} layers, themes and scales.
#'
#' @examples
#' \dontrun{
#' library(ggtree); library(ggplot2)
#'
#' rot <- tangler::pre.rotate(tree_A, tree_B)
#' t1  <- ggtree(rot[[1]], ladderize = FALSE) %<+% meta
#' t2  <- ggtree(rot[[2]], ladderize = FALSE) %<+% meta
#'
#' p <- my.tanglegram(t1, t2, column = "family",
#'                    t2_pad = 2, bs_cutoff = 70) +
#'   theme_tree2() +
#'   guides(color = guide_legend(
#'     override.aes = list(linetype = 0, shape = 16, size = 4, alpha = 1))) +
#'   theme(legend.position = "bottom")
#' }
my.tanglegram <- function(tree1, tree2, column, cols = NULL,
                          preserve_topology = TRUE, # TRUE = 按传入树原结构出图（关闭 ladderize）
                          t2_pad = 1.5, lab_pad = 0.15,
                          line_alpha = 0.55, line_lwd = 0.5,
                          tip_size = 2.5,
                          t1_color = "#C0392B",   # 左树枝颜色
                          t2_color = "#2980B9",   # 右树枝颜色
                          bs_cutoff = 70,         # bootstrap 显示阈值；Inf = 关闭标注
                          bs_size   = 2.2,        # bootstrap 字号
                          bs_nudge  = 0.05,       # bootstrap 标签离节点的水平距离
                          bs_color  = "grey20") { # bootstrap 标签颜色

  # ============================================================
  # 第 0 步：取坐标数据 + 输入校验
  # ============================================================
  d1 <- tree1$data
  d2 <- tree2$data

  if (isTRUE(preserve_topology)) {
    rebuild_phylo <- function(d) {
      # 1. 剔除无效边与根节点的自环 (parent == node)
      valid_edges <- !is.na(d$parent) & d$parent != d$node
      d_clean <- d[valid_edges, ]

      # 2. 映射 Tip (1:N) 与 内部节点 ((N+1):(N+M)) 编号
      tips <- d$label[d$isTip]
      tip_nodes <- d$node[d$isTip]
      internal_nodes <- setdiff(unique(c(d_clean$parent, d_clean$node)), tip_nodes)
      
      node_map <- setNames(
        c(seq_along(tip_nodes), length(tip_nodes) + seq_along(internal_nodes)),
        c(tip_nodes, internal_nodes)
      )

      new_parent <- node_map[as.character(d_clean$parent)]
      new_node   <- node_map[as.character(d_clean$node)]

      phy <- list(
        edge        = matrix(c(new_parent, new_node), ncol = 2),
        edge.length = d_clean$branch.length,
        tip.label   = tips,
        Nnode       = length(internal_nodes)
      )

      # 恢复 node.label
      node_df <- unique(d[!d$isTip, c("node", "label")])
      new_int_order <- sort(node_map[as.character(node_df$node)])
      phy$node.label <- node_df$label[order(new_int_order)]
      
      class(phy) <- "phylo"
      return(phy)
    }

    attach_meta <- function(tree, old_d) {
      meta_cols <- setdiff(names(old_d),
                           c("parent","node","branch.length","isTip",
                             "x","y","branch","angle","label","tree"))
      if (length(meta_cols) > 0) {
        meta_sub <- unique(old_d[old_d$isTip, c("label", meta_cols)])
        tree$data <- merge(tree$data, meta_sub, by = "label", all.x = TRUE, sort = FALSE)
      }
      tree$data <- tree$data[order(tree$data$node), ]
      tree
    }

    tree1 <- attach_meta(ggtree::ggtree(rebuild_phylo(d1), ladderize = FALSE), d1)
    tree2 <- attach_meta(ggtree::ggtree(rebuild_phylo(d2), ladderize = FALSE), d2)
    d1 <- tree1$data
    d2 <- tree2$data
  }

  # 双向 setdiff 校验 tip 集合完全一致——连线靠 label 配对，
  # 若两棵树 tip 不一致，geom_line 的 group 配对会静默错连或断连，
  # 所以在这里直接报错并打印差异，把问题挡在画图之前
  missing_t2 <- setdiff(d1$label[d1$isTip], d2$label[d2$isTip])  # 左有右无
  missing_t1 <- setdiff(d2$label[d2$isTip], d1$label[d1$isTip])  # 右有左无
  if (length(missing_t2) > 0 || length(missing_t1) > 0) {
    stop("两棵树 tip 不一致：\n  仅在左树: ", paste(missing_t2, collapse = ", "),
         "\n  仅在右树: ", paste(missing_t1, collapse = ", "))
  }

  # ============================================================
  # 第 1 步：右树镜像 + 平移（整个函数的核心坐标变换）
  # ============================================================
  # 给两棵树的坐标数据打来源标记，后面 rbind 合并后靠这一列区分左右
  d1$tree <- "t1"
  d2$tree <- "t2"

  # 镜像公式：(max(x) - x) 把右树沿 y 轴翻转（根和 tip 位置互换），
  # 再整体右移 max(d1$x) + t2_pad，使右树的根紧贴中缝、tip 朝右。
  # 注意：变换只改绘图坐标，不碰 phylo 对象本身，拓扑完全不受影响
  d2$x <- (max(d2$x) - d2$x) + max(d1$x) + t2_pad

  # 左树用 tree1 原对象直接画（保留其既有图层），
  # 再用 t1_color 重绘一层左树分支覆盖默认颜色——
  # 这样两棵树的分支颜色都由本函数的参数统一控制，
  # 不依赖 ggtree() 构造时 color 参数（不同 ggtree 版本行为不一致，
  # 新版会把 color 丢给 fortify 并忽略）
  # 右树用变换后的坐标数据重新加一层 geom_tree——
  # 因此挂在 tree2 上的图层（tiplab/nodelab 等）不会生效，
  # 枝颜色必须在这里显式给定
  pp <- tree1 +
    geom_tree(data = d1, color = t1_color) +
    geom_tree(data = d2, color = t2_color)

  # ============================================================
  # 第 2 步：两棵树的 bootstrap 支持度标注（对称处理）
  # ============================================================
  bs <- rbind(d1, d2) |>
    dplyr::filter(!isTip) |>                             # 只保留内部节点
    dplyr::mutate(bs_val = suppressWarnings(as.numeric(label))) |>
    # label 转数值：根节点/空标签转出来是 NA（suppressWarnings 压住
    # "NAs introduced by coercion" 警告），连同比阈值低的节点一起过滤
    dplyr::filter(!is.na(bs_val), bs_val >= bs_cutoff) |>
    dplyr::mutate(
      # 左树：标签放节点右侧，左对齐（hjust = 0）
      # 右树：镜像后枝向左延伸，标签放节点左侧，右对齐（hjust = 1）
      # 两侧对称，文字都不会压到枝上
      label_x = ifelse(tree == "t1", x + bs_nudge, x - bs_nudge),
      hj      = ifelse(tree == "t1", 0, 1)
    )

  pp <- pp +
    ggplot2::geom_text(data = bs,
                       aes(x = label_x, y = y, label = label, hjust = hj),
                       size = bs_size, color = bs_color)

  # ============================================================
  # 第 3 步：tip 连线 + tip 点
  # ============================================================
  tips <- rbind(d1, d2) |>
    dplyr::filter(isTip) |>
    # 连线不从 tip 点本身出发，而是向内收 lab_pad，
    # 避免线段盖住 tip 点，视觉上更干净
    dplyr::mutate(lab_x = ifelse(tree == "t1", x + lab_pad, x - lab_pad))

  pp <- pp +
    # 连线：group = label 让同名 tip 左右配对；
    # 因为第 0 步已校验 tip 集合一致，这里每个 group 恰好 2 行、必成对
    ggplot2::geom_line(aes(x = lab_x, y = y, group = label, color = .data[[column]]),
                       data = tips, alpha = line_alpha, linewidth = line_lwd) +
    # 左右 tip 点分开画（x 用各自坐标，不用内收的 lab_x）
    ggplot2::geom_point(data = dplyr::filter(tips, tree == "t1"),
                        aes(x = x, y = y, color = .data[[column]]), size = tip_size) +
    ggplot2::geom_point(data = dplyr::filter(tips, tree == "t2"),
                        aes(x = x, y = y, color = .data[[column]]), size = tip_size)

  # ============================================================
  # 第 4 步：配色标度
  # ============================================================
  # 连线和 tip 点共用同一个 color 标度，图例自动合并；
  # 用户没给配色时用 viridis 的 turbo 调色板（分组多也能拉开色差）。
  # 注意不用 viridis::scale_color_viridis_d()：该函数的导出名在
  # 不同 ggplot2/viridis 版本组合下位置不同，而 viridisLite::turbo()
  # 生成颜色向量 + scale_color_manual() 在所有版本下行为一致
  if (!is.null(cols)) pp <- pp + scale_color_manual(values = cols)
  else pp <- pp + scale_color_manual(values = viridisLite::turbo(length(unique(tips[[column]]))))

  pp
}