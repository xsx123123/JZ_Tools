#!/usr/bin/env Rscript

# ==============================================================================
# GO Enrichment Pipeline (Enhanced)
# 1. 自动处理基因 ID 版本号
# 2. 即使无富集结果也会输出 CSV 报告（包含统计信息）
# ==============================================================================

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

logger <- NULL

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
  
  # 优化读取：处理空行和不规范空格
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
  log_info(paste("背景库总基因数:", length(unique(term2gene$GeneID))))
  return(list(term2gene = term2gene, term2name = term2name))
}

# ==========================================
# 3. 富集分析引擎 (核心修改部分)
# ==========================================

# 简单横向柱状图：按 BH p.adjust 排序，最多展示 top_n 条显著通路。
plot_enrichment_top_terms <- function(results, output_prefix, title,
                                      cutoff = 0.05, top_n = 10) {
  if (length(top_n) != 1 || !is.finite(top_n) || top_n < 1) {
    stop("top_n must be a positive integer")
  }
  padj <- suppressWarnings(as.numeric(results$p.adjust))
  count <- suppressWarnings(as.numeric(results$Count))
  keep <- is.finite(padj) & padj >= 0 & padj < cutoff &
    is.finite(count) & count > 0 & !is.na(results$ID) & results$ID != "None"
  selected <- results[keep, , drop = FALSE]
  selected$p.adjust <- padj[keep]
  selected$Count <- count[keep]
  selected <- head(selected[order(selected$p.adjust, selected$ID), , drop = FALSE],
                   as.integer(top_n))
  plot_title <- paste(strwrap(title, width = 75), collapse = "\n")

  if (nrow(selected)) {
    descriptions <- as.character(selected$Description)
    missing <- is.na(descriptions) | !nzchar(descriptions)
    descriptions[missing] <- as.character(selected$ID[missing])
    wrapped <- lapply(descriptions, strwrap, width = 50)
    labels <- setNames(vapply(wrapped, paste, character(1), collapse = "\n"),
                       seq_len(nrow(selected)))
    selected$Pathway <- factor(seq_len(nrow(selected)),
                               levels = rev(seq_len(nrow(selected))))
    p <- ggplot2::ggplot(selected, ggplot2::aes(x = Count, y = Pathway)) +
      ggplot2::geom_col(width = 0.7, fill = "#3579AD") +
      ggplot2::scale_y_discrete(labels = labels) +
      ggplot2::labs(
        title = plot_title,
        subtitle = paste0("Top ", nrow(selected),
                          " significant terms ranked by adjusted P-value (cutoff ", cutoff, ")"),
        x = "Gene count", y = NULL
      ) +
      ggplot2::theme_minimal(base_size = 11) +
      ggplot2::theme(
        panel.grid.major.y = ggplot2::element_blank(),
        panel.grid.minor = ggplot2::element_blank(),
        plot.title = ggplot2::element_text(face = "bold")
      )
    height <- max(3.5, 1.8 + 0.4 * sum(pmax(1, lengths(wrapped))))
  } else {
    p <- ggplot2::ggplot() +
      ggplot2::annotate("text", x = 0, y = 0,
                       label = paste0("No significant pathways\n(adjusted P < ", cutoff, ")"),
                       size = 5, colour = "#555555") +
      ggplot2::xlim(-1, 1) + ggplot2::ylim(-1, 1) +
      ggplot2::labs(title = plot_title) + ggplot2::theme_void(base_size = 11)
    height <- 3.5
  }

  dir.create(dirname(output_prefix), recursive = TRUE, showWarnings = FALSE)
  ggplot2::ggsave(paste0(output_prefix, ".png"), plot = p, width = 10, height = height, dpi = 300)
  ggplot2::ggsave(paste0(output_prefix, ".pdf"), plot = p, width = 10, height = height)
  invisible(p)
}

