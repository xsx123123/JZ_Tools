# Usage

The manifest selects `single` or `batch` mode. `single` sends one differential table to the vendored R enricher. `batch` reads the first column of `deg_info` as contrast names and looks for contrast result files below `deg_dir`.

| Mode | Required fields | Important optional fields |
|---|---|---|
| `single` | `obo`, `assoc`, `table` | `name`, `gene_col`, `padj_col`, `lfc_col`, `padj_th`, `lfc_th`, `gene_regex`, `cutoff` |
| `batch` | `obo`, `assoc`, `deg_info`, `deg_dir` | `lib_type` (`RNA` or `ATAC`), `gene_col`, `gene_regex`, `cutoff` |

```bash
python /workspace/.skills/enrichments/scripts/run_enrichment.py --input enrich.json --output results
```

If no genes pass the DEG thresholds, the R implementation writes an empty result CSV. If parsing fails, check that the OBO file and association table are plain text, and ensure `gene_col` contains IDs matching the association file. If batch mode cannot find a contrast CSV, correct the first column of `deg_info` or the input result file names.
