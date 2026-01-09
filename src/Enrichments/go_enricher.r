#!/usr/bin/env Rscript

# 设置环境
options(stringsAsFactors = FALSE)
options(warn = -1)

# --- 加载依赖库 ---
suppressPackageStartupMessages({
  library(optparse)
  library(log4r)
  library(tidyverse)
  library(ontologyIndex)
  library(clusterProfiler)
})

# ==========================================
# 1. 基础组件 (Logging & Utils)
# ==========================================

logger <- create.logger()
logfile(logger) <- "go_enrichment.log"
level(logger) <- "INFO"

log_info <- function(msg) {
  timestamp <- format(Sys.time(), "%H:%M:%S")
  info(logger, msg)
  message(sprintf("[\033[32mINFO\033[39m %s] %s", timestamp, msg))
}

log_warn <- function(msg) {
  warn(logger, msg)
  message(sprintf("[\033[33mWARN\033[39m] %s", msg))
}

log_error <- function(msg) {
  error(logger, msg)
  message(sprintf("[\033[31mERROR\033[39m] %s", msg))
}

# ==========================================
# 2. 核心数据加载
# ==========================================

prepare_annotation <- function(obo_path, assoc_path) {
  log_info("正在构建背景库 (OBO + Assoc)...")
  
  if (!file.exists(obo_path)) stop("OBO 文件不存在")
  obo_data <- tryCatch({
    ontologyIndex::get_ontology(obo_path, propagate_relationships = "is_a")
  }, error = function(e) stop("OBO解析失败: ", e$message))
  
  term2name <- data.frame(GOID = obo_data$id, Term = obo_data$name)
  
  if (!file.exists(assoc_path)) stop("关联文件不存在")
  lines <- readLines(assoc_path)
  
  raw_df <- tibble(raw_text = lines) %>%
    filter(raw_text != "") %>%
    mutate(
      GeneID = str_extract(raw_text, "^\\S+"),
      GO_Str = str_extract(raw_text, "\\s+.*$")
    ) %>%
    mutate(GO_Str = str_trim(GO_Str)) %>%
    filter(!is.na(GO_Str) & GO_Str != "")
  
  term2gene <- raw_df %>%
    separate_rows(GO_Str, sep = ",") %>%
    mutate(GOID = str_trim(GO_Str)) %>%
    select(GOID, GeneID) %>%
    filter(GOID %in% term2name$GOID)
  
  log_info(paste("背景库构建完成. 有效 Term-Gene 对:", nrow(term2gene)))
  return(list(term2gene = term2gene, term2name = term2name))
}

# ==========================================
# 3. 富集分析引擎
# ==========================================

run_core_enricher <- function(genes, annot, out_dir, prefix, suffix, cutoff) {
  if (length(genes) == 0) {
    log_warn(paste0(suffix, ": 基因列表为空，跳过分析。"))
    return(NULL)
  }
  
  log_info(paste0("正在分析 [", suffix, "] 组，有效基因数: ", length(genes)))
  
  tryCatch({
    res <- enricher(genes, 
                    TERM2GENE = annot$term2gene, 
                    TERM2NAME = annot$term2name, 
                    pvalueCutoff = cutoff, 
                    qvalueCutoff = cutoff)
    
    if (is.null(res) || nrow(res@result) == 0) {
      log_warn(paste0(suffix, ": 未发现显著富集结果。"))
    } else {
      filename <- paste0(prefix, "_", suffix, ".csv")
      out_path <- file.path(out_dir, filename)
      res_df <- res@result %>% arrange(p.adjust)
      write.csv(res_df, out_path, row.names = FALSE)
      log_info(paste0(">>> 成功! [", suffix, "] 发现 ", nrow(res_df), " 个通路。已保存至: ", filename))
    }
  }, error = function(e) {
    log_error(paste0(suffix, " 分析出错: ", e$message))
  })
}

# ==========================================
# 4. 子模块：差异表格处理 (带正则清理)
# ==========================================

