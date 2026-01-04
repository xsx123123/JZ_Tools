#!/usr/bin/env Rscript

# ==============================================================================
# DESeq2 Pipeline with Advanced Volcano Plots, PCA & Stats
# Author: Jian Zhang (Integrated by Hajimi)
# Date: 2026-01-03
# Version: 3.7 (Fixed: Prevent creating output dir on error)
# ==============================================================================

# 0. 加载必要的包 ---------------------------------------------------------
suppressPackageStartupMessages({
  library(optparse)
  library(DESeq2)
  library(tidyverse)
  library(ggplot2)
  library(ggrepel)
  library(ggpubr)
  library(patchwork) 
  library(log4r)
  library(crayon)
  library(cowplot)
})

# 1. 定义 Log 模块 --------------------------------------------------------
log4r_init <- function(level = "INFO", log_file = NULL){
  require(log4r)
  require(crayon)
  
  my_console_layout <- function(level, ...) {
    time_str <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
    msg <- paste0(..., collapse = "\n")
    if (level == 'INFO') paste0(bold(cyan(time_str, " [", level, " ] ➡️ ")), msg, '\n')
    else if (level == 'WARN') paste0(bold(yellow(time_str, " [", level, " ] ❓ ")), msg, '\n')
    else if (level == 'ERROR') paste0(bold(red(time_str, " [", level, "] 🧨 ")), msg, '\n')
    else if (level == 'FATAL') paste0(bold(bgRed(time_str, " [", level, "] 💣 ")), msg, '\n')
    else if (level == 'DEBUG') paste0(bold(blue(time_str, " [", level, "] 🔧 ")), msg, '\n')
    else paste0(time_str, " [", level, "] ", msg, '\n')
  }
  
  appenders_list <- list(console_appender(my_console_layout))
  
  if (!is.null(log_file)) {
    file_layout <- function(level, ...) paste0(format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " [", level, "] ", paste0(..., collapse = "\n"), "\n")
    appenders_list <- c(appenders_list, file_appender(log_file, layout = file_layout))
  }
  return(log4r::logger(threshold = level, appenders = appenders_list))
}

