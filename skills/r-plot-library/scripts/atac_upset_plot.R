#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(jsonlite)
  library(ggplot2)
  library(ggupset)
  library(dplyr)
})

draw_atac_upset <- function(data, fill_color = "#3C5488FF", upset_top_n = 20, upset_order_by = "freq", sample_name = "sample") {
  if (!all(c("geneId", "annotation") %in% names(data))) stop("Input must contain geneId and annotation columns.")
  if (upset_top_n < 1L || !upset_order_by %in% c("freq", "degree")) stop("--top-n must be positive and --order-by must be freq or degree.")
  clean <- data %>% filter(!is.na(geneId), !is.na(annotation), geneId != "", annotation != "") %>% distinct(geneId, annotation)
  if (!nrow(clean)) stop("No non-empty geneId/annotation pairs remain.")
  top_annotations <- clean %>% count(annotation, sort = TRUE) %>% slice_head(n = upset_top_n) %>% pull(annotation)
  memberships <- clean %>% filter(annotation %in% top_annotations) %>% group_by(geneId) %>% summarise(annotation = list(sort(unique(annotation))), .groups = "drop")
  plot <- ggplot(memberships, aes(x = annotation)) + geom_bar(fill = fill_color) + scale_x_upset(order_by = upset_order_by) +
    labs(title = paste0(sample_name, " ATAC annotation overlap"), x = "Annotation combinations", y = "Genes") + theme_minimal()
  list(plot = plot, memberships = memberships, n_annotations = length(top_annotations))
}

option_list <- list(
  make_option("--input", type = "character"), make_option("--output", type = "character"),
  make_option("--sample-name", type = "character", default = "sample"), make_option("--top-n", type = "integer", default = 20),
  make_option("--order-by", type = "character", default = "freq")
)
options <- parse_args(OptionParser(option_list = option_list))
if (is.null(options$input) || is.null(options$output)) stop("--input and --output are required.")
if (!file.exists(options$input)) stop("Input file does not exist.")
dir.create(options$output, recursive = TRUE, showWarnings = FALSE)
separator <- if (grepl("\\.tsv$|\\.txt$", options$input, ignore.case = TRUE)) "\t" else ","
input <- utils::read.table(options$input, header = TRUE, sep = separator, check.names = FALSE, stringsAsFactors = FALSE, quote = "\"")
result <- draw_atac_upset(input, upset_top_n = options$top_n, upset_order_by = options$order_by, sample_name = options$sample_name)
safe_name <- gsub("[^A-Za-z0-9_.-]", "_", options$sample_name)
png_name <- paste0(safe_name, "_atac_ann.png")
pdf_name <- paste0(safe_name, "_atac_ann.pdf")
ggsave(file.path(options$output, png_name), result$plot, width = 10, height = 6, dpi = 300)
ggsave(file.path(options$output, pdf_name), result$plot, width = 10, height = 6)
write_json(list(
  tool = "atac_upset_plot", version = "1.0.0", status = "success",
  outputs = list(list(path = png_name, type = "figure"), list(path = pdf_name, type = "figure")),
  stats = list(n_input_rows = nrow(input), n_genes = nrow(result$memberships), n_annotations = result$n_annotations), warnings = list()
), file.path(options$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
