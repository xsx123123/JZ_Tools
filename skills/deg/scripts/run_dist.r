#!/usr/bin/env Rscript

# ==============================================================================
# Expression Distribution Pipeline (TPM & FPKM)
# Author: Jian Zhang (Integrated by Hajimi)
# Date: 2026-01-07
# Version: 1.2 (Fixed: Continuous value to discrete scale error)
# ==============================================================================

# 0. 加载必要的包 ---------------------------------------------------------
suppressPackageStartupMessages({
  library(optparse)
  library(tidyverse)
  library(ggpubr)
  library(ggplot2)
  library(patchwork)
  library(log4r)
  library(crayon)
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

# 2. 定义绘图函数 ---------------------------------------------------------
# 定义更丰富的色板，防止分组过多时颜色不够
colors_discrete_friendly_long <- c("#CC79A7","#0072B2","#56B4E9","#009E73","#F5C710","#E69F00","#D55E00", 
                                   "#999999", "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7")

plot_expression_distribution <- function(data_matrix, meta_df, type_name = "TPM"){
  keep_genes <- rowMeans(data_matrix) > 1
  filtered_data <- data_matrix[keep_genes, ]
  
  n_total <- nrow(data_matrix)
  n_keep <- nrow(filtered_data)
  log4r::info(logger, paste0("   [", type_name, "] Filtering: Kept ", n_keep, " / ", n_total, " genes (Mean > 1)"))
  
  plot_data <- filtered_data %>%
    rownames_to_column(var = "GeneID") %>%
    pivot_longer(
      cols = -GeneID,
      names_to = "sample",
      values_to = "expression"
    ) %>%
    mutate(log_val = log2(expression + 1)) %>%
    left_join(meta_df, by = c("sample" = "Sample"))
  
  if(any(is.na(plot_data$Group))){
    log4r::warn(logger, paste0("   [", type_name, "] Warning: Some samples have missing Group info!"))
  }
  
  p <- ggplot(plot_data, aes(x = sample, y = log_val, fill = Group)) +
    geom_violin(alpha = 1, trim = FALSE, linewidth = 0) + 
    geom_boxplot(width = 0.4, fill = "white", alpha = 0.6, outlier.shape = NA) + 
    theme_bw() +
    scale_fill_manual(values = colors_discrete_friendly_long) +
    labs(title = paste0("Sample ", type_name, " Distribution"),
         subtitle = 'Filtered for mean expression > 1', 
         x = NULL,
         y = paste0("Log2(", type_name, "+1)")) +
    theme_pubclean() +
    theme(axis.text.x = element_text(angle = 90, hjust = 1),
          legend.position = 'right') # 改为 right 以便查看图例
  
  return(p)
}

# 3. 命令行参数 & 初始化 --------------------------------------------------
option_list <- list(
  make_option(c("-t", "--tpm"), type = "character", default = NULL, help = "Path to TPM matrix file"),
  make_option(c("-f", "--fpkm"), type = "character", default = NULL, help = "Path to FPKM matrix file"),
  make_option(c("-m", "--metadata"), type = "character", default = NULL, help = "Path to sample metadata"),
  make_option(c("-o", "--outdir"), type = "character", default = "./results_dist", help = "Output Directory"),
  make_option(c("-l", "--log_file"), type = "character", default = "dist_plot.log", help = "Log Filename"),
  make_option(c("--width"), type = "numeric", default = 8.5, help = "Plot Width (inches) [Default: 8.5]"),
  make_option(c("--height"), type = "numeric", default = 7.5, help = "Plot Height (inches) [Default: 7.5]")
)
opt_parser <- OptionParser(option_list = option_list)
opt <- parse_args(opt_parser)

# 【Check 1】临时 Logger
logger <- log4r_init(level = "INFO", log_file = NULL)

# 【Check 2】参数检查
if (is.null(opt$tpm) || is.null(opt$fpkm) || is.null(opt$metadata)){
  print_help(opt_parser)
  log4r::fatal(logger, "Missing Arguments! Need --tpm, --fpkm and --metadata.")
  stop("Execution halted.", call. = FALSE)
}

# 【Check 3】创建目录
if(!dir.exists(opt$outdir)) dir.create(opt$outdir, recursive = TRUE)

# 【Check 4】正式 Logger
log_path <- file.path(opt$outdir, basename(opt$log_file))
logger <- log4r_init(level = "INFO", log_file = log_path)

cat(paste0("Log file location: ", log_path, "\n"))
log4r::info(logger, "Pipeline Started: Expression Distribution Analysis")
log4r::info(logger, paste0("Output Size -> Width: ", opt$width, " in | Height: ", opt$height, " in"))

# 4. 数据读取函数 ---------------------------------------------------------
read_matrix <- function(file_path){
  if(grepl(".csv$", file_path)) {
    read.csv(file_path, row.names = 1, check.names = F)
  } else {
    read.table(file_path, header = T, row.names = 1, sep = "\t", check.names = F)
  }
}

# 5. 主流程 ---------------------------------------------------------------
tryCatch({
  # --- Step 1: 读取 Metadata ---
  log4r::info(logger, "Loading Metadata...")
  if(grepl(".csv$", opt$metadata)) {
    meta_df <- read.csv(opt$metadata, stringsAsFactors = F) 
  } else {
    meta_df <- read.table(opt$metadata, header = T, sep = "\t", stringsAsFactors = F)
  }
  
  if("sample_name" %in% colnames(meta_df)) colnames(meta_df)[colnames(meta_df) == "sample_name"] <- "Sample"
  if("group" %in% colnames(meta_df)) colnames(meta_df)[colnames(meta_df) == "group"] <- "Group"
  
  if(!"Sample" %in% colnames(meta_df) || !"Group" %in% colnames(meta_df)) {
    log4r::fatal(logger, "Metadata format error: Need 'sample_name' and 'group' columns.")
    stop("Metadata Error")
  }
  
  # 【FIX】强制转换为 Factor，解决 "Continuous value to discrete scale" 报错
  meta_df$Group <- as.factor(meta_df$Group)
  log4r::info(logger, paste0("Group Levels: ", paste(levels(meta_df$Group), collapse = ", ")))
  
  # --- Step 2: 处理 TPM ---
  log4r::info(logger, "Processing TPM Data...")
  tpm_data <- read_matrix(opt$tpm)
  
  common_tpm <- intersect(colnames(tpm_data), meta_df$Sample)
  if(length(common_tpm) == 0) stop("No common samples between TPM and Metadata!")
  tpm_data <- tpm_data[, common_tpm]
  meta_tpm <- meta_df[meta_df$Sample %in% common_tpm, ]
  
  p1 <- plot_expression_distribution(tpm_data, meta_tpm, type_name = "TPM")
  
  # --- Step 3: 处理 FPKM ---
  log4r::info(logger, "Processing FPKM Data...")
  fpkm_data <- read_matrix(opt$fpkm)
  
  common_fpkm <- intersect(colnames(fpkm_data), meta_df$Sample)
  if(length(common_fpkm) == 0) stop("No common samples between FPKM and Metadata!")
  fpkm_data <- fpkm_data[, common_fpkm]
  meta_fpkm <- meta_df[meta_df$Sample %in% common_fpkm, ]
  
  p2 <- plot_expression_distribution(fpkm_data, meta_fpkm, type_name = "FPKM")
  
  # --- Step 4: 拼图与保存 ---
  log4r::info(logger, "Combining plots and saving...")
  
  final_plot <- p1 + p2 + plot_layout(nrow = 2)
  
  out_png <- file.path(opt$outdir, 'Gene_Expression_Distribution.png')
  out_pdf <- file.path(opt$outdir, 'Gene_Expression_Distribution.pdf')
  
  ggsave(out_png, width = opt$width, height = opt$height, dpi = 300, plot = final_plot)
  ggsave(out_pdf, width = opt$width, height = opt$height, plot = final_plot)
  
  log4r::info(logger, paste0("Saved PNG: ", out_png))
  log4r::info(logger, paste0("Saved PDF: ", out_pdf))
  log4r::info(logger, "Done! 绘图任务完成 (๑•̀ㅂ•́)و✧")

}, error = function(e){
  log4r::error(logger, paste0("Pipeline Failed: ", e$message))
  quit(save = "no", status = 1)
})