# Editorial approach: preserve the favored compact scientific notebook

## Style to retain from the 35-page TnpA/TnpD–CACTA example

- Full title and preparation date, followed by an automatically generated chronological table of contents.
- One scientific experiment per distinct investigation; several on the same day belong under one date heading.
- Five familiar sections: Objective & Environment → Workflow → Implementation → Outputs & Findings → Troubleshooting & Next Steps.
- Substantive steps and exact parameters displayed briefly (e.g., BLAST settings; a `miniprot` command; rules for CACTA terminal mismatches), instead of generic software boilerplate.
- Observed result **numbers** in the main narrative; method modifications linked across experiments (by experiment title/ID, not by date in prose).
- Figures adjacent to results, concise English captions; formal, neutral and unembellished style.

## Improve rather than copy the reference's shortcomings

- Use `# Date` / `## Experiment` / `### Section` in source; PDF headings should not be numbered as `2.1.1 1. Objective`. Choose either section numbering **or** template numbers in PDF, never both.
- Avoid deeply nested ToC entries: default display dates + experiment titles only. Include sections only if the user asks for a deep ToC.
- Use actual PDF bookmarks and clickable ToC, not visual ToC alone.
- Do not compress long paths by deleting underscores, punctuation, case, leading directories or code tokens.
- Link full scripts once; quote the key 5–35 lines if they explain experiment-specific methodology.
- Avoid gratuitous repeated “unknown environment” lists. Maintain a shared environment evidence appendix with per-experiment exceptions.
- If no figure can be confidently linked to an experiment, omit the Figures subsection completely.
- If no independently supported “first run”, state “Earlier comparable run not established” and describe only verified parameter deltas.

## Writing about experimentation

Each experiment should answer in 15–45 seconds of reading:

1. Why was this performed, and what biological/technical question was tested?
2. Which datasets, genomes, traits and specific procedures were involved?
3. Which exact code/parameters determine the result?
4. What measurable result and evidence were obtained? How does it compare to earlier stages?
5. What failed, what was changed, what evidence remains missing, and what follows?

Prefer clear operational scientific English. Do not pad paragraphs with unsupported background. Separate real outcomes from proposed follow-up actions.

**No dates in body prose.** Never write calendar dates or relative time expressions inside descriptive sentences (objective, workflow explanation, results, interpretation, captions, troubleshooting, synthesis). The `# YYYY-MM-DD` heading and the experiment's `Date evidence` field already carry the chronology; the prose underneath should read date-free. Refer to other experiments by title or ID ("the preceding experiment", "Experiment Dual-1-Mismatch Terminal-Motif Re-screening above"), never by date.

## Experiment type adjustments

- **Data conversion/QC:** record source formats, samples/variants pre/post each filter, reference genome, QC thresholds, missingness, anomalies; do not infer sample IDs from aggregate counts.
- **Genomic homology / motif / phylogeny:** record query sequences, genome set, coordinate conventions, sequence orientation, HSP grouping, exact motif/tolerance, TIR/TSD parameters, tree/alignment provenance.
- **ML training / prediction:** state datasets, split strategy, random seed, leakage controls, models, hyperparameter search, CV protocol and its separation from untouched holdout; table of comparable metrics and figures.
- **Figure-only processing:** label it as plotting/compilation (not a rerun), with exact source input and transformation.
- **Incomplete historical fragment:** short record with verified artifacts, known statuses and gaps. Do not repeat full five-part sections if there is no experiment-specific evidence; place compactly in an audit appendix.

## Scale-dependent compression

- Up to ~20 distinct substantive experiments: chronological full five-part records, as in reference sample.
- More than ~20: preserve the same story in the main notebook for milestones and parameter-changing experiments, while linking every other experiment/run in full machine-readable indexes and/or appendices.
- 100+ model/trial repetitions: build one method description, a versioned comparative table, representative case studies, and a complete indexed archive. Never render dozens of copies of the same source excerpt or versions.
- Any compression must be traceable: archive each run separately even if the prose is grouped.
