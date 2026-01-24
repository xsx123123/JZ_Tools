#!/usr/bin/env Rscript

# ==============================================================================
# ATAC-seq DESeq2 Pipeline with Peak Annotations & Smart Metadata Parser
# Author: Jian Zhang (Adapted by 哈基咪)
# Date: 2026-01-23
# Version: 4.2 (Final Edition: Fixed sample matching, data types & error handling)
# ==============================================================================

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
    else paste0(time_str, " [", level, "] ", msg, '\n')
  }
  
  appenders_list <- list(console_appender(my_console_layout))
  if (!is.null(log_file)) {
    file_layout <- function(level, ...) paste0(format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " [", level, "] ", paste0(..., collapse = "\n"), "\n")
    appenders_list <- c(appenders_list, file_appender(log_file, layout = file_layout))
  }
  return(log4r::logger(threshold = level, appenders = appenders_list))
}

# 2. 定义绘图函数 (适配 ATAC-seq Peak) -----------------------------------
DrawVolcano <- function(deg_result, EXP_NAEE = NULL, pvalCutoff = 0.05, LFCCutoff = 1, TOP_GENE = 10, deg_figure_dir = "./"){ 
  require(ggpubr)
  require(cowplot)
  
  # 防止 -log10(0) 报错
  deg_result$pvalue[which(deg_result$pvalue == 0)] <- .Machine$double.xmin
  deg_result <- deg_result %>% tibble() |> mutate(log10 = -log10(pvalue)) 
  
  deg_result$Group <- "Non-significant"
  deg_result$Group[which((deg_result$pvalue < pvalCutoff) & (deg_result$log2FC > LFCCutoff))] = "Up-regulated"
  deg_result$Group[which((deg_result$pvalue < pvalCutoff) & (deg_result$log2FC < -LFCCutoff))] = "Down-regulated"
  deg_result <- deg_result %>% arrange(pvalue)
  
  deg_result_up <- head(subset(deg_result, deg_result$Group == "Up-regulated"), TOP_GENE)
  deg_result_down <- head(subset(deg_result, deg_result$Group == "Down-regulated"), TOP_GENE)
  
  # 动态确定 Y 轴高度
  y_aes_vals <- deg_result$log10[is.finite(deg_result$log10)]
  y_aes_value <- if(length(y_aes_vals) > 0) max(y_aes_vals)*1.1 else 10
  x_max <- min(max(abs(na.omit(deg_result$log2FC))), 7.5) # 限制X轴极值，防止散点太分散
  
  p <- ggplot(deg_result, aes(x = log2FC, y = log10)) +
    geom_point(aes(color=Group, fill=Group), size=0.8, shape=21, alpha=0.6) +
    scale_color_manual(values = c("Down-regulated" = "#41b6e6", "Non-significant" = "#D3D3D3", "Up-regulated" = "#e41749")) +
    scale_fill_manual(values = c("Down-regulated" = "#41b6e6", "Non-significant" = "#D3D3D3", "Up-regulated" = "#e41749")) +
    geom_vline(xintercept=c(LFCCutoff, -LFCCutoff), lty=2, col="#C0C0C0", lwd=0.1) +
    geom_hline(yintercept = -log10(pvalCutoff), lty=2, col="#C0C0C0", lwd=0.1) +
    labs(x= bquote("ATAC-seq " * log[2] * " fold change " * .(EXP_NAEE) * ""),
         y= expression(paste(-log[10], "(P-value)")), 
         title = paste0(EXP_NAEE," Peak Volcano")) +
    scale_x_continuous(limits=c(-(x_max*1.2),(x_max*1.2))) +
    scale_y_continuous(limits=c(0,y_aes_value)) +
    theme_pubclean() + theme(legend.position = "bottom")
  
  # 如果有差异 Peak，则添加 Label
  if(nrow(deg_result_up) > 0 || nrow(deg_result_down) > 0) {
    p <- p + geom_text_repel(data = rbind(deg_result_up, deg_result_down), 
                             aes(log2FC, log10, label= Label),
                             size=2, colour="black", fontface="bold.italic",
                             segment.color = "black", max.overlaps = 50)
  }
  
  ggsave(file.path(deg_figure_dir, paste0(EXP_NAEE,"_Volcano.pdf")), plot = p, width = 5, height = 5)
  ggsave(file.path(deg_figure_dir, paste0(EXP_NAEE,"_Volcano.png")), plot = p, width = 5, height = 5, dpi = 300)
}

