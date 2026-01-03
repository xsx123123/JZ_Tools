# --------------------------------------------------
# 绘图函数：DrawVennWithLegend
#
# 功能：
# 1. 绘制一个 4 组的 ggVennDiagram (A,B,C,D)
# 2. 创建一个自定义的图例 (带颜色圆点和完整描述)
# 3. 使用 patchwork 将两者拼装在一起
#
# (哈基咪优化与封装)
# --------------------------------------------------

# 0. 确保加载了所有必需的包
# library(ggVennDiagram)
# library(ggplot2)
# library(patchwork)
# library(dplyr)


#' 绘制韦恩图 (4组) 并附带自定义图例
#'
#' @param x (list) **必需**. 一个包含 4 个**命名**元素的列表。
#'   - 列表的每个元素都必须是一个基因名向量 (character vector)。
#'   - 列表的 'names(x)' 将被用作图例中的长描述。
#' @param title (character) 韦恩图的主标题。
#' @param set_colors (character vector) 一个包含 4 种颜色的向量。
#' @param short_names (character vector) 一个包含 4 个短标签的向量 (用于 A,B,C,D)。
#' @param legend_order (character vector) 一个包含 4 个短标签的向量，用于指定图例的**垂直顺序**。
#' @param legend_title (character) 自定义图例的标题。
#' @param layout_widths (numeric vector) patchwork 拼图的宽度比例 (主图:图例)。
#'
#' @return 一个 patchwork 拼装的 ggplot 对象。
#'
DrawVennWithLegend <- function(
    x,
    title = "Venn Diagram of Root DEGs",
    set_colors = c("#9b5de5", "#f15bb5", "#fee440", "#00bbf9"),
    short_names = c("A", "B", "C", "D"),
    legend_order = c("D", "C", "B", "A"),
    legend_title = "Groups",
    layout_widths = c(3, 1.5),
    label = 'both',
    label_size = 3
) {
  
  # --- 1. 加载所需的库 ---
  require(ggVennDiagram)
  require(ggplot2)
  require(patchwork)
  require(dplyr)
  
  # --- 2. 输入验证 ---
  if (!is.list(x)){
    stop("错误: 'x' 必须是一个包含 4 个元素的列表。")
  }
  if (is.null(names(x)) || any(names(x) == "")) {
    stop("错误: 'x' 必须是一个 '命名' 列表 (e.g., list('Group A' = ...))。")
  }
  
  # --- 3. 绘制图 A (p_venn - 韦恩图) ---
  # (这是你的代码)
  p_venn <- ggVennDiagram(
      x,
      label_alpha = 0,
      set_color = set_colors,  # <-- 使用参数
      label_size = label_size,
      edge_size = 0.5,
      label = label,
      set_size = 4.5,
      category.names = short_names # <-- 使用参数
    ) +
    scale_fill_gradient(low = "grey90", high = "red", guide = "none") +
    ggtitle(title) + # <-- 使用参数
    theme(plot.title = element_text(hjust = 0.5))
    
  
  # --- 4. 准备图 B 的数据 (p_legend - 图例) ---
  
  # 创建一个命名的颜色向量 (e.g., A = "#9b5de5")
  venn_edge_colors <- set_colors
  names(venn_edge_colors) <- short_names
  
  # 创建图例数据框
  legend_data <- data.frame(
    short_name = short_names,
    long_name = names(x), # <-- 自动从 'x' 的名字获取
    # 创建 Y 轴因子 (按你指定的顺序)
    y_factor = factor(short_names, levels = legend_order) # <-- 使用参数
  )
  
  # --- 5. 绘制图 B (p_legend - 图例) ---
  # (这是你的代码, 但修复了 Y 轴 Bug)
  p_legend_v3 <- ggplot(legend_data, aes(x = 0.1, y = y_factor)) +
    
    # 绘制彩色圆点
    geom_point(
      aes(color = short_name), # 颜色映射到 A,B,C,D
      size = 6,
      shape = 19
    ) +
    
    # 绘制文本 (!!! 关键 Bug 修复 !!!)
    annotate(
      geom = "text",
      x = 0.2, # 文本 X 坐标
      y = legend_data$y_factor, # <-- 修复! Y 轴必须和 'aes(y=...)' 一致
      label = paste0(legend_data$short_name, ": ", legend_data$long_name),
      hjust = 0,   # 左对齐
      vjust = 0.5, # 垂直居中
      size = 4
    ) +
    
    scale_color_manual(values = venn_edge_colors) + # 应用颜色
    xlim(0, 1) + # X 轴范围
    theme_void() + # 移除所有背景
    theme(legend.position = "none") + # 隐藏 geom_point 自己的图例
    labs(title = legend_title) + # 添加图例标题
    theme(plot.title = element_text(hjust = 0, face = "bold", size = 12, margin = margin(b=5)))
    
    
  # --- 6. 拼装并返回 ---
  final_plot <- p_venn + p_legend_v3 +
    plot_layout(widths = layout_widths) # <-- 使用参数
    
  return(final_plot)
}