#!/usr/bin/env Rscript

# ==============================================================================
# Static Heatmap Pipeline (pheatmap) - Robust Version
# Author: Jian Zhang (Integrated by Hajimi)
# Date: 2026-01-03
# Version: 2.1 (Auto-detect sample column & Debug info)
# ==============================================================================

suppressPackageStartupMessages({
  library(optparse)
  library(tidyverse)
  library(pheatmap)
  library(log4r)
  library(crayon)
})

# --- Log 模块 ---
log4r_init <- function(level = "INFO", log_file = NULL){
  require(log4r); require(crayon)
  my_console_layout <- function(level, ...) {
    time_str <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
    if (level == 'INFO') paste0(bold(cyan(time_str, " [", level, " ] ➡️ ")), ..., '\n')
    else if (level == 'WARN') paste0(bold(yellow(time_str, " [", level, " ] ❓ ")), ..., '\n')
    else if (level == 'ERROR') paste0(bold(red(time_str, " [", level, "] 🧨 ")), ..., '\n')
    else if (level == 'FATAL') paste0(bold(bgRed(time_str, " [", level, "] 💣 ")), ..., '\n')
    else paste0(time_str, " [", level, "] ", ..., '\n')
  }
  appenders_list <- list(console_appender(my_console_layout))
  if (!is.null(log_file)) {
    file_layout <- function(level, ...) paste0(format(Sys.time(), "%Y-%m-%d %H:%M:%S"), " [", level, "] ", ..., "\n")
    appenders_list <- c(appenders_list, file_appender(log_file, layout = file_layout))
  }
  return(log4r::logger(threshold = level, appenders = appenders_list))
}

# --- 命令行参数 ---
option_list <- list(
  make_option(c("-i", "--input"), type = "character", help = "Input Expression Matrix (TPM/FPKM)"),
  make_option(c("-m", "--metadata"), type = "character", help = "Metadata CSV"),
  make_option(c("-o", "--outdir"), type = "character", default = "./results_heatmap", help = "Output Directory"),
  make_option(c("--min_exp"), type = "numeric", default = 1, help = "Min Expression Cutoff (Row Mean)"),
  make_option(c("--top_n"), type = "numeric", default = 1000, help = "Number of top variable genes to plot")
)
opt <- parse_args(OptionParser(option_list = option_list))

if(is.null(opt$input) || is.null(opt$metadata)) stop("Missing input files!")
if(!dir.exists(opt$outdir)) dir.create(opt$outdir, recursive = TRUE)
logger <- log4r_init(level = "INFO", log_file = file.path(opt$outdir, "heatmap.log"))

# --- 1. 数据读取 (Robust Matrix) ---
log4r::info(logger, "Reading Matrix Data...")

read_matrix_safe <- function(file_path){
  sep_char <- if(grepl(".csv$", file_path)) "," else "\t"
  # 读取所有，不设 row.names
  raw_data <- read.table(file_path, header = TRUE, sep = sep_char, check.names = FALSE, stringsAsFactors = FALSE, comment.char = "")
  # 第一列作为行名
  gene_ids <- raw_data[, 1]
  if(any(duplicated(gene_ids))) gene_ids <- make.unique(as.character(gene_ids))
  count_mat <- raw_data[, -1]
  rownames(count_mat) <- gene_ids
  return(as.matrix(count_mat))
}

exp_mat <- read_matrix_safe(opt$input)

# --- 2. 数据读取 (Robust Metadata) ---
log4r::info(logger, "Reading Metadata...")

# 先不设 row.names 读取
meta <- if(grepl(".csv$", opt$metadata)) read.csv(opt$metadata, stringsAsFactors = FALSE) else read.table(opt$metadata, header=T, sep="\t", stringsAsFactors = FALSE)

# 标准化列名 (兼容大小写和不同写法)
colnames(meta) <- tolower(colnames(meta)) # 转小写方便匹配
# 寻找 sample 列
if("sample_name" %in% colnames(meta)) {
  sample_col <- "sample_name"
} else if ("sample" %in% colnames(meta)) {
  sample_col <- "sample"
} else if ("name" %in% colnames(meta)) {
  sample_col <- "name"
} else {
  # 如果都没找到，尝试使用第一列
  log4r::warn(logger, "Could not find 'sample_name' or 'sample' column. Using the first column as sample IDs.")
  sample_col <- colnames(meta)[1]
}

