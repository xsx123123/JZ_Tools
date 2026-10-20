#' Run inferCNV analysis on a Seurat object
#'
#' This function wraps the infercnv pipeline to perform copy-number variation (CNV)
#' inference from single-cell RNA-seq data stored in a Seurat object.
#'
#' @param seurat_obj A Seurat object containing single-cell expression data.
#' @param group.by Character string specifying the column name in seurat_obj@meta.data
#'   that defines cell groups (e.g., "cell_type" or "seurat_clusters").
#' @param epi_groups Character vector of group names to be analyzed for CNVs
#'   (e.g., tumor or epithelial cells).
#' @param ref_groups Character vector of group names to use as normal reference
#'   (e.g., immune, endothelial, or fibroblast cells).
#' @param assay Character string specifying the assay to use. Default is "RNA".
#' @param layer Character string specifying the data layer to extract. Default is "counts".
#' @param gene_symbol_type Character string specifying the gene ID type. Default is "SYMBOL".
#' @param species Character string specifying the species. Default is "human".
#' @param baseline Numeric baseline value for CNV calculation. Default is 1.
#' @param event_threshold Numeric threshold to define a CNV event. Default is 0.1.
#' @param cutoff Numeric cutoff for gene expression filtering. Default is 0.1.
#' @param out_dir Character string specifying the output directory path. Default is "infercnv_output".
#' @param project_name Character string specifying the project name for the run. Default is "infercnv_project".
#' @param denoise Logical indicating whether to apply denoising. Default is TRUE.
#' @param HMM Logical indicating whether to run HMM-based CNV state prediction. Default is TRUE.
#' @param analysis_mode Character string specifying the analysis mode. Default is "subclusters".
#' @param cluster_by_groups Logical indicating whether to cluster cells by groups. Default is FALSE.
#' @param hclust_method Character string specifying the hierarchical clustering method. Default is "ward.D2".
#' @param num_threads Integer specifying the number of threads to use. Default is 8.
#' @param chr_exclude Character vector of chromosomes to exclude. Default is c("chrM").
#' @param return_plots Logical indicating whether to return diagnostic plots. Default is FALSE.
#'
#' @return A list containing the modified Seurat object, infercnv results, summary statistics,
#'   and optionally diagnostic plots.
run_infercnv_seurat <- function(
  seurat_obj,
  group.by,
  epi_groups,
  ref_groups,
  assay = "RNA",
  layer = "counts",
  gene_symbol_type = "SYMBOL",
  species = "human",
  baseline = 1,
  event_threshold = 0.1,
  cutoff = 0.1,
  out_dir = "infercnv_output",
  project_name = "infercnv_project",
  denoise = TRUE,
  HMM = TRUE,
  analysis_mode = "subclusters",
  cluster_by_groups = FALSE,
  hclust_method = "ward.D2",
  num_threads = 8,
  chr_exclude = c("chrM"),
  return_plots = FALSE
) {
  suppressMessages({
    require(Seurat)
    require(infercnv)
    require(AnnoProbe)
    require(dplyr)
    require(ggplot2)
  })
  
  if (!group.by %in% colnames(seurat_obj@meta.data)) {
    stop("group.by is not found in seurat_obj@meta.data.")
  }

  all_groups <- unique(as.character(seurat_obj@meta.data[[group.by]]))
  if (!all(epi_groups %in% all_groups)) {
    stop("Some epi_groups are not present in the group.by column.")
  }
  if (!all(ref_groups %in% all_groups)) {
    stop("Some ref_groups are not present in the group.by column.")
  }
  if (length(intersect(epi_groups, ref_groups)) > 0) {
    stop("epi_groups and ref_groups must not overlap.")
  }
  
  dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
  run_dir <- file.path(out_dir, project_name)
  dir.create(run_dir, showWarnings = FALSE, recursive = TRUE)
  
  keep_cells <- rownames(seurat_obj@meta.data)[
    seurat_obj@meta.data[[group.by]] %in% c(epi_groups, ref_groups)
  ]
  seu_sub <- subset(seurat_obj, cells = keep_cells)
  
  expr_mat <- Seurat::GetAssayData(seu_sub, assay = assay, layer = layer)
  expr_mat <- as.matrix(expr_mat)
  
  cell_group <- as.character(seu_sub@meta.data[[group.by]])
  names(cell_group) <- colnames(seu_sub)
  
  annot_df <- data.frame(
    cell = colnames(seu_sub),
    group = cell_group,
    stringsAsFactors = FALSE
  )
  
  gene_info <- AnnoProbe::annoGene(rownames(expr_mat), ID_type = gene_symbol_type, species = species)
  target_chr <- paste0("chr", c(1:22, "X", "Y"))
  gene_info <- gene_info[gene_info$chr %in% target_chr, ]
  gene_info$chr <- factor(gene_info$chr, levels = target_chr)
  gene_info <- gene_info[order(gene_info$chr, gene_info$start), ]
  gene_info <- gene_info[, c(1, 4, 5, 6)]
  colnames(gene_info) <- c("gene", "chr", "start", "stop")
  gene_info <- gene_info[!duplicated(gene_info$gene), ]
  
  common_genes <- intersect(rownames(expr_mat), gene_info$gene)
  expr_mat <- expr_mat[common_genes, , drop = FALSE]
  gene_info <- gene_info[match(common_genes, gene_info$gene), , drop = FALSE]
  gene_info <- gene_info[complete.cases(gene_info), ]
  expr_mat <- expr_mat[gene_info$gene, , drop = FALSE]
  
  infercnv_obj <- infercnv::CreateInfercnvObject(
    raw_counts_matrix = expr_mat,
    annotations_file = annot_df,
    gene_order_file = gene_info,
    ref_group_names = ref_groups,
    chr_exclude = chr_exclude
  )
  
  infercnv_obj <- infercnv::run(
    infercnv_obj,
    cutoff = cutoff,
    out_dir = run_dir,
    cluster_by_groups = cluster_by_groups,
    hclust_method = hclust_method,
    denoise = denoise,
    HMM = HMM,
    analysis_mode = analysis_mode,
    num_threads = num_threads
  )
  
  cnv_mat <- infercnv_obj@expr.data
  
  cnv_df <- data.frame(
    cell = colnames(cnv_mat),
    cnv_burden = colMeans(abs(cnv_mat - baseline)),
    cnv_events = colMeans(abs(cnv_mat - baseline) > event_threshold),
    stringsAsFactors = FALSE
  )
  
  seurat_obj$cnv_burden <- cnv_df$cnv_burden[match(colnames(seurat_obj), cnv_df$cell)]
  seurat_obj$cnv_events <- cnv_df$cnv_events[match(colnames(seurat_obj), cnv_df$cell)]
  
  cluster_summary <- seurat_obj@meta.data %>%
    tibble::rownames_to_column("cell") %>%
    dplyr::filter(!is.na(cnv_burden)) %>%
    dplyr::group_by(.data[[group.by]]) %>%
    dplyr::summarise(
      n_cells = dplyr::n(),
      mean_cnv_burden = mean(cnv_burden, na.rm = TRUE),
      median_cnv_burden = median(cnv_burden, na.rm = TRUE),
      mean_cnv_events = mean(cnv_events, na.rm = TRUE),
      median_cnv_events = median(cnv_events, na.rm = TRUE)
    ) %>%
    dplyr::arrange(dplyr::desc(mean_cnv_burden))
  
  res <- list(
    seurat_obj = seurat_obj,
    seurat_subset = seu_sub,
    infercnv_obj = infercnv_obj,
    cnv_df = cnv_df,
    group_summary = cluster_summary,
    params = list(
      group.by = group.by,
      epi_groups = epi_groups,
      ref_groups = ref_groups,
      baseline = baseline,
      event_threshold = event_threshold,
      cutoff = cutoff,
      out_dir = run_dir
    )
  )
  
  if (return_plots) {
    p1 <- Seurat::VlnPlot(
      seurat_obj,
      features = c("cnv_burden", "cnv_events"),
      group.by = group.by,
      pt.size = 0
    )
    
    p2 <- ggplot2::ggplot(
      seurat_obj@meta.data %>%
        tibble::rownames_to_column("cell") %>%
        dplyr::filter(!is.na(cnv_burden)),
      ggplot2::aes(x = .data[[group.by]], y = cnv_burden, fill = .data[[group.by]])
    ) +
      ggplot2::geom_boxplot(outlier.size = 0.2) +
      ggplot2::theme_bw() +
      ggplot2::theme(axis.text.x = ggplot2::element_text(angle = 45, hjust = 1)) +
      ggplot2::labs(x = group.by, y = "CNV burden")
    
    res$plots <- list(vlnplot = p1, boxplot = p2)
  }
  
  return(res)
}
