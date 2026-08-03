#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(optparse)
  library(jsonlite)
  library(WGCNA)
  library(ggplot2)
})

identify_wgcna_hub_genes <- function(datExpr, datTraits, MEs, moduleColors, target_module, target_trait, save_dir, mm_cutoff = 0.8, gs_cutoff = 0.5) {
  if (!target_trait %in% colnames(datTraits)) stop("target-trait is not found in datTraits.")
  if (length(moduleColors) != ncol(datExpr)) stop("moduleColors length must equal the number of datExpr genes.")
  if (!is.numeric(datTraits[[target_trait]])) stop("target-trait must be numeric.")
  n_samples <- nrow(datExpr)
  gs <- as.numeric(stats::cor(datExpr, datTraits[[target_trait]], use = "pairwise.complete.obs"))
  names(gs) <- colnames(datExpr)
  target_me <- paste0("ME", target_module)
  if (!target_me %in% colnames(MEs)) stop("target module is absent from MEs.")
  mm <- as.numeric(stats::cor(datExpr, MEs[[target_me]], use = "pairwise.complete.obs"))
  names(mm) <- colnames(datExpr)
  gs_p <- WGCNA::corPvalueStudent(gs, n_samples)
  mm_p <- WGCNA::corPvalueStudent(mm, n_samples)
  plot_data <- data.frame(Gene = colnames(datExpr), Module = as.character(moduleColors), MM = mm, GS = gs, p_MM = mm_p, p_GS = gs_p, stringsAsFactors = FALSE)
  plot_data <- plot_data[plot_data$Module == target_module, , drop = FALSE]
  if (!nrow(plot_data)) stop("No genes belong to target-module.")
  hub_genes <- plot_data[abs(plot_data$MM) > mm_cutoff & abs(plot_data$GS) > gs_cutoff, , drop = FALSE]
  hub_genes <- hub_genes[order(-abs(hub_genes$MM)), , drop = FALSE]
  correlation <- stats::cor(plot_data$MM, plot_data$GS, use = "pairwise.complete.obs")
  plot <- ggplot(plot_data, aes(MM, GS)) + geom_point(alpha = 0.6, color = target_module) + geom_smooth(method = "lm", color = "red", se = FALSE) +
    labs(title = paste0("MM vs GS: ", target_module, " / ", target_trait), subtitle = sprintf("Correlation = %.2f", correlation), x = paste0("MM in ", target_module), y = paste0("GS for ", target_trait)) + theme_bw()
  csv_name <- paste0("HubGenes_", target_module, "_", target_trait, ".csv")
  png_name <- paste0("Scatter_MM_GS_", target_module, "_", target_trait, ".png")
  utils::write.csv(hub_genes, file.path(save_dir, csv_name), row.names = FALSE)
  ggsave(file.path(save_dir, png_name), plot, width = 7, height = 7, dpi = 300)
  list(hub_genes = hub_genes, module_genes = nrow(plot_data), correlation = correlation, csv_name = csv_name, png_name = png_name)
}

option_list <- list(
  make_option("--input", type = "character"), make_option("--output", type = "character"),
  make_option("--target-module", type = "character"), make_option("--target-trait", type = "character"),
  make_option("--mm-cutoff", type = "double", default = 0.8), make_option("--gs-cutoff", type = "double", default = 0.5)
)
options <- parse_args(OptionParser(option_list = option_list))
required <- c("input", "output", "target_module", "target_trait")
if (any(vapply(required, function(name) is.null(options[[name]]) || !nzchar(options[[name]]), logical(1)))) stop("--input, --output, --target-module, and --target-trait are required.")
if (!file.exists(options$input)) stop("Input RDS does not exist.")
if (options$mm_cutoff < 0 || options$gs_cutoff < 0) stop("Cutoffs must be non-negative.")
objects <- readRDS(options$input)
needed <- c("datExpr", "datTraits", "MEs", "moduleColors")
if (!is.list(objects) || !all(needed %in% names(objects))) stop("Input RDS list must contain datExpr, datTraits, MEs, and moduleColors.")
if (!identical(rownames(objects$datExpr), rownames(objects$datTraits)) || !identical(rownames(objects$datExpr), rownames(objects$MEs))) stop("Sample row names do not match across datExpr, datTraits, and MEs.")
dir.create(options$output, recursive = TRUE, showWarnings = FALSE)
result <- identify_wgcna_hub_genes(as.matrix(objects$datExpr), as.data.frame(objects$datTraits), as.data.frame(objects$MEs), objects$moduleColors, options$target_module, options$target_trait, options$output, options$mm_cutoff, options$gs_cutoff)
write_json(list(
  tool = "identify_wgcna_hub_genes", version = "1.0.0", status = "success",
  outputs = list(list(path = result$csv_name, type = "table"), list(path = result$png_name, type = "figure")),
  stats = list(n_samples = nrow(objects$datExpr), n_module_genes = result$module_genes, n_hub_genes = nrow(result$hub_genes), mm_cutoff = options$mm_cutoff, gs_cutoff = options$gs_cutoff, mm_gs_correlation = result$correlation), warnings = list()
), file.path(options$output, "summary.json"), auto_unbox = TRUE, pretty = TRUE)
