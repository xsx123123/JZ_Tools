# Tissue-Specific Gene Expression Analysis

This directory contains a suite of R scripts designed to process raw RNA-seq gene expression data, normalize it, and identify tissue-specific genes using the **Tau specificity index**.

## Pipeline Overview

The workflow is designed to transform raw gene counts into biologically meaningful tissue-specificity metrics. The main steps include:

1.  **TPM Normalization**: Converts raw read counts (from featureCounts) into Transcripts Per Million (TPM) to account for gene length and sequencing depth.
2.  **Replicate Merging**: Aggregates biological replicates (e.g., `Bud_rep1`, `Bud_rep2`) into a single representative value (mean TPM) for each tissue.
3.  **Specificity Scoring**: Calculates the Tau index (0 < &tau; < 1) for every gene. A higher Tau value indicates higher tissue specificity.
4.  **Classification**: (Optional/Extended) Uses an extended algorithm to classify genes into specific tissue categories.

## File Descriptions

### 1. `calculation.r`
The main execution script. It orchestrates the entire analysis pipeline:
- Loads the raw count matrix.
- Calls the normalization functions.
- Filters low-expression genes (e.g., total sum TPM < 10).
- Merges replicates.
- Calculates Tau scores and saves the final output.

**Note**: You must update the file paths (e.g., `root_dir`, `gene_matrix_dir`) in this script to match your local environment before running.

### 2. `calculate_tpm.r`
Contains the function `calculate_tpm(data, count_col_pattern)`.
- **Input**: Data frame with `Geneid`, `Length`, and count columns.
- **Logic**:
    1. Calculates RPK (Reads Per Kilobase).
    2. Calculates Scaling Factors (per-sample library size).
    3. Computes final TPM values.

### 3. `calc_tau_manual.R`
Contains the function `calc_tau_manual(x)`.
- Implements the standard Tau formula:
  $$ \tau = \frac{\sum_{i=1}^{n} (1 - \hat{x}_i)}{n - 1} $$
  Where $\hat{x}_i$ is the expression of the gene in tissue $i$ normalized by the maximal expression across all tissues.

### 4. `identify_extended_tau .R`
*Status: Placeholder/Under Development*
Intended to contain the `identify_extended_tau` function for advanced classification of genes based on their Tau scores and expression profiles (e.g., identifying which specific tissue a gene is specific to).

## Dependencies

The scripts require the following R packages:
- `dplyr`
- `tidyr`
- `data.table`
- `stringr`

## Usage

1. Ensure all `.R` helper scripts are in your working directory or sourced correctly.
2. Open `calculation.r`.
3. Modify the `root_dir` and input file paths.
4. Run the script to generate the `RNA_SEQ_tissue_specificity_of_genes_extended_tau.tsv` output file.
