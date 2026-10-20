#!/usr/bin/env Rscript

# =============================================================================
# KEGG enrichment pipeline
#
# The functions below remain available when this file is sourced.  When the
# file is executed with Rscript, the command-line entry point at the end reads
# a DEG table and runs separate UP/DOWN enrichments, similar to go_enricher.r.
# =============================================================================

suppressPackageStartupMessages({
  library(optparse)
  library(clusterProfiler)
  library(dplyr)
})

# -----------------------------------------------------------------------------
# 读取并预处理 KEGG ID 映射表（只需读一次，可重复使用）
#
# @param id_map_file  两列无表头 TSV：输入基因 ID / KEGG 基因 ID
# @return data.frame，列：gene_id（原始，带版本号）/ ncbi / symbol（剥掉全部版本号）
# -----------------------------------------------------------------------------
load_kegg_id_map <- function(id_map_file) {
  if (!file.exists(id_map_file)) stop("KEGG ID 映射文件不存在: ", id_map_file)
  id_map <- readr::read_table(id_map_file, col_names = FALSE,
                              show_col_types = FALSE, comment = "")
  if (ncol(id_map) != 2) {
    stop("id_map 必须是无表头的两列 TSV: source_gene<TAB>kegg_gene")
  }

  id_map %>%
    setNames(c("gene_id", "ncbi")) %>%
    mutate(
      # 剥掉【全部】版本号后缀：Solyc00g160260.1.1 -> Solyc00g160260
      # （只剥一层会留下 .1，与无版本号的 GeneID 永远匹配不上）
      gene_id = trimws(as.character(gene_id)),
      symbol = gsub("(\\.\\d+)+$", "", gene_id),
      symbol = sub("^[^:]+:", "", symbol),
      ncbi   = sub("^[^:]+:", "", trimws(ncbi))
    ) %>%
    filter(!is.na(symbol), symbol != "", !is.na(ncbi), ncbi != "") %>%
    distinct(symbol, .keep_all = TRUE)
}

# Build an identity mapping for tables that already contain KEGG IDs.  This
# keeps --id_map optional while retaining the same matching path as mapped IDs.
make_identity_map <- function(genes, organism) {
  genes <- trimws(as.character(genes))
  genes <- genes[!is.na(genes) & nzchar(genes)]
  target <- sub(paste0("^", organism, ":"), "", genes)
  target <- sub("(\\.\\d+)+$", "", target)
  data.frame(gene_id = genes, ncbi = target, symbol = target,
             stringsAsFactors = FALSE) %>%
    distinct(symbol, .keep_all = TRUE)
}