run_core_enricher <- function(genes, annot, out_dir, prefix, suffix, cutoff, top_n = 10) {
  filename <- paste0(prefix, "_", suffix, ".csv")
  out_path <- file.path(out_dir, filename)
  
  # 1. 统计输入信息
  input_count <- length(genes)
  
  # 2. 检查与背景库的重叠
  background_genes <- unique(annot$term2gene$GeneID)
  valid_genes <- intersect(genes, background_genes)
  valid_count <- length(valid_genes)
  
  log_info(paste0("正在分析 [", suffix, "] | 输入基因: ", input_count, " | 背景库匹配: ", valid_count))
  
  # 辅助函数：输出空结果文件
  write_empty_result <- function(reason) {
    log_warn(paste0(suffix, ": ", reason, " (已生成空结果文件)"))
    empty_df <- data.frame(
      ID = "None",
      Description = reason,
      GeneRatio = paste0("0/", input_count),
      BgRatio = paste0("0/", length(background_genes)),
      pvalue = 1,
      p.adjust = 1,
      qvalue = 1,
      geneID = "None",
      Count = 0,
      Input_Gene_Count = input_count,       # 添加统计列
      Background_Match_Count = valid_count  # 添加统计列
    )
    write.csv(empty_df, out_path, row.names = FALSE)
    plot_enrichment_top_terms(empty_df, tools::file_path_sans_ext(out_path),
                              paste("GO enrichment:", prefix, suffix), cutoff, top_n)
  }
  
  # 3. 预判：如果没有基因或匹配数为0
  if (valid_count == 0) {
    write_empty_result("No genes matched annotation background")
    return(NULL)
  }
  
  # 4. 运行富集
  tryCatch({
    res <- enricher(valid_genes, 
                    TERM2GENE = annot$term2gene, 
                    TERM2NAME = annot$term2name, 
                    pvalueCutoff = cutoff, 
                    qvalueCutoff = cutoff)
    
    # 5. 检查结果
    if (is.null(res) || nrow(res@result) == 0) {
      write_empty_result("No significant enrichment found (p-value threshold not met)")
    } else {
      res_df <- res@result %>% arrange(p.adjust)
      # 为了格式统一，也在成功的结果里加上统计信息列
      res_df$Input_Gene_Count <- input_count
      res_df$Background_Match_Count <- valid_count
      
      write.csv(res_df, out_path, row.names = FALSE)
      plot_enrichment_top_terms(res_df, tools::file_path_sans_ext(out_path),
                                paste("GO enrichment:", prefix, suffix), cutoff, top_n)
      log_info(paste0(">>> 成功! [", suffix, "] 发现 ", nrow(res_df), " 个通路。已保存至: ", filename))
    }
  }, error = function(e) {
    log_error(paste0(suffix, " 分析过程报错: ", e$message))
    stop(e)
  })
}

# ==========================================
# 4. 子模块：差异表格处理 (增强 ID 处理)
# ==========================================

