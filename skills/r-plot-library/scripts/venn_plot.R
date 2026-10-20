#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(jsonlite)
  library(ggVennDiagram)
  library(ggplot2)
  library(patchwork)
})

DrawVennWithLegend <- function(x, title = "Venn Diagram", label = "both", label_size = 3) {
  if (!is.list(x) || length(x) != 4L || is.null(names(x)) || any(names(x) == "")) {
    stop("Input JSON must contain exactly four named arrays.")
  }
  short_names <- c("A", "B", "C", "D")
  colors <- c("#9b5de5", "#f15bb5", "#fee440", "#00bbf9")
  venn <- ggVennDiagram(
    x, label_alpha = 0, set_color = colors, label_size = label_size,
    edge_size = 0.5, label = label, set_size = 4.5, category.names = short_names
  ) +
    scale_fill_gradient(low = "grey90", high = "red", guide = "none") +
    ggtitle(title) + theme(plot.title = element_text(hjust = 0.5))
  legend_data <- data.frame(short = short_names, long = names(x), y = factor(short_names, levels = rev(short_names)))
  legend <- ggplot(legend_data, aes(x = 0.1, y = y)) +
    geom_point(aes(color = short), size = 6) +
    geom_text(aes(x = 0.2, label = paste0(short, ": ", long)), hjust = 0, size = 4) +
    scale_color_manual(values = stats::setNames(colors, short_names)) +
    xlim(0, 1) + theme_void() + theme(legend.position = "none") + labs(title = "Groups") +
    theme(plot.title = element_text(hjust = 0, face = "bold", size = 12))
  venn + legend + plot_layout(widths = c(3, 1.5))
}

option_list <- list(
  make_option("--input", type = "character", help = "Four-set JSON input."),
  make_option("--output", type = "character", help = "Output directory."),
  make_option("--title", type = "character", default = "Venn Diagram"),
  make_option("--label", type = "character", default = "both"),
  make_option("--label-size", type = "double", default = 3)
)
options <- parse_args(OptionParser(option_list = option_list))
if (is.null(options$input) || is.null(options$output)) stop("--input and --output are required.")
if (!file.exists(options$input)) stop("Input file does not exist.")
if (!options$label %in% c("both", "count", "none")) stop("--label must be both, count, or none.")
dir.create(options$output, recursive = TRUE, showWarnings = FALSE)
sets <- fromJSON(options$input, simplifyVector = FALSE)
if (!is.list(sets)) stop("Input JSON must be an object of named arrays.")
sets <- lapply(sets, function(values) unique(as.character(unlist(values, use.names = FALSE))))
plot <- DrawVennWithLegend(sets, options$title, options$label, options$label_size)
png_path <- file.path(options$output, "venn.png")
pdf_path <- file.path(options$output, "venn.pdf")
ggsave(png_path, plot, width = 10, height = 6, dpi = 300)
ggsave(pdf_path, plot, width = 10, height = 6)
write_json(list(
  tool = "venn_plot", version = "1.0.0", status = "success",
  outputs = list(list(path = "venn.png", type = "figure"), list(path = "venn.pdf", type = "figure")),
  stats = list(n_sets = 4, set_sizes = as.list(vapply(sets, length, integer(1)))), warnings = list()
), file.path(options$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