# -----------------------------------------------------------------------------
# 单个基因列表的 KEGG 富集
#
# @param genes       字符向量，或含 GeneID 列的 data.frame
# @param kegg_id_map load_kegg_id_map() 的返回值
# @param prefix      输出文件前缀
# @param save_dir    输出目录（不存在会自动创建）
# @param organism    KEGG 物种代码，番茄为 "sly"
# @param padj_cutoff 主表阈值（BH p.adjust），全量表不受其限制
# @param universe    可选：背景基因（你的 NCBI/KEGG ID 向量）。缺省用 KEGG 全基因组注释
# @param minGSSize / maxGSSize  通路大小过滤；maxGSSize=Inf 放行 sly01100/01110 等大通路
# @param top_n       图中展示通路数
# @param make_plot   是否输出 dotplot+barplot 合并图（png/pdf）
# @return list(result, full, sig, total_genes, mapped_genes)
# -----------------------------------------------------------------------------
run_kegg_enrichment <- function(genes,
                                kegg_id_map,
                                prefix,
                                save_dir,
                                organism    = "sly",
                                padj_cutoff = 0.05,
                                universe    = NULL,
                                minGSSize   = 10,
                                maxGSSize   = Inf,
                                top_n       = 10,
                                make_plot   = TRUE) {

  message("正在处理项目: ", prefix)

  # --- 提取并清洗查询基因 ---
  if (is.data.frame(genes)) {
    if (!"GeneID" %in% names(genes)) stop("genes 为 data.frame 时必须包含 GeneID 列")
    genes <- genes$GeneID
  }
  query <- unique(na.omit(as.character(genes)))
  if (!length(query)) {
    warning(prefix, ": 没有基因通过差异筛选，写出空结果。")
    if (!dir.exists(save_dir)) dir.create(save_dir, recursive = TRUE)
    empty <- data.frame(
      ID = "None", Description = "No genes passed DEG thresholds",
      GeneRatio = "0/0", BgRatio = "0/0", pvalue = 1, p.adjust = 1,
      qvalue = 1, geneID = "None", Count = 0,
      Input_Gene_Count = 0, Background_Match_Count = 0,
      stringsAsFactors = FALSE
    )
    write.csv(empty, file.path(save_dir, paste0(prefix, "_enrichments.csv")),
              row.names = FALSE)
    return(list(result = NULL, full = NULL, sig = empty,
                total_genes = 0, mapped_genes = 0))
  }

  # --- ID 转换：查询侧与映射表两侧都剥版本号后匹配 ---
  query_b <- sub("^[^:]+:", "", query)
  query_b <- sub("(\\.\\d+)+$", "", query_b)
  matched <- kegg_id_map$ncbi[match(query_b, kegg_id_map$symbol)]
  n_mapped <- sum(!is.na(matched))
  message("  ID 匹配: ", n_mapped, " / ", length(query),
          " (", round(100 * n_mapped / length(query), 1), "%)")

  genes_kegg <- unique(na.omit(matched))   # 去重 + 去 NA
  if (length(genes_kegg) < 1) {
    warning(prefix, " 没有基因匹配到 KEGG ID，跳过富集。")
    if (!dir.exists(save_dir)) dir.create(save_dir, recursive = TRUE)
    empty <- data.frame(
      ID = "None", Description = "No genes matched KEGG ID mapping",
      GeneRatio = "0/0", BgRatio = "0/0", pvalue = 1, p.adjust = 1,
      qvalue = 1, geneID = "None", Count = 0,
      Input_Gene_Count = length(query), Background_Match_Count = 0,
      stringsAsFactors = FALSE
    )
    write.csv(empty, file.path(save_dir, paste0(prefix, "_enrichments.csv")),
              row.names = FALSE)
    return(list(result = NULL, full = NULL, sig = empty,
                total_genes = length(query), mapped_genes = n_mapped))
  }

  # --- 富集 ---
  # pvalueCutoff/qvalueCutoff 置 1 跑全量：clusterProfiler 的 pvalueCutoff
  # 实际卡 p.adjust，且 NA qvalue 会静默丢行；事后自己筛，避免通路被偷偷滤掉。
  kegg_res <- enrichKEGG(
    gene          = genes_kegg,
    organism      = organism,
    keyType       = "kegg",
    universe      = universe,
    pAdjustMethod = "BH",
    pvalueCutoff  = 1,
    qvalueCutoff  = 1,
    minGSSize     = minGSSize,
    maxGSSize     = maxGSSize
  )

  res_df <- as.data.frame(kegg_res)
  if (!nrow(res_df)) {
    warning(prefix, " 没有任何通路通过 minGSSize/maxGSSize 过滤。")
    if (!dir.exists(save_dir)) dir.create(save_dir, recursive = TRUE)
    empty <- data.frame(
      ID = "None", Description = "No KEGG pathway passed gene-set filters",
      GeneRatio = paste0("0/", length(genes_kegg)),
      BgRatio = paste0("0/", length(genes_kegg)), pvalue = 1,
      p.adjust = 1, qvalue = 1, geneID = "None", Count = 0,
      Input_Gene_Count = length(query), Background_Match_Count = length(genes_kegg),
      stringsAsFactors = FALSE
    )
    write.csv(empty, file.path(save_dir, paste0(prefix, "_enrichments.csv")),
              row.names = FALSE)
    return(list(result = NULL, full = NULL, sig = NULL,
                total_genes = length(query), mapped_genes = n_mapped))
  }

  res_df <- res_df[order(res_df$p.adjust), ]
  res_df$Input_Gene_Count <- length(query)
  res_df$Background_Match_Count <- length(genes_kegg)
  sig_df <- res_df[res_df$p.adjust < padj_cutoff, ]

  if (!nrow(sig_df)) {
    sig_df <- data.frame(
      ID = "None", Description = "No significant KEGG enrichment",
      GeneRatio = paste0("0/", length(genes_kegg)),
      BgRatio = paste0("0/", length(genes_kegg)), pvalue = 1,
      p.adjust = 1, qvalue = 1, geneID = "None", Count = 0,
      Input_Gene_Count = length(query), Background_Match_Count = length(genes_kegg),
      stringsAsFactors = FALSE
    )
  }

  # --- 保存 ---
  if (!dir.exists(save_dir)) dir.create(save_dir, recursive = TRUE)
  write.csv(res_df, file.path(save_dir, paste0(prefix, "_enrichments_full.csv")),
            row.names = FALSE)   # 全量表：所有通路的 p / p.adjust，可自行放宽阈值
  write.csv(sig_df, file.path(save_dir, paste0(prefix, "_enrichments.csv")),
            row.names = FALSE)   # 主表：p.adjust < padj_cutoff

  # --- 作图（只画显著部分） ---
  n_sig <- sum(res_df$p.adjust < padj_cutoff, na.rm = TRUE)
  if (isTRUE(make_plot) && n_sig > 0) {
    plot_packages <- c("enrichplot", "ggplot2", "ggpubr", "patchwork")
    missing_plot_packages <- plot_packages[
      !vapply(plot_packages, requireNamespace, logical(1), quietly = TRUE)
    ]
    if (length(missing_plot_packages)) {
      warning("跳过 KEGG 绘图，缺少 R 包: ",
              paste(missing_plot_packages, collapse = ", "))
    } else {
    sig_res <- kegg_res
    sig_res@result <- sig_res@result[sig_res@result$p.adjust < padj_cutoff, ]

    p1 <- enrichplot::dotplot(sig_res, showCategory = min(top_n, n_sig)) +
      ggplot2::ggtitle(paste0("KEGG Enrichment of (", prefix, ")")) +
      ggpubr::theme_pubclean() +
      ggplot2::theme(legend.position = "right")

    p2 <- enrichplot::barplot(sig_res, showCategory = min(top_n, n_sig)) +
      ggplot2::ggtitle(paste0("KEGG Enrichment of (", prefix, ")")) +
      ggpubr::theme_pubclean() +
      ggplot2::theme(legend.position = "right")

    merge_plot <- p1 + p2 + patchwork::plot_annotation(tag_levels = "a")

    ggplot2::ggsave(file.path(save_dir, paste0(prefix, "_enrichments.png")),
           width = 12, height = 6, dpi = 600, plot = merge_plot)
    ggplot2::ggsave(file.path(save_dir, paste0(prefix, "_enrichments.pdf")),
           width = 12, height = 6, plot = merge_plot)
    }
  }

  message(prefix, " 完成：全量通路 ", nrow(res_df),
          " 条；p.adjust<", padj_cutoff, " 的显著通路 ", n_sig, " 条。")
  list(result = kegg_res, full = res_df, sig = sig_df,
       total_genes = length(query), mapped_genes = n_mapped)
}

