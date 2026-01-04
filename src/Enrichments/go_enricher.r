#!/usr/bin/env Rscript

# 设置环境
options(stringsAsFactors = FALSE)
options(warn = -1) # 抑制非致命警告

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

# 初始化日志
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
# 2. 核心数据加载 (Robust Loading)
# ==========================================

# 强壮的背景库构建函数 (使用正则解析，防崩溃)
prepare_annotation <- function(obo_path, assoc_path) {
  log_info("正在构建背景库...")
  
  # A. 解析 OBO
  if (!file.exists(obo_path)) stop("OBO 文件不存在")
  obo_data <- tryCatch({
    ontologyIndex::get_ontology(obo_path, propagate_relationships = "is_a")
  }, error = function(e) stop("OBO解析失败: ", e$message))
  
  term2name <- data.frame(GOID = obo_data$id, Term = obo_data$name)
  
  # B. 解析关联文件 (Regex 模式)
  if (!file.exists(assoc_path)) stop("关联文件不存在")
  lines <- readLines(assoc_path)
  
  # 提取 GeneID (第一列) 和 GO String (剩余部分)
  raw_df <- tibble(raw_text = lines) %>%
    filter(raw_text != "") %>%
    mutate(
      GeneID = str_extract(raw_text, "^\\S+"), # 匹配行首非空字符
      GO_Str = str_extract(raw_text, "\\s+.*$") # 匹配后续所有内容
    ) %>%
    mutate(GO_Str = str_trim(GO_Str)) %>%
    filter(!is.na(GO_Str) & GO_Str != "")
  
  # C. 拆分与过滤
  term2gene <- raw_df %>%
    separate_rows(GO_Str, sep = ",") %>%
    mutate(GOID = str_trim(GO_Str)) %>%
    select(GOID, GeneID) %>%
    filter(GOID %in% term2name$GOID)
  
  log_info(paste("背景库构建完成. 有效 Term-Gene 对:", nrow(term2gene)))
  return(list(term2gene = term2gene, term2name = term2name))
}

# ==========================================
# 3. 通用富集分析引擎 (Engine)
# ==========================================

run_core_enricher <- function(genes, annot, out_dir, prefix, suffix, cutoff) {
  if (length(genes) == 0) {
    log_warn(paste0(suffix, ": 基因列表为空，跳过分析。"))
    return(NULL)
  }
  
  log_info(paste0("正在分析 [", suffix, "] 组，基因数: ", length(genes)))
  
  tryCatch({
    res <- enricher(genes, 
                    TERM2GENE = annot$term2gene, 
                    TERM2NAME = annot$term2name, 
                    pvalueCutoff = cutoff, 
                    qvalueCutoff = cutoff)
    
    if (is.null(res) || nrow(res@result) == 0) {
      log_warn(paste0(suffix, ": 未发现显著富集结果。"))
    } else {
      # 构建输出文件名： 前缀_后缀.csv (例如 MyResult_UP.csv)
      filename <- paste0(prefix, "_", suffix, ".csv")
      out_path <- file.path(out_dir, filename)
      
      # 排序并保存
      res_df <- res@result %>% arrange(p.adjust)
      write.csv(res_df, out_path, row.names = FALSE)
      
      log_info(paste0(">>> 成功! [", suffix, "] 发现 ", nrow(res_df), " 个通路。已保存至: ", filename))
    }
  }, error = function(e) {
    log_error(paste0(suffix, " 分析出错: ", e$message))
  })
}

# ==========================================
# 4. 子模块：列表分析 (List Mode)
# ==========================================

module_process_list <- function(opt, annot) {
  log_info("=== 进入列表分析模式 (List Mode) ===")
  
  genes <- readLines(opt$gene_list) %>% trimws()
  genes <- genes[genes != ""]
  
  # 调用核心引擎，后缀设为 "Result"
  run_core_enricher(genes, annot, opt$out_dir, opt$name, "All_Genes", opt$cutoff)
}

# ==========================================
# 5. 子模块：表格分析 (Table Mode - Up/Down Split)
# ==========================================