# 3. 命令行参数 & 初始化 --------------------------------------------------
option_list <- list(
  make_option(c("-c", "--counts"), type = "character", help = "ATAC-seq Annotated Peak Counts (e.g. from HOMER)"),
  make_option(c("-m", "--metadata"), type = "character", help = "Sample metadata"),
  make_option(c("-p", "--pairs"), type = "character", help = "Contrast pairs"),
  make_option(c("-o", "--outdir"), type = "character", default = "./ATAC_results", help = "Output Path"),
  make_option(c("--lfc"), type = "numeric", default = 0.585, help = "Log2 FC Cutoff (0.585 = 1.5 fold)"),
  make_option(c("--pval"), type = "numeric", default = 0.05, help = "P-value Cutoff"),
  make_option(c("--label_col"), type = "character", default = "Gene Alias", help = "Column name to use for volcano plot labels (e.g., 'Gene Alias', 'Nearest Refseq')")
)

opt_parser <- OptionParser(option_list = option_list)
opt <- parse_args(opt_parser)

# 【防御性检查】输入参数检查机制
if (is.null(opt$counts) || is.null(opt$metadata) || is.null(opt$pairs)){
  print_help(opt_parser)
  cat("\n")
  stop("❌ 哈基咪提示：缺少必要的输入文件参数 (-c, -m, -p)！请查看上方的 Help 文档。", call. = FALSE)
}

logger <- log4r_init(level = "INFO")
if(!dir.exists(opt$outdir)) dir.create(opt$outdir, recursive = TRUE)

# 4. ATAC-seq 数据读取与矩阵拆分 -----------------------------------------
log4r::info(logger, ">>> Loading ATAC-seq Peak Data...")

# 读取包含注释的 Count 表格
raw_peaks <- read.delim(opt$counts, check.names = FALSE, stringsAsFactors = FALSE)

# 寻找 Count 数据列的起始位置
split_idx <- which(colnames(raw_peaks) == "10 Distance to nearest Peak, Peak ID") + 1

if(length(split_idx) == 0){
  log4r::fatal(logger, "Cannot find the split column. Check your ATAC-seq peak file format.")
  stop("Format Error", call. = FALSE)
}

# 拆分 Annotation 和 Count Matrix
peak_anno <- raw_peaks[, 1:(split_idx-1)]
count_matrix <- raw_peaks[, split_idx:ncol(raw_peaks)]
peak_anno$PeakID <- as.character(peak_anno$PeakID)
rownames(count_matrix) <- peak_anno$PeakID 

# 智能读取 Metadata (支持 csv 和 tsv)
if(grepl(".csv$", opt$metadata)) {
  meta_data <- read.csv(opt$metadata, stringsAsFactors = F, check.names = F)
} else {
  meta_data <- read.delim(opt$metadata, header = T, stringsAsFactors = F, check.names = F)
}

# 精准锁定 SRR ID 所在的列 (解决 sample vs sample_name 问题)
if("sample" %in% colnames(meta_data)) colnames(meta_data)[colnames(meta_data) == "sample"] <- "Sample"

# 统一分组列名 (大小写敏感处理)
if("group" %in% colnames(meta_data)) colnames(meta_data)[colnames(meta_data) == "group"] <- "Group"

rownames(meta_data) <- meta_data$Sample

# 获取共有样本
common_samples <- intersect(colnames(count_matrix), meta_data$Sample)