# -----------------------------------------------------------------------------
# 批量处理多个基因列表（xlsx 或含 GeneID 列的 csv/tsv）
#
# @param files       命名字符向量：c(文件路径或目录内文件名 = 输出前缀)
# @param data_dir    文件所在目录（files 为纯文件名时使用；缺省当前目录）
# @param ...         其余参数全部传给 run_kegg_enrichment()
# @return list，每个元素是 run_kegg_enrichment() 的返回；并写 ID_mapping_summary.csv
# -----------------------------------------------------------------------------
run_kegg_batch <- function(files,
                           data_dir = ".",
                           save_dir,
                           ...) {
  results <- lapply(names(files), function(f) {
    path <- file.path(data_dir, f)
    if (!file.exists(path)) stop("文件不存在: ", path)
    # xlsx 直接读；其余按分隔符自动识别
    dat <- if (grepl("\\.xlsx$", f, ignore.case = TRUE)) {
      readxl::read_excel(path)
    } else {
      first <- readLines(path, n = 1)
      read.table(path, header = TRUE,
                 sep = if (grepl(",", first)) "," else "\t",
                 quote = '"', comment.char = "", check.names = FALSE,
                 stringsAsFactors = FALSE)
    }
    run_kegg_enrichment(dat, prefix = files[[f]], save_dir = save_dir, ...)
  })
  names(results) <- files

  map_summary <- data.frame(
    group        = names(results),
    total_genes  = vapply(results, function(x) x$total_genes,  numeric(1)),
    mapped_genes = vapply(results, function(x) x$mapped_genes, numeric(1)),
    map_rate     = round(vapply(results,
                                function(x) x$mapped_genes / max(x$total_genes, 1),
                                numeric(1)) * 100, 1)
  )
  print(map_summary)
  if (!dir.exists(save_dir)) dir.create(save_dir, recursive = TRUE)
  write.csv(map_summary, file.path(save_dir, "ID_mapping_summary.csv"),
            row.names = FALSE)
  invisible(results)
}