module_process_table <- function(opt, annot) {
  log_info("=== 进入差异表格模式 (Table Mode) ===")
  
  first_line <- readLines(opt$table, n = 1)
  sep_char <- if (grepl(",", first_line)) "," else "\t"
  df <- read_delim(opt$table, delim = sep_char, show_col_types = FALSE)
  
  req_cols <- c(opt$gene_col, opt$padj_col, opt$lfc_col)
  if (!all(req_cols %in% colnames(df))) {
    stop(paste("表格缺少必要列。现有列:", paste(colnames(df), collapse=", ")))
  }
  
  df_clean <- df %>% filter(!is.na(!!sym(opt$padj_col)) & !is.na(!!sym(opt$lfc_col)))
  
  # --- 执行基因名清洗 (Regex) ---
  if (!is.null(opt$gene_regex)) {
    parts <- strsplit(opt$gene_regex, "/")[[1]]
    pattern <- parts[1]
    replacement <- if(length(parts) > 1) parts[2] else ""
    
    original_sample <- head(df_clean[[opt$gene_col]], 1)
    df_clean <- df_clean %>%
      mutate(!!sym(opt$gene_col) := str_replace_all(as.character(!!sym(opt$gene_col)), pattern, replacement))
    new_sample <- head(df_clean[[opt$gene_col]], 1)
    
    log_info(paste0("正则清理已应用: '", original_sample, "' -> '", new_sample, "'"))
  }
  
  genes_up <- df_clean %>%
    filter(!!sym(opt$padj_col) < opt$padj_th & !!sym(opt$lfc_col) >= opt$lfc_th) %>%
    pull(!!sym(opt$gene_col)) %>% unique()
  
  genes_down <- df_clean %>%
    filter(!!sym(opt$padj_col) < opt$padj_th & !!sym(opt$lfc_col) <= -opt$lfc_th) %>%
    pull(!!sym(opt$gene_col)) %>% unique()
  
  log_info(paste("筛选统计 | 上调(UP):", length(genes_up), " | 下调(DOWN):", length(genes_down)))
  
  run_core_enricher(genes_up, annot, opt$out_dir, opt$name, "UP", opt$cutoff)
  run_core_enricher(genes_down, annot, opt$out_dir, opt$name, "DOWN", opt$cutoff)
}

# ==========================================
# 5. 主程序入口
# ==========================================

main <- function() {
  option_list <- list(
    make_option(c("-o", "--obo"), type="character", help="GO本体文件 (.obo)"),
    make_option(c("-a", "--assoc"), type="character", help="关联文件"),
    make_option(c("-d", "--out_dir"), type="character", default="go_results", help="输出文件夹"),
    make_option(c("-n", "--name"), type="character", default="Enrich", help="输出文件前缀"),
    make_option(c("-c", "--cutoff"), type="numeric", default=0.05, help="P-value 阈值"),
    make_option(c("-t", "--table"), type="character", help="差异分析表格"),
    make_option(c("--gene_col"), default="GeneID", help="基因列名"),
    make_option(c("--padj_col"), default="padj", help="Padj列名"),
    make_option(c("--lfc_col"), default="log2FoldChange", help="LFC列名"),
    make_option(c("--padj_th"), type="numeric", default=0.05, help="Padj 阈值"),
    make_option(c("--lfc_th"), type="numeric", default=1.0, help="LFC 绝对值阈值"),
    make_option(c("--gene_regex"), type="character", default=NULL, help="清洗基因名的正则, 格式 'pattern/replacement'")
  )
  
  opt <- parse_args(OptionParser(option_list=option_list))
  
  if (is.null(opt$obo) || is.null(opt$assoc)) stop("必须提供 -o 和 -a 参数")
  if (!dir.exists(opt$out_dir)) dir.create(opt$out_dir, recursive = TRUE)
  
  annot <- prepare_annotation(opt$obo, opt$assoc)
  
  if (!is.null(opt$table)) {
    module_process_table(opt, annot)
  } else {
    stop("请指定 -t (表格模式)")
  }
  
  log_info("所有任务执行完毕。")
}

main()