# Usage

Gene-list mode transposes a GISTIC2 amp/del gene table and combines nonempty gene cells per region.

```bash
Rscript /workspace/.skills/maftools-gistic2/scripts/run_gistic2.R --input del_genes.conf_90.txt --output results --mode gene-list --prefix DP
```

Sample-summary mode requires `all_lesions` plus a clinical table with `Tumor_Sample_Barcode` and `ID` columns.

```bash
Rscript /workspace/.skills/maftools-gistic2/scripts/run_gistic2.R --input all_lesions.conf_90.txt --output results --mode sample-summary --clinical clinical.tsv
```

If no `Unique Name` or `Unique_Name` column is found, use the unmodified GISTIC2 lesion output. If mapping yields unexpected sample IDs, inspect the clinical `ID` values and the lesion table sample headers after `.call` is removed.
