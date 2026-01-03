#!/usr/bin/env Rscript

# ==============================================================================
# DESeq2 Pipeline with Advanced Volcano Plots
# Author: Jian Zhang (Integrated by Hajimi)
# Date: 2026-01-03
# Version: 3.2 (Log path fixed & Rename conflict resolved)
# ==============================================================================

# 0. 加载必要的包 ---------------------------------------------------------
suppressPackageStartupMessages({
  library(optparse)
  library(DESeq2)
  library(tidyverse)
  library(ggplot2)
  library(ggrepel)
  library(patchwork) 
  library(log4r)
  library(crayon)
})

# 1. 定义 Log 模块 --------------------------------------------------------
log4r_init <- function(level = "INFO", log_file = NULL){
  require(log4r)
  require(crayon)
  
  # 控制台输出格式：带颜色，带 Emoji
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
  
  # 文件输出格式：纯文本，不带颜色
  if (!is.null(log_file)) {
    file_layout <- function(level, ...) paste0(format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " [", level, "] ", paste0(..., collapse = "\n"), "\n")
    appenders_list <- c(appenders_list, file_appender(log_file, layout = file_layout))
  }
  return(log4r::logger(threshold = level, appenders = appenders_list))
}

# 2. 定义绘图函数 (包含你所有的绘图逻辑) ----------------------------------
DrawVolcano <- function(deg_result, pvalCutoff, LFCCutoff, EXP_NAEE, deg_figure_dir, y_aes){
  # 处理 P value = 0 的情况
  if (min(deg_result$pvalue, na.rm=T) == 0) {
    deg_result$pvalue[which(deg_result$pvalue == 0)] <- .Machine$double.xmin
  }
  
  # 准备数据
  deg_result <- deg_result %>% dplyr::rename(p_val = pvalue) %>% tibble()
  deg_result <- deg_result %>% mutate(log10 = -log10(p_val))
  
  # 添加分组标签
  deg_result$label = NA
  deg_result$Group <- "Non-significant"
  deg_result$Group[which((deg_result$p_val < pvalCutoff) & (deg_result$log2FC > LFCCutoff))] = "Up-regulated"
  deg_result$Group[which((deg_result$p_val < pvalCutoff) & (deg_result$log2FC < -LFCCutoff))] = "Down-regulated"
  
  # 排序
  deg_result <- deg_result %>% arrange(p_val)
  
  # 拆分数据子集
  non_deg_result <- subset(deg_result, deg_result$Group =="Non-significant")
  up_deg_result <- subset(deg_result, deg_result$Group =="Up-regulated")
  down_deg_result <- subset(deg_result, deg_result$Group =="Down-regulated")
  
  # 提取 Top 基因
  deg_result_up <- head(subset(deg_result, deg_result$Group == "Up-regulated"), 15)
  deg_result_down <- head(subset(deg_result, deg_result$Group == "Down-regulated"), 15)
  
  # 自动计算 Y 轴上限
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
  
  # 自动计算 X 轴上限
  x_aes <- na.omit(deg_result$log2FC)
  x_max <- max(abs(x_aes))
  if (x_max > 7.5) x_max <- 7.5
  
  # --- 绘图 Type 2 (Standard) ---
  p <- ggplot(deg_result, aes(x = log2FC, y = log10)) +
    geom_point(data=non_deg_result,aes(x = log2FC, y = log10),size=0.02,shape = 21,color="#C7C7C7",alpha=0.25) +
    geom_point(data=deg_result_up,aes(x = log2FC, y = log10),size=0.02,shape = 21,fill="#e41749",alpha=0.5) +
    geom_point(data=up_deg_result,aes(x = log2FC, y = log10),size=0.02,shape = 21,color="#e41749",alpha=0.4) +
    geom_point(data=deg_result_down,aes(x = log2FC, y = log10),size=0.02,shape = 21,fill="#41b6e6",alpha=0.5) +
    geom_point(data=down_deg_result,aes(x = log2FC, y = log10),size=0.02,shape = 21,color="#41b6e6",alpha=0.4) +
    geom_vline(xintercept=LFCCutoff,lty=2,col="black",lwd=0.1) +
    geom_vline(xintercept=-LFCCutoff,lty=2,col="black",lwd=0.1) +
    geom_hline(yintercept = -log10(pvalCutoff),lty=2,col="black",lwd=0.1) +
    labs(x= bquote("RNA-seq " * log[2] * " fold change " * .(EXP_NAEE) * ""),y= expression(paste(-log[10], "P-value")),title =paste0(EXP_NAEE," Volcano Plot")) +
    geom_text_repel(data = deg_result_up,aes(log2FC, log10, label= Symbol),size=1.5,colour="black",fontface="bold.italic",
                    segment.alpha = 0.5,segment.size = 0.15,segment.color = "black",min.segment.length=0,
                    box.padding=unit(0.2, "lines"),point.padding=unit(0, "lines"),max.overlaps = 50) +
    geom_text_repel(data = deg_result_down,aes(log2FC, log10, label= Symbol),size=1.5,colour="black",fontface="bold.italic",
                    segment.alpha =0.5,segment.size = 0.15,segment.color = "black",min.segment.length=0,
                    box.padding=unit(0.2, "lines"),point.padding=unit(0, "lines"),max.overlaps = 50) +
    scale_x_continuous(limits=c(-(x_max*1.2),(x_max*1.2))) +
    scale_y_continuous(limits=c(0,y_aes_value)) +
    theme_classic() +
    theme(text = element_text(size = 8, family="sans"),
          plot.title = element_text(hjust = 0.5, face = "bold"),
          legend.position="none")
  
  ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano_Type2.pdf")), plot = p, width = 4, height = 4)
  ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano_Type2.png")), plot = p, width = 4, height = 4, dpi = 300)

  # --- 绘图 Type 4 (Advanced with Sidebar) ---
  top10_up <- head(subset(deg_result, Group == "Up-regulated"), 10) %>% mutate(number = as.character(10:1))
  top10_down <- head(subset(deg_result, Group == "Down-regulated"), 10) %>% mutate(number = as.character(10:1))
  
  if(nrow(top10_up) > 0 && nrow(top10_down) > 0){
    # Up Legend
    up_legend <- ggplot(top10_up, aes(y = factor(number, levels=as.character(1:10)), x = 1)) +
      geom_point(size = 3, shape = 21, fill="#e41749", color="NA") +
      geom_text(aes(label = number), fontface = "bold", size = 2, color="black") +
      geom_text(aes(label = Symbol, x=1.2), size = 2, fontface = "bold", hjust=0) +
      xlim(0.9, 2) + theme_void() + ggtitle("Up Gene") + 
      theme(plot.title = element_text(color="#e41749", hjust=0.5))
      
    # Down Legend
    down_legend <- ggplot(top10_down, aes(y = factor(number, levels=as.character(1:10)), x = 1)) +
      geom_point(size = 3, shape = 21, fill="#41b6e6", color="NA") +
      geom_text(aes(label = number), fontface = "bold", size = 2, color="black") +
      geom_text(aes(label = Symbol, x=1.2), size = 2, fontface = "bold", hjust=0) +
      xlim(0.9, 2) + theme_void() + ggtitle("Down Gene") +
      theme(plot.title = element_text(color="#41b6e6", hjust=0.5))

    # Main Plot
    p3 <- ggplot(deg_result, aes(x = log2FC, y = log10)) +
      geom_point(data=non_deg_result,aes(x = log2FC, y = log10),size=0.5, color="#C7C7C7", alpha=0.5) +
      geom_point(data=up_deg_result, size=0.5, color="#e41749", alpha=0.4) +
      geom_point(data=down_deg_result, size=0.5, color="#41b6e6", alpha=0.4) +
      geom_point(data=top10_up, size=3, shape=21, fill="#e41749", color="black") +
      geom_text(data=top10_up, aes(label=number), size=2, fontface="bold") +
      geom_point(data=top10_down, size=3, shape=21, fill="#41b6e6", color="black") +
      geom_text(data=top10_down, aes(label=number), size=2, fontface="bold") +
      geom_vline(xintercept=c(-LFCCutoff, LFCCutoff), lty=2, lwd=0.2) +
      geom_hline(yintercept=-log10(pvalCutoff), lty=2, lwd=0.2) +
      labs(x="Log2 Fold Change", y="-Log10 P-value", title=paste0(EXP_NAEE)) +
      scale_x_continuous(limits=c(-(x_max*1.2),(x_max*1.2))) +
      scale_y_continuous(limits=c(0,y_aes_value)) +
      theme_classic()
    
    combined_plot <- (p3 + (up_legend / down_legend)) + plot_layout(widths = c(3, 1))
    
    ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano_Type4.pdf")), plot = combined_plot, width = 6, height = 4)
    ggsave(file.path(deg_figure_dir,paste0(EXP_NAEE,"_Volcano_Type4.png")), plot = combined_plot, width = 6, height = 4, dpi = 300)
  }
}

