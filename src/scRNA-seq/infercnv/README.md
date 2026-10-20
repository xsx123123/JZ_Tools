# inferCNV Seurat Wrapper

A convenient R wrapper to run [infercnv](https://github.com/broadinstitute/inferCNV) CNV inference directly from a **Seurat object**.

---

## Overview

`run_infercnv_seurat()` extracts the expression matrix and cell annotations from a Seurat object, performs gene chromosome annotation via `AnnoProbe`, and runs the full infercnv pipeline. CNV burden scores are then appended back to the original Seurat object's metadata for downstream analysis and visualization.

---

## Dependencies

Install the required R packages before running:

```r
install.packages(c("Seurat", "dplyr", "ggplot2", "tibble"))

if (!require("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install("infercnv")

# Install AnnoProbe from GitHub
install.packages("devtools")
devtools::install_github("jmzeng1314/AnnoProbe")
```

---

## Usage

```r
source("src/scRNA-seq/infercnv/infercnv_run.r")

res <- run_infercnv_seurat(
  seurat_obj   = seu,                          # Your Seurat object
  group.by     = "cell_type",                  # Metadata column defining groups
  epi_groups   = c("Epithelial", "Tumor"),     # Target cells for CNV calling
  ref_groups   = c("Immune", "Endothelial"),   # Normal reference cells
  out_dir      = "results/infercnv",
  project_name = "sample1",
  return_plots = TRUE
)
```

### Accessing Results

```r
# Seurat object with CNV scores added
seu_cnv <- res$seurat_obj

# View CNV burden on UMAP
Seurat::FeaturePlot(seu_cnv, features = "cnv_burden")

# Group-level summary statistics
print(res$group_summary)

# Raw infercnv object (for advanced access)
infercnv_obj <- res$infercnv_obj

# Diagnostic plots (if return_plots = TRUE)
res$plots$vlnplot
res$plots$boxplot
```

---

## Parameters

| Parameter | Description | Default |
|:---|:---|:---|
| `seurat_obj` | Seurat object containing scRNA-seq data. | — |
| `group.by` | Column name in `meta.data` defining cell groups. | — |
| `epi_groups` | Vector of group names to analyze for CNVs (e.g., tumor cells). | — |
| `ref_groups` | Vector of group names to use as normal reference. | — |
| `assay` | Assay to extract expression from. | `"RNA"` |
| `layer` | Data layer to use (`counts` recommended). | `"counts"` |
| `gene_symbol_type` | Gene ID type for annotation. | `"SYMBOL"` |
| `species` | Species for gene annotation. | `"human"` |
| `baseline` | Baseline value for CNV deviation calculation. | `1` |
| `event_threshold` | Threshold to define a CNV event. | `0.1` |
| `cutoff` | Minimum average expression cutoff for gene filtering. | `0.1` |
| `out_dir` | Output directory path. | `"infercnv_output"` |
| `project_name` | Sub-directory name for this run. | `"infercnv_project"` |
| `denoise` | Apply noise reduction. | `TRUE` |
| `HMM` | Run HMM-based CNV state prediction. | `TRUE` |
| `analysis_mode` | infercnv analysis mode. | `"subclusters"` |
| `cluster_by_groups` | Cluster cells by predefined groups. | `FALSE` |
| `hclust_method` | Hierarchical clustering method. | `"ward.D2"` |
| `num_threads` | Number of parallel threads. | `8` |
| `chr_exclude` | Chromosomes to exclude from analysis. | `c("chrM")` |
| `return_plots` | Return violin and box plots. | `FALSE` |

---

## Output

The function returns a `list` with the following elements:

| Element | Description |
|:---|:---|
| `seurat_obj` | Original Seurat object with `cnv_burden` and `cnv_events` added to `meta.data`. |
| `seurat_subset` | The subset of cells actually used for the infercnv run. |
| `infercnv_obj` | Full infercnv result object (expression matrix, HMM states, etc.). |
| `cnv_df` | Per-cell CNV metrics data frame. |
| `group_summary` | Summary statistics of CNV burden/events grouped by `group.by`. |
| `params` | List of parameters used in the run. |
| `plots` | List containing `vlnplot` and `boxplot` (only if `return_plots = TRUE`). |

---

## Key Metrics

- **cnv_burden**: Mean absolute deviation from the baseline across all genes. Higher values indicate more extensive CNVs.
- **cnv_events**: Proportion of genomic regions exceeding the `event_threshold`. Represents the fraction of the genome affected by CNVs.

---

## Important Notes

1. **Reference Selection**: `ref_groups` should contain cell types known to be **genomically normal** (e.g., immune cells, endothelial cells, fibroblasts). Poor reference choice leads to inaccurate CNV calling.
2. **Group Overlap**: `epi_groups` and `ref_groups` must not share any group names.
3. **Runtime**: infercnv is computationally intensive. For large datasets (>10k cells), consider increasing `num_threads` or running on a computing cluster.
4. **HMM Mode**: Setting `HMM = TRUE` provides discrete CNV state predictions but significantly increases runtime. Set to `FALSE` if you only need relative CNV burden estimates.
5. **Output Files**: infercnv writes intermediate and final results to `out_dir/project_name/`. Check this directory for heatmaps and per-chromosome plots.

---

## Example Workflow

```r
library(Seurat)

# Load data
seu <- readRDS("seurat_object.rds")

# Run inferCNV
cnv_res <- run_infercnv_seurat(
  seurat_obj   = seu,
  group.by     = "cell_type",
  epi_groups   = "Tumor",
  ref_groups   = c("T_cell", "B_cell", "Endothelial"),
  out_dir      = "infercnv_results",
  project_name = "patient_01",
  HMM          = TRUE,
  num_threads  = 16
)

# Save updated Seurat object
saveRDS(cnv_res$seurat_obj, "seurat_with_cnv.rds")

# Visualize
Seurat::VlnPlot(cnv_res$seurat_obj, features = "cnv_burden", group.by = "cell_type")
```