module_process_table <- function(opt, annot) {
  log_info("=== 进入差异表格模式 (Table Mode) ===")
  log_info(paste("读取表格:", opt$table))
  
  # 自动探测分隔符
  first_line <- readLines(opt$table, n = 1)
  sep_char <- if (grepl(",", first_line)) "," else "\t"
  
  df <- read_delim(opt$table, delim = sep_char, show_col_types = FALSE)
  
  # 检查列
  req_cols <- c(opt$gene_col, opt$padj_col, opt$lfc_col)
  if (!all(req_cols %in% colnames(df))) {
    stop(paste("表格缺少必要列。请检查参数。现有列:", paste(colnames(df), collapse=", ")))
  }
  
  # 基础清洗：去除 NA
  df_clean <- df %>%
    filter(!is.na(!!sym(opt$padj_col)) & !is.na(!!sym(opt$lfc_col)))
  
  # --- 提取上调基因 (UP) ---
  genes_up <- df_clean %>%
    filter(!!sym(opt$padj_col) < opt$padj_th) %>%
    filter(!!sym(opt$lfc_col) >= opt$lfc_th) %>% # LFC >= 正阈值
    pull(!!sym(opt$gene_col)) %>% unique()
  
  # --- 提取下调基因 (DOWN) ---
  genes_down <- df_clean %>%
    filter(!!sym(opt$padj_col) < opt$padj_th) %>%
    filter(!!sym(opt$lfc_col) <= -opt$lfc_th) %>% # LFC <= 负阈值
    pull(!!sym(opt$gene_col)) %>% unique()
  
  log_info(paste("筛选统计 | 上调(UP):", length(genes_up), " | 下调(DOWN):", length(genes_down)))
  
  # 分别运行富集
  run_core_enricher(genes_up, annot, opt$out_dir, opt$name, "UP", opt$cutoff)
  run_core_enricher(genes_down, annot, opt$out_dir, opt$name, "DOWN", opt$cutoff)
}

# ==========================================
# 6. 主程序入口
# ==========================================

main <- function() {
  option_list <- list(
    # --- 基础配置 ---
    make_option(c("-o", "--obo"), type="character", help="GO本体文件 (.obo) [必须]"),
    make_option(c("-a", "--assoc"), type="character", help="关联文件 [必须]"),
    make_option(c("-d", "--out_dir"), type="character", default="go_results", help="输出文件夹"),
    make_option(c("-n", "--name"), type="character", default="Enrich", help="输出文件名前缀 (如: MyExperiment)"),
    make_option(c("-c", "--cutoff"), type="numeric", default=0.05, help="富集 P-value 阈值"),
    
    # --- 模式选择 ---
    make_option(c("-g", "--gene_list"), type="character", help="[模式1] 基因列表文件 (.txt)"),
    make_option(c("-t", "--table"), type="character", help="[模式2] 差异分析表格 (.csv/.tsv)"),
    
    # --- 表格模式参数 ---
    make_option(c("--gene_col"), default="GeneID", help="表格基因列名"),
    make_option(c("--padj_col"), default="padj", help="表格Padj列名"),
    make_option(c("--lfc_col"), default="log2FoldChange", help="表格LFC列名"),
    make_option(c("--padj_th"), type="numeric", default=0.05, help="差异基因 Padj 筛选阈值"),
    make_option(c("--lfc_th"), type="numeric", default=1.0, help="差异基因 |LFC| 筛选阈值 (取绝对值)")
  )
  
  opt <- parse_args(OptionParser(option_list=option_list))
  
  if (is.null(opt$obo) || is.null(opt$assoc)) {
    stop("错误: 必须提供 -o 和 -a 参数")
  }
  
  if (!dir.exists(opt$out_dir)) dir.create(opt$out_dir, recursive = TRUE)
  
  # 1. 统一构建背景库
  annot <- prepare_annotation(opt$obo, opt$assoc)
  
  # 2. 模式分发
  if (!is.null(opt$table)) {
    module_process_table(opt, annot)
  } else if (!is.null(opt$gene_list)) {
    module_process_list(opt, annot)
  } else {
    stop("错误: 请指定 -g (列表模式) 或 -t (表格模式)")
  }
  
  log_info("所有任务执行完毕。")
}

main()