# 硬核报错检查：如果找不到共有样本，立刻打印前几个名字帮助排查
if(length(common_samples) == 0){
  log4r::fatal(logger, "🔥 致命错误: Count矩阵与Metadata之间没有找到匹配的样本名！")
  log4r::info(logger, paste0("Count 矩阵中的样本名示例: ", paste(head(colnames(count_matrix), 3), collapse=", ")))
  log4r::info(logger, paste0("Metadata 中的样本名示例: ", paste(head(meta_data$Sample, 3), collapse=", ")))
  stop("Sample ID mismatch.", call. = FALSE)
}

# 子集化并强制转换为数值型矩阵（防止 logical 报错）
count_matrix <- count_matrix[, common_samples, drop=FALSE]
count_matrix <- as.matrix(sapply(count_matrix, as.numeric)) 
meta_data <- meta_data[common_samples, ]

log4r::info(logger, paste0("Detected ", nrow(count_matrix), " peaks and ", ncol(count_matrix), " samples."))

# 5. Global PCA Analysis --------------------------------------------------
log4r::info(logger, ">>> Running Global PCA for ATAC-seq...")
dds_all <- DESeqDataSetFromMatrix(countData = round(count_matrix), colData = meta_data, design = ~Group)
vst_data <- vst(dds_all, blind = TRUE)
pca_plot <- plotPCA(vst_data, intgroup="Group") + theme_pubclean() + ggtitle("ATAC-seq Peak PCA")
ggsave(file.path(opt$outdir, "Global_PCA.pdf"), plot = pca_plot, width = 6, height = 4)

# 6. 差异分析主循环 -------------------------------------------------------
contrast_pairs <- read.csv(opt$pairs, stringsAsFactors = F)

for(i in 1:nrow(contrast_pairs)){
  ctrl <- contrast_pairs[i, "Control"]
  treat <- contrast_pairs[i, "Treat"]
  name <- paste0(treat, "_vs_", ctrl)
  
  log4r::info(logger, paste0(">>> Running Contrast: ", name))
  
  sub_meta <- meta_data[meta_data$Group %in% c(ctrl, treat), ]
  sub_meta$Group <- factor(sub_meta$Group, levels = c(ctrl, treat))
  sub_counts <- count_matrix[, sub_meta$Sample]
  
  dds <- DESeqDataSetFromMatrix(countData = round(sub_counts), colData = sub_meta, design = ~Group)
  dds <- DESeq(dds, quiet = TRUE)
  
  res <- results(dds, contrast = c("Group", treat, ctrl), alpha = opt$pval)
  res_df <- as.data.frame(res) %>% rownames_to_column("PeakID") %>% arrange(pvalue)
  
  # 将 ATAC-seq 特有的注释信息合并回来
  res_annotated <- left_join(res_df, peak_anno, by = "PeakID")
  write.csv(res_annotated, file.path(opt$outdir, paste0(name, "_Differential_Peaks.csv")), row.names = FALSE)
  
  # 检查用户指定的标签列是否存在
  label_col_name <- opt$label_col
  if (!label_col_name %in% colnames(res_annotated)) {
    log4r::warn(logger, paste0("Specified label column '", label_col_name, "' not found. Falling back to PeakID."))
    label_col_name <- "PeakID"
  }

  # 准备绘图数据：动态映射 Label 列
  plot_data <- res_annotated %>% 
    dplyr::rename(log2FC = log2FoldChange) %>% 
    dplyr::filter(!is.na(pvalue)) %>%
    # 动态使用用户指定的列进行注释，如果为空则用 PeakID 兜底
    mutate(Label = ifelse(is.na(!!sym(label_col_name)) | !!sym(label_col_name) == "", PeakID, !!sym(label_col_name)))
  
  DrawVolcano(deg_result = plot_data, EXP_NAEE = name, pvalCutoff = opt$pval, LFCCutoff = opt$lfc, deg_figure_dir = opt$outdir)
}

log4r::info(logger, "All Done! 哈基咪任务完成！")