# 2. 定义绘图函数 ---------------------------------------------------------
DrawVolcano <- function(deg_result,
                        EXP_NAEE = NULL,
                        padjCutoff = 0.05,
                        LFCCutoff = 1,
                        y_aes = 100,
                        TOP_GENE = 10,
                        deg_figure_dir = "./"){ 
  require(ggpubr)
  require(cowplot)
  
  # padj 零值修正
  if (min(deg_result$padj, na.rm=T) == 0) {
    deg_result$padj[which(deg_result$padj == 0)] <- .Machine$double.xmin
  }
  
  deg_result <- deg_result %>% tibble() |>
    mutate(log10 = -log10(padj)) # 依赖 padj 列
  
  deg_result$label = NA
  deg_result$Group <- "Non-significant"
  deg_result$Group[which((deg_result$padj < padjCutoff) & (deg_result$log2FC > LFCCutoff))] = "Up-regulated"
  deg_result$Group[which((deg_result$padj < padjCutoff) & (deg_result$log2FC < -LFCCutoff))] = "Down-regulated"
  
  deg_result <- deg_result %>% arrange(padj)
  
  non_deg_result <- subset(deg_result, deg_result$Group =="Non-significant")
  up_deg_result <- subset(deg_result, deg_result$Group =="Up-regulated")
  down_deg_result <- subset(deg_result, deg_result$Group =="Down-regulated")
  
  deg_result_up <- head(subset(deg_result, deg_result$Group == "Up-regulated"), TOP_GENE)
  deg_result_down <- head(subset(deg_result, deg_result$Group == "Down-regulated"), TOP_GENE)
  
  if (missing(y_aes)) {
    y_aes_vals <- deg_result$log10[is.finite(deg_result$log10)]
    if(length(y_aes_vals) > 0){
      y_1 <- sort(y_aes_vals, decreasing = TRUE)[1]
      y_2 <- sort(y_aes_vals, decreasing = TRUE)[2]
      if (!is.na(max(y_aes_vals)) && max(y_aes_vals) > 300){
        y_aes_value <- 250
      } else {
        if(!is.na(y_1) && !is.na(y_2) && y_1/y_2 > 1.4){
          y_aes_value <- (y_1+y_2)/2
        } else {
          y_aes_value <- max(y_aes_vals)*1.1
        }
      }
    } else {
      y_aes_value <- 10 
    }
  } else {
    y_aes_value <- y_aes
  }
  
  x_aes <- na.omit(deg_result$log2FC)
  x_max <- max(abs(x_aes))
  if (x_max > 7.5) x_max <- 7.5
  
  # get legend 
  legnd_p <- ggplot(deg_result, aes(x = log2FC, y = log10,color = Group,fill = Group)) +
    geom_point(size=0.7,shape = 21,alpha= 0.8) +
    scale_color_manual(values = c("Down-regulated" = "#41b6e6",
                                  "Non-significant" = "#D3D3D3",
                                  "Up-regulated" = "#e41749"))+
    scale_fill_manual(values = c("Down-regulated" = "#41b6e6",
                                 "Non-significant" = "#D3D3D3",
                                 "Up-regulated" = "#e41749")) +
    theme_pubclean() + 
    theme(legend.text = element_text(size = 7),
          legend.title = element_text(size = 8) ) +
    guides(color = guide_legend(keywidth = 1,
                                keyheight = 1.5,
                                ncol=3,override.aes = list(size = 2.5)))
  legnd <- cowplot::get_legend(legnd_p)
  
  # draw Volcano 
  p <- ggplot(deg_result, aes(x = log2FC, y = log10)) +
    geom_point(data=non_deg_result,aes(x = log2FC, y = log10),
               size=0.7,shape = 21,color="#D3D3D3",alpha=0.8) +
    geom_point(data=deg_result_up,aes(x = log2FC, y = log10),
               size = 1,shape = 1,fill="#e41749",color = "#e41749",alpha=0.6) +
    geom_point(data=up_deg_result,aes(x = log2FC, y = log10),
               size=0.7,shape = 21,color="#e41749",fill = "#e41749",alpha=0.6) +
    geom_point(data=deg_result_down,aes(x = log2FC, y = log10),
               size=1,shape = 1,fill="#41b6e6",color="#41b6e6",alpha=0.6) +
    geom_point(data=down_deg_result,aes(x = log2FC, y = log10),
               size=0.7,shape = 21,color="#41b6e6",fill="#41b6e6",alpha=0.6) +
    geom_vline(xintercept=LFCCutoff,lty=2,col="#C0C0C0",lwd=0.1) +
    geom_vline(xintercept=-LFCCutoff,lty=2,col="#C0C0C0",lwd=0.1) +
    geom_hline(yintercept = -log10(padjCutoff),lty=2,col="#C0C0C0",lwd=0.1) +
    labs(x= bquote("RNA-seq " * log[2] * " fold change " * .(EXP_NAEE) * ""),
         y= expression(paste(-log[10], "(Adjusted P-value)")), 
         title =paste0(EXP_NAEE," Volcano Plot")) +
    geom_text_repel(data = deg_result_up,aes(log2FC, log10, label= Symbol),size=1.5,colour="black",fontface="bold.italic",
                    segment.alpha = 0.5,segment.size = 0.15,segment.color = "black",min.segment.length=0,
                    box.padding=unit(0.2, "lines"),point.padding=unit(0, "lines"),max.overlaps = 50) +
    geom_text_repel(data = deg_result_down,aes(log2FC, log10, label= Symbol),size=1.5,colour="black",fontface="bold.italic",
                    segment.alpha =0.5,segment.size = 0.15,segment.color = "black",min.segment.length=0,
                    box.padding=unit(0.2, "lines"),point.padding=unit(0, "lines"),max.overlaps = 50) +
    scale_x_continuous(limits=c(-(x_max*1.2),(x_max*1.2)),n.breaks = 8) +
    scale_y_continuous(limits=c(0,y_aes_value)) +
    theme_pubclean() +
    theme(text = element_text(size = 8, family="sans"),
          plot.title = element_text(hjust = 0.5, face = "bold"),
          legend.position="none")
  
  # patch plot
  patch_plot <- cowplot::plot_grid(p, legnd, ncol = 1, rel_heights = c(10,1))
  ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano_add_gene_id.pdf")), plot = patch_plot, width = 4, height = 4)
  ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano_add_gene_id.png")), plot = patch_plot, width = 4, height = 4, dpi = 300)
  
  # simple plot
  p_simple <- ggplot(deg_result, aes(x = log2FC, y = log10)) +
    geom_point(data=non_deg_result,aes(x = log2FC, y = log10),
               size=0.7,shape = 21,color="#D3D3D3",alpha=0.8) +
    geom_point(data=deg_result_up,aes(x = log2FC, y = log10),
               size = 1,shape = 1,fill="#e41749",color = "#e41749",alpha=0.6) +
    geom_point(data=up_deg_result,aes(x = log2FC, y = log10),
               size=0.7,shape = 21,color="#e41749",fill = "#e41749",alpha=0.6) +
    geom_point(data=deg_result_down,aes(x = log2FC, y = log10),
               size=1,shape = 1,fill="#41b6e6",color="#41b6e6",alpha=0.6) +
    geom_point(data=down_deg_result,aes(x = log2FC, y = log10),
               size=0.7,shape = 21,color="#41b6e6",fill="#41b6e6",alpha=0.6) +
    geom_vline(xintercept=LFCCutoff,lty=2,col="#C0C0C0",lwd=0.1) +
    geom_vline(xintercept=-LFCCutoff,lty=2,col="#C0C0C0",lwd=0.1) +
    geom_hline(yintercept = -log10(padjCutoff),lty=2,col="#C0C0C0",lwd=0.1) +
    labs(x= bquote("RNA-seq " * log[2] * " fold change " * .(EXP_NAEE) * ""),
         y= expression(paste(-log[10], "(Adjusted P-value)")), 
         title =paste0(EXP_NAEE," Volcano Plot")) +
    scale_x_continuous(limits=c(-(x_max*1.2),(x_max*1.2)),n.breaks = 8) +
    scale_y_continuous(limits=c(0,y_aes_value)) +
    theme_pubclean() +
    theme(text = element_text(size = 8, family="sans"),
          plot.title = element_text(hjust = 0.5, face = "bold"),
          legend.position="none")
  
  patch_plot_simple <- cowplot::plot_grid(p_simple, legnd, ncol = 1,rel_heights = c(10,1))
  ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano.pdf")), plot = patch_plot_simple, width = 4, height = 4)
  ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano.png")), plot = patch_plot_simple, width = 4, height = 4, dpi = 300)
}