# 寻找 group 列
if("group" %in% colnames(meta)) {
  group_col <- "group"
} else {
  log4r::warn(logger, "Could not find 'group' column. Trying to find anything containing 'group'...")
  group_col <- grep("group", colnames(meta), value = T)[1]
  if(is.na(group_col)) stop("Metadata MUST have a 'group' column!")
}

# 重构 Metadata
meta_clean <- data.frame(
  Sample = as.character(meta[[sample_col]]),
  Group = as.character(meta[[group_col]]),
  stringsAsFactors = FALSE
)
rownames(meta_clean) <- meta_clean$Sample

# --- 3. 样本对齐与调试信息 ---
common <- intersect(colnames(exp_mat), rownames(meta_clean))

if(length(common) == 0) {
  log4r::fatal(logger, "No common samples found!")
  
  # === 打印调试信息 ===
  cat(red("\n[DEBUG INFO] Please compare the sample names below:\n"))
  cat(yellow("1. Matrix Column Names (First 5):\n"))
  print(head(colnames(exp_mat), 5))
  cat(yellow("\n2. Metadata Sample IDs (First 5):\n"))
  print(head(rownames(meta_clean), 5))
  cat("\n")
  # ==================
  
  stop("Execution halted due to sample mismatch.")
}

log4r::info(logger, paste0("Matched ", length(common), " samples."))

# 子集取交集
exp_mat <- exp_mat[, common]
meta_final <- meta_clean[common, , drop=FALSE] %>% select(Group)

# --- 4. 过滤与计算 ---
class(exp_mat) <- "numeric"
keep <- rowMeans(exp_mat, na.rm=T) > opt$min_exp
exp_filtered <- exp_mat[keep, ]
log4r::info(logger, paste0("Genes after low-exp filter: ", nrow(exp_filtered)))

# Log2
exp_log <- log2(exp_filtered + 1)

# 去除零方差
gene_vars <- apply(exp_log, 1, var)
non_zero_var <- gene_vars > 0
exp_log <- exp_log[non_zero_var, ]
gene_vars <- gene_vars[non_zero_var]
log4r::info(logger, paste0("Genes after zero-variance filter: ", nrow(exp_log)))

# Top N
n_select <- min(nrow(exp_log), opt$top_n)
top_genes <- names(sort(gene_vars, decreasing = TRUE))[1:n_select]
exp_final <- exp_log[top_genes, ]

# --- 5. 绘图 ---
log4r::info(logger, "Plotting...")

unique_groups <- unique(meta_final$Group)
my_colors <- c("#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7")
if(length(unique_groups) > length(my_colors)){
  final_colors <- colorRampPalette(my_colors)(length(unique_groups))
} else {
  final_colors <- my_colors[1:length(unique_groups)]
}
anno_colors <- list(Group = setNames(final_colors, unique_groups))

out_pdf <- file.path(opt$outdir, "Heatmap_TopVar.pdf")
out_png <- file.path(opt$outdir, "Heatmap_TopVar.png")

tryCatch({
  pheatmap(exp_final,
           scale = "row",
           show_rownames = ifelse(nrow(exp_final) > 100, FALSE, TRUE),
           show_colnames = TRUE,
           annotation_col = meta_final,
           annotation_colors = anno_colors,
           color = colorRampPalette(c("#41b6e6", "white", "#e41749"))(100),
           border_color = NA,
           filename = out_pdf,
           width = 8, height = 10)
  
  pheatmap(exp_final,
           scale = "row",
           show_rownames = ifelse(nrow(exp_final) > 100, FALSE, TRUE),
           annotation_col = meta_final,
           annotation_colors = anno_colors,
           color = colorRampPalette(c("#41b6e6", "white", "#e41749"))(100),
           border_color = NA,
           filename = out_png,
           width = 8, height = 10)
  
  write.csv(exp_final, file.path(opt$outdir, "heatmap_data_processed.csv"))
  log4r::info(logger, "Success! Heatmaps saved.")
  
}, error = function(e){
  log4r::error(logger, paste0("Plotting Error: ", e$message))
})