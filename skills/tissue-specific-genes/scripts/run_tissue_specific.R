#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(data.table)
  library(dplyr)
  library(tidyr)
  library(tibble)
})

args <- parse_args(OptionParser(option_list = list(
  make_option("--input", type = "character", help = "featureCounts-like table with Geneid, Length, and count columns."),
  make_option("--output", type = "character", help = "Output directory."),
  make_option("--count_pattern", type = "character", default = "_rep", help = "Regular expression selecting count columns."),
  make_option("--min_total_tpm", type = "double", default = 10, help = "Minimum total TPM retained per gene."),
  make_option("--tau_threshold", type = "double", default = 0.85, help = "Minimum Tau score for extended-Tau candidates."),
  make_option("--min_max_expression", type = "double", default = 10, help = "Minimum maximum tissue TPM for candidates."),
  make_option("--z_threshold", type = "double", default = 2, help = "Extended-Tau interval Z threshold.")
)))

if (is.null(args$input) || is.null(args$output)) stop("--input and --output are required.")
if (!file.exists(args$input)) stop("Input count table does not exist.")
script_arg <- commandArgs(trailingOnly = FALSE)
script_file <- sub("^--file=", "", script_arg[grep("^--file=", script_arg)][1])
script_dir <- dirname(normalizePath(script_file))
source(file.path(script_dir, "calculate_tpm.r"))
source(file.path(script_dir, "calc_tau_manual.R"))
source(file.path(script_dir, "identify_extended_tau.R"))

dir.create(args$output, recursive = TRUE, showWarnings = FALSE)
counts <- data.table::fread(args$input, data.table = FALSE, check.names = FALSE)
if (!all(c("Geneid", "Length") %in% names(counts))) stop("Input must contain Geneid and Length columns.")
count_columns <- names(counts)[grepl(args$count_pattern, names(counts))]
if (length(count_columns) < 2) stop("At least two count columns must match --count_pattern.")
if (any(!is.finite(as.numeric(counts$Length))) || any(as.numeric(counts$Length) <= 0)) stop("Length must contain positive finite values.")

tpm <- calculate_tpm(counts, args$count_pattern)
tpm_values <- as.matrix(tpm[, setdiff(names(tpm), "Geneid"), drop = FALSE])
storage.mode(tpm_values) <- "double"
keep <- rowSums(tpm_values, na.rm = TRUE) >= args$min_total_tpm
tpm <- tpm[keep, , drop = FALSE]
if (nrow(tpm) == 0) stop("No genes remain after TPM filtering.")

tissue_matrix <- tpm %>%
  pivot_longer(cols = -Geneid, names_to = "Sample_ID", values_to = "TPM") %>%
  mutate(Tissue = sub("_rep.*", "", Sample_ID)) %>%
  group_by(Geneid, Tissue) %>%
  summarise(TPM = mean(TPM, na.rm = TRUE), .groups = "drop") %>%
  pivot_wider(names_from = Tissue, values_from = TPM, values_fill = 0) %>%
  column_to_rownames("Geneid")
if (ncol(tissue_matrix) < 2) stop("At least two tissues are required after replicate aggregation.")

tau <- apply(tissue_matrix, 1, calc_tau_manual)
tau_table <- data.frame(Geneid = names(tau), Tau = unname(tau), row.names = NULL)
extended <- identify_extended_tau(
  tissue_matrix,
  tau,
  z_threshold = args$z_threshold,
  tau_threshold = args$tau_threshold,
  min_max_expression = args$min_max_expression
)
if (is.null(extended)) {
  extended <- data.frame(Geneid = character(), Specific_Tissues = character(), Num_Tissues = integer(), Max_Tissue = character(), Max_Exp = numeric(), Tau = numeric())
}
expression_table <- tissue_matrix %>% rownames_to_column("Geneid")
result <- left_join(extended, expression_table, by = "Geneid")

tpm_path <- file.path(args$output, "tpm_by_sample.tsv")
tissue_path <- file.path(args$output, "tpm_by_tissue.tsv")
tau_path <- file.path(args$output, "tau_scores.tsv")
result_path <- file.path(args$output, "extended_tau_genes.tsv")
write.table(tpm, tpm_path, sep = "\t", row.names = FALSE, quote = FALSE)
write.table(expression_table, tissue_path, sep = "\t", row.names = FALSE, quote = FALSE)
write.table(tau_table, tau_path, sep = "\t", row.names = FALSE, quote = FALSE)
write.table(result, result_path, sep = "\t", row.names = FALSE, quote = FALSE)
jsonlite::write_json(list(
  status = "success",
  input_genes = nrow(counts),
  retained_genes = nrow(tpm),
  tissues = ncol(tissue_matrix),
  extended_tau_genes = nrow(result),
  artifacts = list(
    list(path = basename(tpm_path), rows = nrow(tpm)),
    list(path = basename(tissue_path), rows = nrow(expression_table)),
    list(path = basename(tau_path), rows = nrow(tau_table)),
    list(path = basename(result_path), rows = nrow(result))
  )
), file.path(args$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
