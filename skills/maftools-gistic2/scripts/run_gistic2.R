#!/usr/bin/env Rscript

suppressPackageStartupMessages({ library(optparse); library(data.table); library(dplyr); library(tidyr) })

args <- parse_args(OptionParser(option_list = list(
  make_option("--input", type = "character", help = "GISTIC2 all_lesions, amp_genes, or del_genes table."),
  make_option("--output", type = "character", help = "Output directory."),
  make_option("--mode", type = "character", default = "gene-list", help = "gene-list or sample-summary."),
  make_option("--clinical", type = "character", default = NULL, help = "Clinical mapping table for sample-summary mode."),
  make_option("--prefix", type = "character", default = "AP", help = "Region prefix for gene-list mode."),
  make_option("--call_suffix", type = "character", default = ".call", help = "Suffix to remove from lesion sample columns.")
)))

if (is.null(args$input) || is.null(args$output)) stop("--input and --output are required.")
if (!file.exists(args$input)) stop("Input file does not exist.")
if (!args$mode %in% c("gene-list", "sample-summary")) stop("--mode must be gene-list or sample-summary.")
dir.create(args$output, recursive = TRUE, showWarnings = FALSE)

if (args$mode == "gene-list") {
  raw_data <- data.table::fread(args$input, header = TRUE, sep = "\t", data.table = FALSE, check.names = FALSE)
  transposed <- as.data.frame(t(raw_data), stringsAsFactors = FALSE)
  transposed$region <- rownames(transposed)
  value_columns <- setdiff(names(transposed), "region")
  result <- transposed %>%
    filter(region != "q value") %>%
    mutate(merged_genes = apply(select(., all_of(value_columns)), 1, function(values) paste(values[!is.na(values) & values != ""], collapse = ","))) %>%
    transmute(region_id = paste0(args$prefix, ":", sub("^X", "", region)), merged_genes = merged_genes, gene_count = ifelse(merged_genes == "", 0L, lengths(strsplit(merged_genes, ",", fixed = TRUE)))) %>%
    arrange(desc(gene_count))
  output_file <- file.path(args$output, "gistic_region_genes.tsv")
} else {
  if (is.null(args$clinical) || !file.exists(args$clinical)) stop("--clinical is required and must exist for sample-summary mode.")
  lesions <- data.table::fread(args$input, data.table = FALSE, check.names = FALSE)
  clinical <- data.table::fread(args$clinical, data.table = FALSE, check.names = FALSE)
  if (!all(c("Tumor_Sample_Barcode", "ID") %in% names(clinical))) stop("Clinical table must contain Tumor_Sample_Barcode and ID.")
  names(lesions) <- sub(paste0("\\", args$call_suffix, "$"), "", names(lesions))
  mapping <- setNames(clinical$Tumor_Sample_Barcode, clinical$ID)
  sample_matches <- match(names(lesions), names(mapping))
  names(lesions)[!is.na(sample_matches)] <- unname(mapping[sample_matches[!is.na(sample_matches)]])
  id_column <- if ("Unique Name" %in% names(lesions)) "Unique Name" else if ("Unique_Name" %in% names(lesions)) "Unique_Name" else stop("Lesion table must contain Unique Name or Unique_Name.")
  metadata <- c(id_column, "Descriptor", "Wide Peak Limits", "Peak Limits", "Region Limits", "q values", "Residual q values after removing segments shared with higher peaks", "Broad or Focal", "Amplitude Threshold")
  lesion_values <- lesions %>%
    mutate(region_id = sub("^((Amplification Peak)|(Deletion Peak))", "", .data[[id_column]])) %>%
    select(-any_of(metadata)) %>%
    select(region_id, everything())
  result <- lesion_values %>%
    pivot_longer(cols = -region_id, names_to = "sample", values_to = "value") %>%
    filter(suppressWarnings(as.numeric(value)) > 0) %>%
    group_by(region_id) %>%
    summarise(sample_count = n(), sample_list = paste(sample, collapse = ";"), .groups = "drop") %>%
    arrange(desc(sample_count))
  output_file <- file.path(args$output, "gistic_peak_samples.tsv")
}

write.table(result, output_file, sep = "\t", row.names = FALSE, quote = FALSE)
jsonlite::write_json(list(status = "success", mode = args$mode, rows = nrow(result), artifacts = list(list(path = basename(output_file), rows = nrow(result)))), file.path(args$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