# 3. 命令行参数 & 初始化 --------------------------------------------------
option_list <- list(
  make_option(c("-c", "--counts"), type = "character", default = NULL, help = "counts.csv"),
  make_option(c("-m", "--metadata"), type = "character", default = NULL, help = "metadata.csv"),
  make_option(c("-p", "--pairs"), type = "character", default = NULL, help = "contrasts.csv"),
  make_option(c("-a", "--annotation"), type = "character", default = NULL, help = "anno.csv"),
  make_option(c("-o", "--outdir"), type = "character", default = "./results", help = "Output Path"),
  make_option(c("-l", "--log_file"), type = "character", default = "deseq2.log", help = "Log Filename (Default: deseq2.log)")
)
opt_parser <- OptionParser(option_list = option_list)
opt <- parse_args(opt_parser)

# 【核心修改点】确保输出目录存在，并且日志文件锁定在该目录下
if(!dir.exists(opt$outdir)) dir.create(opt$outdir, recursive = TRUE)

# 强制将 log 文件路径设置在 outdir 下
log_path <- file.path(opt$outdir, basename(opt$log_file))

# 初始化 Logger
logger <- log4r_init(level = "INFO", log_file = log_path)

# 打印日志位置确认
cat(paste0("Log file location: ", log_path, "\n"))

