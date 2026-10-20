# Usage

`run_deg.py` accepts one JSON manifest through `--input` and creates all results below `--output`.

| Mode | Required manifest fields | Optional fields |
|---|---|---|
| `deseq2` | `counts`, `metadata`, `pairs` | `annotation`, `lfc`, `pval`, `log_file` |
| `atac-deseq2` | `counts`, `metadata`, `pairs` | `samples`, `count_cutoff`, `lfc`, `pval`, `label_col` |
| `distribution` | `metadata`, one of `tpm`/`fpkm` | `width`, `height`, `log_file` |
| `pheatmap` | `matrix`, `metadata` | `min_exp`, `top_n` |
| `plotly-heatmap` | `matrix`, `metadata` | `processed`, `top_n`, `no_cluster` |
| `gtf2tsv` | `gtf` | `attributes`, `column_names`, `keep_version` |

Example manifest:
```json
{"mode":"pheatmap","matrix":"tpm.tsv","metadata":"metadata.tsv","min_exp":1,"top_n":500}
```

Example command:
```bash
python /workspace/.skills/deg/scripts/run_deg.py --input analysis.json --output results
```

Common errors: no overlapping metadata/sample IDs means correct the ID column or matrix header; DESeq2 errors for a contrast mean that Treat/Control values in `pairs` do not exist in metadata; an empty heatmap means relax `min_exp` or provide a numeric matrix.