# 3. 命令行参数 & 初始化 --------------------------------------------------
option_list <- list(
  make_option(c("-c", "--counts"), type = "character", default = NULL, help = "counts.csv"),
  make_option(c("-m", "--metadata"), type = "character", default = NULL, help = "metadata.csv"),
  make_option(c("-p", "--pairs"), type = "character", default = NULL, help = "contrasts.csv"),
  make_option(c("-a", "--annotation"), type = "character", default = NULL, help = "anno.csv"),
  make_option(c("-o", "--outdir"), type = "character", default = "./results", help = "Output Path"),
  make_option(c("-l", "--log_file"), type = "character", default = "deseq2.log", help = "Log Filename"),
  make_option(c("--lfc"), type = "numeric", default = 1.0, help = "Log2 Fold Change Cutoff"),
  make_option(c("--pval"), type = "numeric", default = 0.05, help = "Adjusted P-value (padj) Cutoff")
)
opt_parser <- OptionParser(option_list = option_list)
opt <- parse_args(opt_parser)

# 【Fix】: 先创建一个纯 Console 的 Logger 用于检查参数
# 防止参数错误时，脚本就创建了 output 目录
temp_logger <- log4r_init(level = "INFO", log_file = NULL)

if (is.null(opt$counts) || is.null(opt$metadata) || is.null(opt$pairs)){
  print_help(opt_parser)
  log4r::fatal(temp_logger, "Missing Arguments! Please check your inputs.")
  stop("Execution halted.", call. = FALSE)
}