if (is.null(opt$counts) || is.null(opt$metadata) || is.null(opt$pairs)){
  print_help(opt_parser)
  log4r::fatal(logger, "Missing Arguments! Check inputs.")
  stop()
}

# 4. 数据读取与处理 -------------------------------------------------------
read_data <- function(file_path){
  if(grepl(".csv$", file_path)) read.csv(file_path, row.names = 1, check.names = F)
  else read.table(file_path, header = T, row.names = 1, sep = "\t", check.names = F)
}

log4r::info(logger, "读取数据中...")
counts_data <- read_data(opt$counts)

# Metadata Reading Logic
if(grepl(".csv$", opt$metadata)) meta_data <- read.csv(opt$metadata, stringsAsFactors = F) else meta_data <- read.table(opt$metadata, header = T, sep = "\t", stringsAsFactors = F)

if("sample_name" %in% colnames(meta_data)) colnames(meta_data)[colnames(meta_data) == "sample_name"] <- "Sample"
if("group" %in% colnames(meta_data)) colnames(meta_data)[colnames(meta_data) == "group"] <- "Group"

if(!"Sample" %in% colnames(meta_data) || !"Group" %in% colnames(meta_data)) {
  log4r::fatal(logger, "Metadata format error: Need 'sample_name' and 'group' columns.")
  stop()
}

# Annotation
anno_db <- NULL
if(!is.null(opt$annotation)){
  anno_db <- read.csv(opt$annotation)
  colnames(anno_db)[1] <- "ENSEMBL"
}

# Align
common_samples <- intersect(colnames(counts_data), meta_data$Sample)
if(length(common_samples) == 0) {
  log4r::fatal(logger, "Counts matrix and Metadata sample names do not match!")
  stop()
}
counts_data <- counts_data[, common_samples]
meta_data <- meta_data[meta_data$Sample %in% common_samples, ]
rownames(meta_data) <- meta_data$Sample
meta_data <- meta_data[colnames(counts_data), ]

# 5. 主循环 (Analysis Loop) -----------------------------------------------
contrast_pairs <- read.csv(opt$pairs, stringsAsFactors = F)
log4r::info(logger, paste0("开始分析 ", nrow(contrast_pairs), " 组对比..."))

for(i in 1:nrow(contrast_pairs)){
  ctrl <- contrast_pairs[i, "Control"]
  treat <- contrast_pairs[i, "Treat"]
  name <- paste0(treat, "_vs_", ctrl)
  
  log4r::info(logger, paste0(">>> Running: ", name))
  
  if(!ctrl %in% meta_data$Group || !treat %in% meta_data$Group){
    log4r::warn(logger, paste0("Skipping ", name, ": Group not found in metadata."))
    next
  }
  
  # Subset & DESeq2
  sub_meta <- meta_data[meta_data$Group %in% c(ctrl, treat), ]
  sub_meta$Group <- factor(sub_meta$Group, levels = c(ctrl, treat))
  sub_counts <- counts_data[, sub_meta$Sample]
  
  dds <- DESeqDataSetFromMatrix(countData = round(sub_counts), colData = sub_meta, design = ~Group)
  dds <- dds[rowSums(counts(dds)) > 1, ]
  dds <- DESeq(dds, quiet = TRUE)
  
  res <- results(dds, contrast = c("Group", treat, ctrl), alpha=0.05)
  res_df <- as.data.frame(res) %>% rownames_to_column("ENSEMBL") %>% arrange(padj)
  
  # Add Annotation
  if(!is.null(anno_db)){
    res_df <- left_join(res_df, anno_db, by = "ENSEMBL")
  } else {
    res_df$Symbol <- res_df$ENSEMBL
  }
  
  # Save CSV
  write.csv(res_df, file.path(opt$outdir, paste0(name, "_DEG.csv")), row.names = F)
  
  # --- Call YOUR Advanced Volcano Plot ---
  # 【FIXED CONFLICT HERE】解决 pvalue 重名报错的问题
  plot_data <- res_df %>% 
    dplyr::rename(raw_pvalue = pvalue) %>% # 1. 腾出 'pvalue' 名字
    dplyr::rename(log2FC = log2FoldChange, pvalue = padj) %>% # 2. 将 padj 重命名为 pvalue
    dplyr::filter(!is.na(pvalue) & !is.na(log2FC))
  
  log4r::info(logger, "   - 正在绘制高级火山图 (Type 2 & Type 4)...")
  
  tryCatch({
    DrawVolcano(deg_result = plot_data, 
                pvalCutoff = 0.05, 
                LFCCutoff = 1, 
                EXP_NAEE = name, 
                deg_figure_dir = opt$outdir)
  }, error = function(e){
    log4r::error(logger, paste0("Plotting Failed for ", name, ": ", e$message))
  })
}

log4r::info(logger, "Done! 哈基咪任务完成！(๑•̀ㅂ•́)و✧")