# -----------------------------------------------------------------------------
# Command-line table mode
# -----------------------------------------------------------------------------

read_kegg_table <- function(table_path) {
  if (!file.exists(table_path)) stop("差异分析表格不存在: ", table_path)
  first_line <- readLines(table_path, n = 1, warn = FALSE)
  if (!length(first_line)) stop("差异分析表格为空: ", table_path)
  read.table(table_path, header = TRUE,
             sep = if (grepl(",", first_line)) "," else "\t",
             quote = '"', comment.char = "", check.names = FALSE,
             colClasses = "character", stringsAsFactors = FALSE)
}

run_kegg_deg_table <- function(table_path,
                               id_map_file = NULL,
                               out_dir = "kegg_results",
                               name = "Enrich",
                               organism = "sly",
                               gene_col = "GeneID",
                               padj_col = "padj",
                               lfc_col = "log2FoldChange",
                               padj_th = 0.05,
                               lfc_th = 1,
                               cutoff = 0.05,
                               min_gs = 10,
                               max_gs = 0,
                               top_n = 10,
                               make_plot = FALSE,
                               gene_regex = NULL) {
  df <- read_kegg_table(table_path)
  required <- c(gene_col, padj_col, lfc_col)
  missing <- setdiff(required, colnames(df))
  if (length(missing)) {
    stop("差异表缺少必要列: ", paste(missing, collapse = ", "))
  }

  ids <- trimws(as.character(df[[gene_col]]))
  if (!is.null(gene_regex)) {
    parts <- strsplit(gene_regex, "/", fixed = TRUE)[[1]]
    pattern <- parts[[1]]
    replacement <- if (length(parts) > 1) parts[[2]] else ""
    ids <- gsub(pattern, replacement, ids)
  }
  padj <- suppressWarnings(as.numeric(df[[padj_col]]))
  lfc <- suppressWarnings(as.numeric(df[[lfc_col]]))
  eligible <- !is.na(padj) & is.finite(padj) & !is.na(lfc) &
    is.finite(lfc) & !is.na(ids) & nzchar(ids)
  if (!any(eligible)) stop("差异表没有可用的基因、padj 和 log2FC 记录")

  ids <- ids[eligible]
  padj <- padj[eligible]
  lfc <- lfc[eligible]
  if (is.null(id_map_file)) {
    id_map <- make_identity_map(ids, organism)
    message("未提供 --id_map，按输入基因已经是 KEGG ID 处理。")
  } else {
    id_map <- load_kegg_id_map(id_map_file)
  }

  max_gs_value <- if (is.null(max_gs) || max_gs <= 0) Inf else max_gs
  up <- unique(ids[padj < padj_th & lfc >= lfc_th])
  down <- unique(ids[padj < padj_th & lfc <= -lfc_th])
  message("差异筛选: padj < ", padj_th, "; |log2FC| >= ", lfc_th,
          "; UP = ", length(up), "; DOWN = ", length(down))

  if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)
  common <- list(
    kegg_id_map = id_map,
    save_dir = out_dir,
    organism = organism,
    padj_cutoff = cutoff,
    universe = unique(id_map$ncbi),
    minGSSize = min_gs,
    maxGSSize = max_gs_value,
    top_n = top_n,
    make_plot = make_plot
  )
  up_result <- do.call(run_kegg_enrichment,
                       c(list(genes = up, prefix = paste0(name, "_UP")), common))
  down_result <- do.call(run_kegg_enrichment,
                         c(list(genes = down, prefix = paste0(name, "_DOWN")), common))
  invisible(list(UP = up_result, DOWN = down_result))
}

