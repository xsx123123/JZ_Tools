#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(jsonlite)
  library(Seurat)
  library(infercnv)
  library(AnnoProbe)
})

split_groups <- function(value) {
  groups <- trimws(strsplit(value, ",", fixed = TRUE)[[1]])
  groups[nzchar(groups)]
}

run_infercnv_seurat <- function(seurat_obj, group.by, epi_groups, ref_groups, assay = "RNA", layer = "counts", gene_symbol_type = "SYMBOL", species = "human", baseline = 1, event_threshold = 0.1, cutoff = 0.1, out_dir, denoise = TRUE, HMM = TRUE, analysis_mode = "subclusters", cluster_by_groups = FALSE, hclust_method = "ward.D2", num_threads = 8) {
  if (!group.by %in% colnames(seurat_obj@meta.data)) stop("group-col is not found in seurat_obj@meta.data.")
  all_groups <- unique(as.character(seurat_obj@meta.data[[group.by]]))
  if (!all(epi_groups %in% all_groups)) stop("Some epi-groups are not present in the group-col column.")
  if (!all(ref_groups %in% all_groups)) stop("Some ref-groups are not present in the group-col column.")
  if (length(intersect(epi_groups, ref_groups))) stop("epi-groups and ref-groups must not overlap.")
  keep_cells <- rownames(seurat_obj@meta.data)[seurat_obj@meta.data[[group.by]] %in% c(epi_groups, ref_groups)]
  if (!length(keep_cells)) stop("No cells remain after group filtering.")
  seu_sub <- subset(seurat_obj, cells = keep_cells)
  expr_mat <- as.matrix(Seurat::GetAssayData(seu_sub, assay = assay, layer = layer))
  annotation <- data.frame(cell = colnames(seu_sub), group = as.character(seu_sub@meta.data[[group.by]]), stringsAsFactors = FALSE)
  gene_info <- AnnoProbe::annoGene(rownames(expr_mat), ID_type = gene_symbol_type, species = species)
  if (ncol(gene_info) < 6L) stop("AnnoProbe gene annotation has fewer than six required fields.")
  chromosome_max <- if (species == "mouse") 19 else 22
  target_chr <- paste0("chr", c(seq_len(chromosome_max), "X", "Y"))
  gene_info <- gene_info[gene_info[[4]] %in% target_chr, , drop = FALSE]
  gene_info <- gene_info[!duplicated(gene_info[[1]]), , drop = FALSE]
  gene_order <- data.frame(gene = gene_info[[1]], chr = gene_info[[4]], start = gene_info[[5]], stop = gene_info[[6]], stringsAsFactors = FALSE)
  gene_order$chr <- factor(gene_order$chr, levels = target_chr)
  gene_order <- gene_order[order(gene_order$chr, gene_order$start), , drop = FALSE]
  common_genes <- intersect(rownames(expr_mat), gene_order$gene)
  if (!length(common_genes)) stop("No expression genes overlap the selected AnnoProbe annotation.")
  gene_order <- gene_order[match(common_genes, gene_order$gene), , drop = FALSE]
  expr_mat <- expr_mat[gene_order$gene, , drop = FALSE]
  infercnv_obj <- infercnv::CreateInfercnvObject(raw_counts_matrix = expr_mat, annotations_file = annotation, gene_order_file = gene_order, ref_group_names = ref_groups, chr_exclude = "chrM")
  infercnv_obj <- infercnv::run(infercnv_obj, cutoff = cutoff, out_dir = out_dir, cluster_by_groups = cluster_by_groups, hclust_method = hclust_method, denoise = denoise, HMM = HMM, analysis_mode = analysis_mode, num_threads = num_threads)
  cnv_mat <- infercnv_obj@expr.data
  cnv_df <- data.frame(cell = colnames(cnv_mat), cnv_burden = colMeans(abs(cnv_mat - baseline)), cnv_events = colMeans(abs(cnv_mat - baseline) > event_threshold), stringsAsFactors = FALSE)
  seurat_obj$cnv_burden <- cnv_df$cnv_burden[match(colnames(seurat_obj), cnv_df$cell)]
  seurat_obj$cnv_events <- cnv_df$cnv_events[match(colnames(seurat_obj), cnv_df$cell)]
  summary_input <- data.frame(group = as.character(seurat_obj@meta.data[[group.by]]), cnv_burden = seurat_obj$cnv_burden, cnv_events = seurat_obj$cnv_events)
  summary_input <- summary_input[!is.na(summary_input$cnv_burden), , drop = FALSE]
  group_summary <- aggregate(summary_input[c("cnv_burden", "cnv_events")], by = list(group = summary_input$group), FUN = mean)
  names(group_summary) <- c(group.by, "mean_cnv_burden", "mean_cnv_events")
  list(seurat_obj = seurat_obj, cnv_df = cnv_df, group_summary = group_summary, n_cells = ncol(expr_mat), n_genes = nrow(expr_mat))
}

option_list <- list(
  make_option("--input", type = "character"), make_option("--output", type = "character"),
  make_option("--group-col", type = "character"), make_option("--epi-groups", type = "character"), make_option("--ref-groups", type = "character"),
  make_option("--assay", type = "character", default = "RNA"), make_option("--layer", type = "character", default = "counts"),
  make_option("--gene-symbol-type", type = "character", default = "SYMBOL"), make_option("--species", type = "character", default = "human"),
  make_option("--cutoff", type = "double", default = 0.1), make_option("--threads", type = "integer", default = 8),
  make_option("--no-hmm", action = "store_true", default = FALSE), make_option("--no-denoise", action = "store_true", default = FALSE)
)
options <- parse_args(OptionParser(option_list = option_list))
required <- c("input", "output", "group_col", "epi_groups", "ref_groups")
if (any(vapply(required, function(name) is.null(options[[name]]) || !nzchar(options[[name]]), logical(1)))) stop("--input, --output, --group-col, --epi-groups, and --ref-groups are required.")
if (!file.exists(options$input)) stop("Input RDS does not exist.")
if (!options$species %in% c("human", "mouse") || options$cutoff < 0 || options$threads < 1L) stop("Invalid species, cutoff, or thread count.")
dir.create(options$output, recursive = TRUE, showWarnings = FALSE)
input_object <- readRDS(options$input)
result <- run_infercnv_seurat(input_object, options$group_col, split_groups(options$epi_groups), split_groups(options$ref_groups), options$assay, options$layer, options$gene_symbol_type, options$species, cutoff = options$cutoff, out_dir = file.path(options$output, "infercnv"), denoise = !options$no_denoise, HMM = !options$no_hmm, num_threads = options$threads)
utils::write.csv(result$cnv_df, file.path(options$output, "cnv_by_cell.csv"), row.names = FALSE)
utils::write.csv(result$group_summary, file.path(options$output, "cnv_by_group.csv"), row.names = FALSE)
saveRDS(result$seurat_obj, file.path(options$output, "seurat_with_cnv.rds"))
write_json(list(
  tool = "infercnv_run", version = "1.0.0", status = "success",
  outputs = list(list(path = "infercnv", type = "directory"), list(path = "cnv_by_cell.csv", type = "table"), list(path = "cnv_by_group.csv", type = "table"), list(path = "seurat_with_cnv.rds", type = "data")),
  stats = list(n_input_cells = ncol(input_object), n_infercnv_cells = result$n_cells, n_genes = result$n_genes, n_groups = nrow(result$group_summary)), warnings = list()
), file.path(options$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
