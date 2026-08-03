#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(jsonlite)
  library(MutationalPatterns)
  library(NMF)
  library(ggplot2)
})

load_reference_genome <- function(genome_name) {
  package_name <- switch(genome_name,
    hg38 = "BSgenome.Hsapiens.UCSC.hg38",
    hg19 = "BSgenome.Hsapiens.UCSC.hg19",
    stop("--genome must be hg38 or hg19.")
  )
  if (!requireNamespace(package_name, quietly = TRUE)) {
    stop(sprintf("Required reference genome package is unavailable: %s", package_name))
  }
  suppressPackageStartupMessages(library(package_name, character.only = TRUE))
  package_name
}

option_list <- list(
  make_option("--input", type = "character", help = "Directory containing .vcf or .vcf.gz files."),
  make_option("--output", type = "character", help = "Output directory."),
  make_option("--genome", type = "character", default = "hg38"),
  make_option("--rank", type = "integer", default = 4),
  make_option("--nrun", type = "integer", default = 100)
)
options <- parse_args(OptionParser(option_list = option_list))
if (is.null(options$input) || is.null(options$output)) stop("--input and --output are required.")
if (!dir.exists(options$input)) stop("--input must be an existing directory.")
if (options$rank < 2L || options$nrun < 1L) stop("--rank must be at least 2 and --nrun must be positive.")
vcf_files <- sort(list.files(options$input, pattern = "\\.vcf(\\.gz)?$", full.names = TRUE, ignore.case = TRUE))
if (!length(vcf_files)) stop("No VCF files found directly in --input.")
sample_names <- sub("\\.vcf(\\.gz)?$", "", basename(vcf_files), ignore.case = TRUE)
if (anyDuplicated(sample_names)) stop("VCF basenames must be unique after removing extensions.")
if (options$rank > length(sample_names) || options$rank > 96L) stop("--rank cannot exceed the number of samples or 96.")
dir.create(options$output, recursive = TRUE, showWarnings = FALSE)
ref_genome <- load_reference_genome(options$genome)
snv_grl <- read_vcfs_as_granges(vcf_files, sample_names, ref_genome, type = "snv")
snv_mut_mat <- mut_matrix(vcf_list = snv_grl, ref_genome = ref_genome)
if (!ncol(snv_mut_mat) || sum(snv_mut_mat) == 0) stop("No SBS mutations with valid sequence context were found.")
matrix_path <- file.path(options$output, "snv_mutation_matrix.csv")
utils::write.csv(snv_mut_mat, matrix_path)
spectrum_plot <- plot_spectrum(mut_type_occurrences(snv_grl, ref_genome)) + ggtitle("SNV mutation spectrum")
profile_plot <- plot_96_profile(snv_mut_mat) + ggtitle("SBS-96 profiles")
ggsave(file.path(options$output, "mutation_spectrum.png"), spectrum_plot, width = 8, height = 5, dpi = 300)
ggsave(file.path(options$output, "profile_96.png"), profile_plot, width = 16, height = 6, dpi = 300)
nmf_input <- snv_mut_mat + 0.0001
nmf_result <- extract_signatures(nmf_input, rank = options$rank, nrun = options$nrun, single_core = TRUE)
colnames(nmf_result$signatures) <- paste0("Signature_", seq_len(ncol(nmf_result$signatures)))
rownames(nmf_result$contribution) <- colnames(nmf_result$signatures)
signature_path <- file.path(options$output, "denovo_signatures.csv")
contribution_path <- file.path(options$output, "denovo_contribution.csv")
utils::write.csv(nmf_result$signatures, signature_path)
utils::write.csv(nmf_result$contribution, contribution_path)
signature_plot <- plot_96_profile(nmf_result$signatures) + ggtitle("De novo SBS signatures")
contribution_plot <- plot_contribution(nmf_result$contribution, nmf_result$signatures, mode = "relative") + ggtitle("Relative signature contribution")
ggsave(file.path(options$output, "denovo_signatures.png"), signature_plot, width = 16, height = 6, dpi = 300)
ggsave(file.path(options$output, "denovo_contribution.png"), contribution_plot, width = 10, height = 6, dpi = 300)
outputs <- list(
  list(path = "snv_mutation_matrix.csv", type = "table"),
  list(path = "denovo_signatures.csv", type = "table"),
  list(path = "denovo_contribution.csv", type = "table"),
  list(path = "mutation_spectrum.png", type = "figure"),
  list(path = "profile_96.png", type = "figure"),
  list(path = "denovo_signatures.png", type = "figure"),
  list(path = "denovo_contribution.png", type = "figure")
)
write_json(list(
  tool = "mutational_patterns", version = "1.0.0", status = "success", outputs = outputs,
  stats = list(n_samples = length(sample_names), n_sbs_mutations = sum(snv_mut_mat), n_contexts = nrow(snv_mut_mat), rank = options$rank, nrun = options$nrun),
  warnings = list("De novo signatures require stability assessment before biological attribution.")
), file.path(options$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