module_process_table <- function(opt, annot) {
  log_info("=== 进入差异表格模式 (Table Mode) ===")
  
  first_line <- readLines(opt$table, n = 1)
  sep_char <- if (grepl(",", first_line)) "," else "\t"
  df <- read_delim(opt$table, delim = sep_char, show_col_types = FALSE)
  
  # 检查列名
  req_cols <- c(opt$gene_col, opt$padj_col, opt$lfc_col)
  missing_cols <- setdiff(req_cols, colnames(df))
  if (length(missing_cols) > 0) {
    stop(paste("表格缺少必要列:", paste(missing_cols, collapse=", ")))
  }
  
  # 初步过滤 NA
  df_clean <- df %>% filter(!is.na(!!sym(opt$padj_col)) & !is.na(!!sym(opt$lfc_col)))
  
  # --- 智能 ID 清理与匹配 ---
  ref_ids <- unique(annot$term2gene$GeneID)
  current_ids <- as.character(df_clean[[opt$gene_col]])
  current_ids <- str_trim(current_ids) # 去除首尾空格
  
  # 优先尝试用户指定的正则
  if (!is.null(opt$gene_regex)) {
    parts <- strsplit(opt$gene_regex, "/")[[1]]
    pattern <- parts[1]; replacement <- if(length(parts) > 1) parts[2] else ""
    current_ids <- str_replace_all(current_ids, pattern, replacement)
    log_info("已应用用户自定义正则清洗 ID。")
  }
  
  # 自动检测版本号并修复 (.13 后缀)
  # 计算匹配率
  match_rate <- sum(current_ids %in% ref_ids) / length(current_ids)
  log_info(paste0("原始 ID 匹配率: ", round(match_rate * 100, 2), "%"))
  
  if (match_rate < 0.1) { # 如果匹配率低于 10%，尝试去后缀
    log_warn("ID 匹配率过低，尝试移除版本号后缀 (e.g., Gene.1 -> Gene)...")
    trimmed_ids <- sub("\\.[0-9]+$", "", current_ids)
    
    new_match_rate <- sum(trimmed_ids %in% ref_ids) / length(trimmed_ids)
    if (new_match_rate > match_rate) {
      log_info(paste0("移除后缀后匹配率提升至: ", round(new_match_rate * 100, 2), "%，确认应用此修复。"))
      current_ids <- trimmed_ids
    } else {
      log_warn("移除后缀未提升匹配率，保持原样。请检查 ID 格式是否与 assoc 文件一致。")
    }
  }
  
  df_clean[[opt$gene_col]] <- current_ids
  
  # 提取基因
  genes_up <- df_clean %>%
    filter(!!sym(opt$padj_col) < opt$padj_th & !!sym(opt$lfc_col) >= opt$lfc_th) %>%
    pull(!!sym(opt$gene_col)) %>% unique()
  
  genes_down <- df_clean %>%
    filter(!!sym(opt$padj_col) < opt$padj_th & !!sym(opt$lfc_col) <= -opt$lfc_th) %>%
    pull(!!sym(opt$gene_col)) %>% unique()
  
  genes_up <- genes_up[genes_up != ""]
  genes_down <- genes_down[genes_down != ""]
  
  log_info(paste("差异筛选统计 (Padj <", opt$padj_th, "| LFC >", opt$lfc_th, ")"))
  log_info(paste("UP 基因数:", length(genes_up)))
  log_info(paste("DOWN 基因数:", length(genes_down)))
  
  run_core_enricher(genes_up, annot, opt$out_dir, paste0(opt$name, "_GO"), "UP", opt$cutoff, opt$top_n)
  run_core_enricher(genes_down, annot, opt$out_dir, paste0(opt$name, "_GO"), "DOWN", opt$cutoff, opt$top_n)
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
    make_option(c("-c", "--cutoff"), type="numeric", default=0.05, help="富集分析 P-value 阈值"),
    make_option(c("--top_n"), type="integer", default=10, help="图中最多显示的显著通路数 [默认: 10]"),
    make_option(c("-t", "--table"), type="character", help="差异分析表格"),
    make_option(c("--gene_col"), default="GeneID", help="基因列名"),
    make_option(c("--padj_col"), default="padj", help="Padj列名"),
    make_option(c("--lfc_col"), default="log2FoldChange", help="LFC列名"),
    make_option(c("--padj_th"), type="numeric", default=0.05, help="差异基因 Padj 筛选阈值"),
    make_option(c("--lfc_th"), type="numeric", default=1.0, help="差异基因 LFC 绝对值阈值"),
    make_option(c("--gene_regex"), type="character", default=NULL, help="手动正则清理, 格式 'pattern/replacement'")
  )
  
  opt <- parse_args(OptionParser(option_list=option_list))
  
  if (is.null(opt$obo) || is.null(opt$assoc)) {
    print_help(OptionParser(option_list=option_list))
    stop("必须提供 -o 和 -a 参数")
  }
  
  if (!dir.exists(opt$out_dir)) dir.create(opt$out_dir, recursive = TRUE)
  logger <<- log4r::logger(
    threshold = "INFO",
    appenders = log4r::file_appender(file.path(opt$out_dir, paste0(opt$name, "_GO.log")))
  )
  
  annot <- prepare_annotation(opt$obo, opt$assoc)
  
  if (!is.null(opt$table)) {
    module_process_table(opt, annot)
  } else {
    stop("请指定 -t (表格模式)")
  }
  log_info("所有任务执行完毕。")
}

main()
