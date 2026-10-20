# Environment

- R: `optparse`, `DESeq2`, `ggplot2`, `pheatmap`, `RColorBrewer`, `dplyr`, `tidyr` and their Bioconductor dependencies.
- Python 3: `pandas`, `numpy`, `scipy`, `plotly`; GTF extraction also uses `rich` and `loguru`.
- Inputs are user-provided; no reference dataset is bundled or downloaded.
- The runner invokes `Rscript` and Python from the sandbox PATH. Install missing packages in the analysis environment before execution.
