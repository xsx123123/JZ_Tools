#!/usr/bin/env Rscript

# ==============================================================================
# Universal GFF/GTF to Table Converter
# Author: Jian Zhang's AI Partner (Hajimi)
# Date: 2026-01-03
# Description: Uses rtracklayer to parse ANY standard GFF/GTF file into a flat TSV.
# ==============================================================================

suppressPackageStartupMessages({
  library(optparse)
  library(rtracklayer) # BiocManager::install("rtracklayer")
  library(tidyverse)
})

# 1. 定义命令行参数
option_list <- list(
  make_option(c("-i", "--input"), type = "character", default = NULL, 
              help = "Input GFF or GTF file path", metavar = "input.gff"),
  make_option(c("-o", "--output"), type = "character", default = "gff_output.tsv", 
              help = "Output TSV file name [default: %default]", metavar = "output.tsv"),
  make_option(c("-t", "--type"), type = "character", default = "gene", 
              help = "Feature type to filter (e.g., 'gene', 'mRNA', 'exon'). Use 'all' to keep everything. [default: %default]", metavar = "type"),
  make_option(c("-s", "--select_cols"), type = "character", default = NULL, 
              help = "[Optional] Comma-separated list of columns to keep (e.g., 'ID,Name,biotype'). If not specified, keeps all useful columns.", metavar = "cols")
)

opt_parser <- OptionParser(option_list = option_list)
opt <- parse_args(opt_parser)

# 检查输入
if (is.null(opt$input)){
  print_help(opt_parser)
  stop("❌ 错误: 必须提供输入文件 (-i)", call. = FALSE)
}

# 2. 读取文件 (最强步骤)
cat(paste0("➡️  正在读取文件: ", opt$input, " ... (这可能需要几秒钟)\n"))

tryCatch({
  # rtracklayer 能够自动识别 GFF3 或 GTF 格式
  gff_data <- import(opt$input)
  
  # 转为 Data Frame
  df <- as.data.frame(gff_data)
  
  cat(paste0("ℹ️  原始文件包含 ", nrow(df), " 行记录。\n"))
  
  # 3. 过滤 Feature Type
  if(opt$type != "all"){
    if("type" %in% colnames(df)){
      df <- df %>% filter(type == opt$type)
      cat(paste0("ℹ️  过滤 type == '", opt$type, "' 后，剩余 ", nrow(df), " 行。\n"))
    } else {
      warning("⚠️  警告: 文件中没有 'type' 列，跳过过滤步骤。")
    }
  }
  
  # 4. 处理列表列 (关键步骤！)
  # rtracklayer 解析出的某些属性可能是 list (例如 Tag 有多个值)，无法直接写入 CSV
  # 我们需要把 list 转换成字符串 (用逗号连接)
  cat("➡️  正在清洗数据格式...\n")
  df <- df %>% 
    mutate(across(where(is.list), ~sapply(., paste, collapse = ",")))
  
  # 5. 选择列 (Smart Select)
  if(!is.null(opt$select_cols)){
    # 如果用户指定了列
    keep_cols <- unlist(strsplit(opt$select_cols, ","))
    # 检查列是否存在
    valid_cols <- intersect(keep_cols, colnames(df))
    missing_cols <- setdiff(keep_cols, colnames(df))
    
    if(length(missing_cols) > 0){
      cat(paste0("⚠️  警告: 以下指定列在文件中不存在: ", paste(missing_cols, collapse=", "), "\n"))
    }
    
    df <- df %>% select(any_of(valid_cols))
    
  } else {
    # 如果没指定，我们做一个智能筛选，去掉 width, score, phase 这种通常不需要的列
    # 但保留 ID, Name, gene_id, gene_name 等关键注释信息
    unwanted_cols <- c("width", "score", "phase", "source")
    df <- df %>% select(-any_of(unwanted_cols))
    
    # 将染色体列名从 seqnames 改为 chr (个人习惯，可改)
    if("seqnames" %in% colnames(df)) df <- df %>% rename(chr = seqnames)
  }
  
  # 6. 最后的重命名优化 (为了你的 DESeq2 流程)
  # 尝试把 gene_id 或 ID 统一命名为 ENSEMBL (如果不冲突的话)
  if("gene_id" %in% colnames(df) && !"ENSEMBL" %in% colnames(df)){
    df <- df %>% rename(ENSEMBL = gene_id)
  } else if ("ID" %in% colnames(df) && !"ENSEMBL" %in% colnames(df)) {
    df <- df %>% rename(ENSEMBL = ID)
  }
  
  # 7. 保存
  write.table(df, opt$output, sep = "\t", quote = FALSE, row.names = FALSE)
  
  cat(paste0("✅ 成功! 文件已保存至: ", opt$output, "\n"))
  cat(paste0("   包含列: ", paste(head(colnames(df), 5), collapse=", "), " ...\n"))
  
}, error = function(e){
  cat(paste0("🧨 严重错误: ", e$message, "\n"))
})