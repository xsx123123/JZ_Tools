# Style example only: reconstructed from the user-provided 35-page TnpA/TnpD–CACTA notebook

This is **a writing example**, not an authoritative primary record. The underlying source files were not available to this skill author; therefore each claim below is “reported in the provided notebook,” not independently reverified from original source data. Do not reuse any of these details in an unrelated repository.

# 2026-09-21

## Experiment: Dual-1-Mismatch Terminal-Motif Re-screening

**Date evidence.** The provided TnpA/TnpD–CACTA notebook associates this re-screening record with 2026-09-21. Exact producing command and script were not preserved in its described directory.

### 1. Objective & Computational Environment

**Objective.** To reassess the 45-genome relaxed CACTA candidate set using an exact single-mismatch requirement at both terminal motifs relative to the defined TnpA orientation.

**Environment.** Original genomic FASTA and retained manifests were referenced. Full historical runtime environment and producing command were `[VERSION_TBD]` and `[COMMAND_TBD]`.

### 2. Workflow Overview

**Input data.** `26.9.11_all_Magnoliaceae/all_45_genomes.manifest.tsv` and the supporting candidate-window/genome sources identified by the original notebook.

**Processing.** Terminal motif matching → TIR/TSD and element length assessment → gene-containment checks → original-genome sequence extraction → genomic/strand-oriented sequence export.

**Selection rules reported by the notebook.** Exactly one mismatch relative to CACTA at the left end and TAGTG at the right end in TnpA orientation; TIR ≥15 bp and ≥80% identity; TSD ≤1 mismatch; element length 10–25 kb; gene containment.

### 3. Core Implementation

**Original generating script.** `[PATH_TBD]` — the notebook states it was not retained. A later audit script is not evidence of the original producing command.

**Downstream audit excerpt, NOT the original re-screening executable:**

```python
'left_CACTA_mm': hamming(left5, 'CACTA'),
'right_TAGTG_mm': hamming(right5, 'TAGTG'),
```

*Source type:* excerpt reported from the later `build_combined_45.py` audit/reconstruction procedure.

### 4. Key Outputs & Findings

**Reported outputs.** Selection tables, sequence validation table, genomic/oriented FASTA, and selected BED coordinates.

**Reported results.** The provided notebook reports 1,121 dual-rule candidates in 37 of 45 species; 37 selected sequences passed original-genome re-extraction checks, and the BED contained 111 intervals. These are counts **reported by the example notebook**, not independently verified primary-data results in this package.

**Interpretation.** The stricter motif rule reduced the retained species set relative to the earlier relaxed compilation. No conclusion about transposition activity is justified by motif matching alone.

### 5. Troubleshooting & Next Steps

**Limitation.** The original producing command and complete environment are unavailable; downstream audit commands cannot silently replace them.

**Next step.** Recover the original re-screening source and execution environment, and independently check the eight species without eligible candidates against the full candidate library.
