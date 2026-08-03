#!/usr/bin/env Rscript

suppressPackageStartupMessages(library(optparse))

args <- parse_args(OptionParser(option_list = list(
  make_option("--input", type = "character", help = "NUCmer .delta alignment file."),
  make_option("--output", type = "character", help = "Output directory."),
  make_option("--min_length", type = "integer", default = 10000, help = "Minimum aligned segment length."),
  make_option("--flanks", type = "integer", default = 10000, help = "Query-coordinate flank size."),
  make_option("--alpha", type = "double", default = 0.3, help = "Point transparency."),
  make_option("--size", type = "double", default = 0.3, help = "Point size."),
  make_option("--shape", type = "integer", default = 0, help = "ggplot point shape."),
  make_option("--format", type = "character", default = "pdf", help = "pdf or png."),
  make_option("--width", type = "double", default = 10, help = "Plot width in inches."),
  make_option("--height", type = "double", default = 10, help = "Plot height in inches.")
)))

if (is.null(args$input) || is.null(args$output)) stop("--input and --output are required.")
if (!file.exists(args$input)) stop("Input delta file does not exist.")
if (!args$format %in% c("pdf", "png")) stop("--format must be pdf or png.")

script_arg <- commandArgs(trailingOnly = FALSE)
script_file <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)][1])
source(file.path(dirname(normalizePath(script_file)), "plot_nucmer_dotplot.r"))
dir.create(args$output, recursive = TRUE, showWarnings = FALSE)

plot <- plot_nucmer_dotplot(
  deltafile_path = args$input,
  minl_filter = args$min_length,
  flanks_size = args$flanks,
  alpha = args$alpha,
  size = args$size,
  shape = args$shape
)
plot_path <- file.path(args$output, paste0("nucmer_dotplot.", args$format))
ggplot2::ggsave(plot_path, plot = plot, width = args$width, height = args$height, dpi = ifelse(args$format == "png", 300, NA))

summary <- list(
  status = "success",
  input = normalizePath(args$input),
  parameters = list(min_length = args$min_length, flanks = args$flanks),
  artifacts = list(list(path = basename(plot_path), bytes = file.info(plot_path)$size))
)
jsonlite::write_json(summary, file.path(args$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
