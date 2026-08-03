#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(jsonlite)
  library(ggplot2)
  library(ggrepel)
})

DrawVolcano_optimized <- function(deg_result, pvalCutoff, LFCCutoff, EXP_NAEE = "Volcano", label_n_top = 15, label_size = 2) {
  needed <- c("Symbol", "log2FoldChange", "pvalue", "padj")
  if (!all(needed %in% names(deg_result))) stop("Input must contain Symbol, log2FoldChange, pvalue, and padj columns.")
  data <- deg_result[stats::complete.cases(deg_result[, needed]), needed]
  if (!nrow(data)) stop("No complete rows remain after filtering required columns.")
  data$pvalue[data$pvalue <= 0] <- .Machine$double.xmin
  positive_padj <- data$padj[data$padj > 0]
  data$padj[data$padj <= 0] <- if (length(positive_padj)) min(positive_padj) * 0.1 else .Machine$double.xmin
  data$status <- "Non-significant"
  data$status[data$padj < pvalCutoff & data$log2FoldChange >= LFCCutoff] <- "Up-regulated"
  data$status[data$padj < pvalCutoff & data$log2FoldChange <= -LFCCutoff] <- "Down-regulated"
  data$neg_log10_padj <- -log10(data$padj)
  selected <- do.call(rbind, lapply(c("Up-regulated", "Down-regulated"), function(group) {
    subset <- data[data$status == group, , drop = FALSE]
    utils::head(subset[order(subset$padj), , drop = FALSE], label_n_top)
  }))
  colors <- c("Up-regulated" = "#ff3b30", "Down-regulated" = "#56B4E9", "Non-significant" = "#d3d3d3")
  max_lfc <- max(abs(data$log2FoldChange), LFCCutoff, na.rm = TRUE)
  plot <- ggplot(data, aes(log2FoldChange, neg_log10_padj, color = status)) +
    geom_point(size = 0.5, alpha = 0.35) +
    scale_color_manual(values = colors) +
    geom_vline(xintercept = c(-LFCCutoff, LFCCutoff), linetype = "dashed") +
    geom_hline(yintercept = -log10(pvalCutoff), linetype = "dashed") +
    coord_cartesian(xlim = c(-max_lfc, max_lfc)) + labs(title = EXP_NAEE, x = "log2 fold change", y = "-log10 adjusted p-value", color = NULL) +
    theme_bw()
  if (!is.null(selected) && nrow(selected)) plot <- plot + geom_text_repel(data = selected, aes(label = Symbol), size = label_size, max.overlaps = Inf)
  list(plot = plot, data = data)
}

option_list <- list(
  make_option("--input", type = "character"), make_option("--output", type = "character"),
  make_option("--pval-cutoff", type = "double", default = 0.05), make_option("--lfc-cutoff", type = "double", default = 1),
  make_option("--title", type = "character", default = "Volcano"), make_option("--label-n-top", type = "integer", default = 15),
  make_option("--label-size", type = "double", default = 2)
)
options <- parse_args(OptionParser(option_list = option_list))
if (is.null(options$input) || is.null(options$output)) stop("--input and --output are required.")
if (!file.exists(options$input)) stop("Input file does not exist.")
if (options$pval_cutoff <= 0 || options$pval_cutoff >= 1 || options$lfc_cutoff < 0 || options$label_n_top < 0) stop("Invalid plotting cutoff.")
dir.create(options$output, recursive = TRUE, showWarnings = FALSE)
separator <- if (grepl("\\.tsv$|\\.txt$", options$input, ignore.case = TRUE)) "\t" else ","
input <- utils::read.table(options$input, header = TRUE, sep = separator, check.names = FALSE, stringsAsFactors = FALSE, quote = "\"")
result <- DrawVolcano_optimized(input, options$pval_cutoff, options$lfc_cutoff, options$title, options$label_n_top, options$label_size)
png_path <- file.path(options$output, "volcano.png")
pdf_path <- file.path(options$output, "volcano.pdf")
ggsave(png_path, result$plot, width = 8, height = 6, dpi = 300)
ggsave(pdf_path, result$plot, width = 8, height = 6)
write_json(list(
  tool = "volcano_plot", version = "1.0.0", status = "success",
  outputs = list(list(path = "volcano.png", type = "figure"), list(path = "volcano.pdf", type = "figure")),
  stats = list(n_rows = nrow(result$data), n_up = sum(result$data$status == "Up-regulated"), n_down = sum(result$data$status == "Down-regulated"), n_nonsignificant = sum(result$data$status == "Non-significant")), warnings = list()
), file.path(options$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
