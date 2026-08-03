# Usage

The wrapper directly implements the supplied TPM, Tau and extended-Tau functions without host-specific paths.

```bash
Rscript /workspace/.skills/tissue-specific-genes/scripts/run_tissue_specific.R --input gene_counts.tsv --output results --count_pattern _rep --min_total_tpm 10 --tau_threshold 0.85 --z_threshold 2
```

Input sample columns should match the count pattern and use names such as `leaf_rep1`; the prefix before `_rep` becomes the tissue name. “At least two tissues” means replicate aggregation yielded fewer than two distinct prefixes. A zero or negative length is invalid because TPM uses gene length as a divisor.