# 【Fix】: 参数检查通过后，再创建目录和文件 Logger
if(!dir.exists(opt$outdir)) dir.create(opt$outdir, recursive = TRUE)
log_path <- file.path(opt$outdir, basename(opt$log_file))

# Re-initialize logger with file appender
logger <- log4r_init(level = "INFO", log_file = log_path)

cat(paste0("Log file location: ", log_path, "\n"))
log4r::info(logger, paste0("Settings -> LFC: ", opt$lfc, " | Padj: ", opt$pval))

# 4. 数据读取 --------------------------------------------------
read_data <- function(file_path){
  if(grepl(".csv$", file_path)) read.csv(file_path, row.names = 1, check.names = F)
  else read.table(file_path, header = T, row.names = 1, sep = "\t", check.names = F)
}

counts_data <- read_data(opt$counts)
if(grepl(".csv$", opt$metadata)) meta_data <- read.csv(opt$metadata, stringsAsFactors = F) else meta_data <- read.table(opt$metadata, header = T, sep = "\t", stringsAsFactors = F)

# 统一列名
if("sample_name" %in% colnames(meta_data)) colnames(meta_data)[colnames(meta_data) == "sample_name"] <- "Sample"
if("group" %in% colnames(meta_data)) colnames(meta_data)[colnames(meta_data) == "group"] <- "Group"

# 样本对齐
common_samples <- intersect(colnames(counts_data), meta_data$Sample)
counts_data <- counts_data[, common_samples]
meta_data <- meta_data[meta_data$Sample %in% common_samples, ]
rownames(meta_data) <- meta_data$Sample
meta_data <- meta_data[colnames(counts_data), ]

# Annotation
anno_db <- NULL
if(!is.null(opt$annotation)){
  anno_db <- read.csv(opt$annotation)
  colnames(anno_db)[1] <- "ENSEMBL"
}

# 5. Global PCA Analysis --------------------------------------------------
log4r::info(logger, ">>> Running Global PCA Analysis...")

tryCatch({
  dds_all <- DESeqDataSetFromMatrix(countData = round(counts_data), colData = meta_data, design = ~Group)
  vst_data <- vst(dds_all, blind = TRUE)
  pca_matrix <- assay(vst_data)
  sample_pca <- prcomp(t(pca_matrix))
  
  pc_scores <- sample_pca$x %>% as.data.frame() %>%
    tibble::rownames_to_column(var = 'Sample') %>%
    left_join(meta_data, by = "Sample")
  
  percentVar <- round(100 * summary(sample_pca)$importance[2, ], 1)
  
  p1 <- ggplot(pc_scores, aes(x = PC1, y = PC2, color = Group)) +
    geom_point(size = 5, alpha = 0.8) +
    ggtitle("PCA Plot (PC1 vs PC2)") +
    labs(x = paste0("PC1: ", percentVar[1], "% variance"),
         y = paste0("PC2: ", percentVar[2], "% variance"),
         color = "Group") +
    theme_minimal() + theme(plot.title = element_text(hjust = 0.5, face="bold"), legend.position = 'bottom')
  
  p2 <- ggplot(pc_scores, aes(x = PC2, y = PC3, color = Group)) +
    geom_point(size = 5, alpha = 0.8) +
    ggtitle("PCA Plot (PC2 vs PC3)") +
    labs(x = paste0("PC2: ", percentVar[2], "% variance"),
         y = paste0("PC3: ", percentVar[3], "% variance"),
         color = "Group") +
    theme_minimal() + theme(plot.title = element_text(hjust = 0.5, face="bold"), legend.position = 'bottom')
  
  pca_combined <- p1 + p2 + patchwork::plot_layout(guides = 'collect') & theme(legend.position = 'bottom')
  
  ggsave(file.path(opt$outdir, "Global_PCA_Combined.pdf"), plot = pca_combined, width = 10, height = 5)
  ggsave(file.path(opt$outdir, "Global_PCA_Combined.png"), plot = pca_combined, width = 10, height = 5, dpi=300)
  log4r::info(logger, "   - PCA Plot saved.")
}, error = function(e){
  log4r::error(logger, paste0("PCA Analysis Failed: ", e$message))
})

