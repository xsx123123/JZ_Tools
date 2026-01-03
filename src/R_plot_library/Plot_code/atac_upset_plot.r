#' @title 绘制 ATAC-seq 基因组注释重叠情况 UpSet 图
#' @description 
#' 该函数接收 ChIPseeker 的注释结果数据框，处理基因组注释信息（如 Promoter, Exon, Intron 等），
#' 并使用 ggupset 绘制可视化的 UpSet 图，展示基因在不同基因组区域的重叠分布。
#' 函数会自动计算 Y 轴上限以适应数据范围，并自动保存高分辨率的 PNG 和 PDF 文件。
#'
#' @param data Dataframe. 输入数据框。必须包含 `geneId` 和 `annotation` 两列。通常来自 ChIPseeker 的 annotatePeak 结果。
#' @param fill_color Character. 柱状图的填充颜色 (Hex 码或颜色名)。默认 "#56B4E9" (浅蓝色)。
#' @param bar_text_angle Numeric. 柱顶计数标签的旋转角度。默认 90 度。
#' @param bar_text_size Numeric. 柱顶计数标签的字体大小 (单位 mm)。默认 2.7。
#' @param upset_top_n Integer. X 轴仅显示前 N 个最频繁的交集组合。默认 20。
#' @param upset_order_by Character. 排序方式。可选 "freq" (按数量从高到低) 或 "degree" (按交集复杂度)。默认 "freq"。
#' @param img_width Numeric. 保存图片的宽度 (英寸)。默认 5。
#' @param img_height Numeric. 保存图片的高度 (英寸)。默认 4。
#' @param sample_name Character. 样本名称字符串。将用于生成图表标题 (`Genomic Annotation Overlap: [name]`) 和保存的文件名前缀。
#' @param save_dir Character. 图片输出目录路径。如果不存在会自动创建。默认当前目录 "."。
#'
#' @return 返回一个 ggplot 对象，同时会在 `save_dir` 目录下生成对应的 .png 和 .pdf 文件。
#' @import tidyverse
#' @import ggupset
#' @import ggpubr
#' @export
draw_atac_upset <- function(data, 
                            fill_color = "#56B4E9", 
                            bar_text_angle = 90, 
                            bar_text_size = 2.7,    
                            upset_top_n = 20, 
                            upset_order_by = "freq", 
                            img_width = 5, 
                            img_height = 4, 
                            sample_name = 'atac_upset', 
                            save_dir = ".") {
  
  # 检查依赖包
  if(!require(tidyverse)) library(tidyverse)
  if(!require(ggupset)) library(ggupset)
  if(!require(ggpubr)) library(ggpubr)
  
  message(paste0("正在处理样本: ", sample_name, " ..."))
  
  # 1. 数据清洗
  plot_data <- data %>%
    as_tibble() %>%
    mutate(annotation = as.character(annotation)) %>% # 确保是字符型
    mutate(annotation_simple = case_when(
      str_detect(annotation, "Promoter") ~ "Promoter",
      str_detect(annotation, "Intron") ~ "Intron",
      str_detect(annotation, "Exon") ~ "Exon",
      str_detect(annotation, "Distal Intergenic") ~ "Distal Intergenic",
      str_detect(annotation, "Downstream") ~ "Downstream",
      str_detect(annotation, "UTR") ~ "5' or 3' UTR",
      TRUE ~ "Others"
    )) %>%
    distinct(geneId, annotation_simple) %>%
    group_by(geneId) %>%
    summarise(
      annot_list = list(annotation_simple), 
      .groups = "drop"
    )
  
  # 2. 动态计算 Y 轴高度
  max_count <- plot_data %>% 
    count(annot_list) %>% 
    pull(n) %>% 
    max()
  
  y_limit_upper <- max_count * 1.2
  
  # 3. 绘图
  p <- ggplot(plot_data, aes(x = annot_list)) +
    geom_bar(fill = fill_color) +
    geom_text(stat='count', aes(label=after_stat(count)),
              vjust= 0.5, hjust = -0.2,
              size = bar_text_size,   
              angle = bar_text_angle) +
    scale_y_continuous(limits = c(0, y_limit_upper),
                       expand = c(0, 0)) +
    scale_x_upset(n_intersections = upset_top_n,
                  order_by = upset_order_by) +
    labs(
      title = paste0("Genomic Annotation Overlap: ", sample_name),
      subtitle = "Genes with peaks in multiple genomic features",
      x = "Genomic Features Intersection",
      y = "Number of Genes"
    ) +
    
    theme_pubclean() +
    theme_combmatrix(
      combmatrix.label.text = element_text(size = 6, color = "black"),
      combmatrix.panel.point.size = 3 
    ) +
    theme(
      plot.title = element_text(face = "bold", size = 8),
      plot.subtitle = element_text(size = 7),
      axis.title = element_text(size = 7),
      panel.grid.major.x = element_blank()
    )
  
  # 4. 自动保存
  if (!dir.exists(save_dir)) {
    dir.create(save_dir, recursive = TRUE)
  }
  
  file_base <- file.path(save_dir, paste0(sample_name, "_atac_ann"))
  
  ggsave(paste0(file_base, ".png"), width = img_width, height = img_height, dpi = 1000, plot = p)
  ggsave(paste0(file_base, ".pdf"), width = img_width, height = img_height, dpi = 1000, plot = p)
  
  message(paste0("绘图完成！已保存至: ", save_dir))
  
  return(p)
}