command_line_main <- function() {
  option_list <- list(
    make_option(c("-t", "--table"), type = "character",
                help = "差异分析表格（CSV/TSV，自动识别）"),
    make_option(c("-n", "--name"), type = "character", default = "Enrich",
                help = "输出文件前缀 [default: %default]"),
    make_option(c("-d", "--out_dir"), type = "character", default = "kegg_results",
                help = "输出目录 [default: %default]"),
    make_option("--organism", type = "character", default = "sly",
                help = "KEGG 物种代码 [default: %default]"),
    make_option("--id_map", type = "character",
                help = "无表头两列 TSV：输入基因 ID、KEGG 基因 ID"),
    make_option("--gene_col", type = "character", default = "GeneID",
                help = "基因 ID 列名 [default: %default]"),
    make_option("--padj_col", type = "character", default = "padj",
                help = "校正 p 值列名 [default: %default]"),
    make_option("--lfc_col", type = "character", default = "log2FoldChange",
                help = "log2 fold-change 列名 [default: %default]"),
    make_option("--padj_th", type = "double", default = 0.05,
                help = "差异基因 padj 阈值 [default: %default]"),
    make_option("--lfc_th", type = "double", default = 1,
                help = "差异基因 |log2FC| 阈值 [default: %default]"),
    make_option(c("-c", "--cutoff"), type = "double", default = 0.05,
                help = "KEGG 结果 p.adjust 阈值 [default: %default]"),
    make_option("--min_gs", type = "integer", default = 10,
                help = "最小通路基因集大小 [default: %default]"),
    make_option("--max_gs", type = "integer", default = 0,
                help = "最大通路基因集大小；0 表示不限制 [default: %default]"),
    make_option("--top_n", type = "integer", default = 10,
                help = "绘图展示的通路数 [default: %default]"),
    make_option("--plot", action = "store_true", default = FALSE,
                help = "输出显著通路的 PNG/PDF 图") ,
    make_option("--gene_regex", type = "character", default = NULL,
                help = "基因 ID 清洗正则，格式为 pattern/replacement")
  )
  parser <- OptionParser(
    usage = "Rscript kegg_enricher.r --table DEG.csv --name A_vs_B [options]",
    option_list = option_list
  )
  opt <- parse_args(parser)
  if (is.null(opt$table)) {
    print_help(parser)
    stop("必须提供 --table")
  }
  run_kegg_deg_table(
    table_path = opt$table,
    id_map_file = opt$id_map,
    out_dir = opt$out_dir,
    name = opt$name,
    organism = opt$organism,
    gene_col = opt$gene_col,
    padj_col = opt$padj_col,
    lfc_col = opt$lfc_col,
    padj_th = opt$padj_th,
    lfc_th = opt$lfc_th,
    cutoff = opt$cutoff,
    min_gs = opt$min_gs,
    max_gs = opt$max_gs,
    top_n = opt$top_n,
    make_plot = opt$plot,
    gene_regex = opt$gene_regex
  )
}

# Run the CLI only when invoked as an Rscript command.  The functions above
# remain sourceable from another R workflow without parsing command-line args.
if (!interactive() && sys.nframe() == 0) {
  command_line_main()
}

# =============================================================================
# 用法示例
# =============================================================================
# kegg_id <- load_kegg_id_map("/home/zj/analysis/tomato_kegg/ITAG4.1.kegg.id")
#
# # 单个列表（xlsx 或字符向量均可）
# res1 <- run_kegg_enrichment(
#   genes       = readxl::read_excel("/home/zj/analysis/tomato_kegg/KEGG_gene_ID/cch-461.xlsx"),
#   kegg_id_map = kegg_id,
#   prefix      = "cch_461",
#   save_dir    = "/home/zj/analysis/tomato_kegg/KEGG_gene_ID/results"
# )
#
# # 批量
# results <- run_kegg_batch(
#   files = c(
#     "cch-461.xlsx"                    = "cch_461",
#     "COP1 and HY5 dependent -1576.xlsx" = "COP1_and_HY5",
#     "COP1dependent -2143.xlsx"        = "COP1dependent",
#     "hy5-1048.xlsx"                   = "hy5",
#     "HY5 dependent -1671.xlsx"        = "HY5_dependent",
#     "WT-2337.xlsx"                    = "WT"
#   ),
#   data_dir    = "/home/zj/analysis/tomato_kegg/KEGG_gene_ID",
#   save_dir    = "/home/zj/analysis/tomato_kegg/KEGG_gene_ID/results",
#   kegg_id_map = kegg_id
# )