# 6. 差异分析主循环 & 统计 --------------------------------------------
contrast_pairs <- read.csv(opt$pairs, stringsAsFactors = F)

# 初始化统计列表
deg_stat_list <- list()

for(i in 1:nrow(contrast_pairs)){
  ctrl <- contrast_pairs[i, "Control"]
  treat <- contrast_pairs[i, "Treat"]
  name <- paste0(treat, "_vs_", ctrl)
  
  log4r::info(logger, paste0(">>> Running Contrast: ", name))
  
  if(!ctrl %in% meta_data$Group || !treat %in% meta_data$Group) {
    log4r::warn(logger, paste0("Skipping ", name, " (Group not found)"))
    next
  }
  
  sub_meta <- meta_data[meta_data$Group %in% c(ctrl, treat), ]
  sub_meta$Group <- factor(sub_meta$Group, levels = c(ctrl, treat))
  sub_counts <- counts_data[, sub_meta$Sample]
  
  dds <- DESeqDataSetFromMatrix(countData = round(sub_counts), colData = sub_meta, design = ~Group)
  dds <- dds[rowSums(counts(dds)) > 1, ] 
  dds <- DESeq(dds, quiet = TRUE)
  
  res <- results(dds, contrast = c("Group", treat, ctrl), alpha = opt$pval)
  res_df <- as.data.frame(res) %>% rownames_to_column("ENSEMBL") %>% arrange(padj)
  
  if(!is.null(anno_db)){
    res_df <- left_join(res_df, anno_db, by = "ENSEMBL")
  } else {
    res_df$Symbol <- res_df$ENSEMBL
  }
  
  write.csv(res_df, file.path(opt$outdir, paste0(name, "_DEG.csv")), row.names = F)
  
  # 统计差异基因数量
  n_up <- sum(res_df$padj < opt$pval & res_df$log2FoldChange > opt$lfc, na.rm = TRUE)
  n_down <- sum(res_df$padj < opt$pval & res_df$log2FoldChange < -opt$lfc, na.rm = TRUE)
  n_total_deg <- n_up + n_down
  
  # 存入列表
  deg_stat_list[[i]] <- data.frame(
    Contrast = name,
    Control = ctrl,
    Treat = treat,
    Up_Regulated = n_up,
    Down_Regulated = n_down,
    Total_DEG = n_total_deg,
    LFC_Cutoff = opt$lfc,
    Padj_Cutoff = opt$pval,
    stringsAsFactors = FALSE
  )
  
  # 画图数据准备
  plot_data <- res_df %>% 
    dplyr::rename(log2FC = log2FoldChange) %>% 
    dplyr::filter(!is.na(padj) & !is.na(log2FC)) 
  
  log4r::info(logger, paste0("   - Stats: Up=", n_up, " | Down=", n_down))
  log4r::info(logger, paste0("   - Drawing Volcano Plot..."))
  
  tryCatch({
    DrawVolcano(deg_result = plot_data, 
                padjCutoff = opt$pval,
                LFCCutoff = opt$lfc, 
                EXP_NAEE = name, 
                deg_figure_dir = opt$outdir) 
  }, error = function(e){
    log4r::error(logger, paste0("Volcano Plot Failed: ", e$message))
  })
}

# 输出总统计表
if(length(deg_stat_list) > 0){
  final_stats <- do.call(rbind, deg_stat_list)
  stats_file <- file.path(opt$outdir, "All_Contrast_DEG_Statistics.csv")
  write.csv(final_stats, stats_file, row.names = FALSE)
  log4r::info(logger, paste0(">>> Global Statistics saved to: ", basename(stats_file)))
}

log4r::info(logger, "All Done! 哈基咪任务完成！")