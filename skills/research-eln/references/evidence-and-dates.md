# Evidence, provenance, chronology, and scientific claims

## Primary rule

Document what the supplied materials **prove**, and distinguish this from what they only suggest. A file existing in an output folder is not proof it was created during any particular invocation. No reconstructed narrative may silently assume missing experimental steps.

## Evidence levels

| Label | Required basis | Language to use |
| --- | --- | --- |
| `verified` | Inspected artifact, measured entry, log/command with matching run identity, or checked source code | “The retained report records ...”; “The verified table contains ...” |
| `reported` | README/report describes result but underlying output/command unavailable | “The historical README reports ...” |
| `inferred` | Explicit, documented reasoning over recorded data | “This suggests ...; inference requires validation.” |
| `expected` | Software method/spec predicts output, no confirmed artifact | “Expected output ...; not verified.” |
| `not_verifiable` | No adequate source or conflicting evidence | `[RESULT_NOT_VERIFIABLE]` plus actionable missing item |

Never promote `reported` to `verified` because it appears in multiple copied summaries. Label derived figures and transformations distinctly from original analysis outputs.

## Run, experiment, and source identity

- `experiment_id`: stable unit defined by a distinct research question and workflow; linked parameter sweeps can be grouped, but individual runs need stable `run_id` identities.
- `run_id`: timestamp/config/input signature if available; otherwise a clearly assigned local archival label, **not** claimed historical ID.
- `date_basis`: `execution_log`, `analysis_document`, `path_encoded_batch`, or `unknown`.
- `date_label`: actual date text or `[DATE_TBD]`; indicate explicitly if a batch label, not execution day.
- `artifact_role`: `input`, `script`, `config`, `log`, `table`, `model`, `figure`, `manifest`, or `other`.
- `execution_status`: `completed`, `partial`, `failed`, or `unknown`; absence of final report **does not prove failed**.
- `figure provenance`: link original figure to producing script/table/log/run. If generating a plot for the notebook from existing table, state `derived during notebook preparation`, and record source table and transformation, never suggest it came from historical experiment.
- Keep `Git commit`, tool/runtime version, random seed, inputs, sample/variant inclusion manifest, and full command **when sourced**. `requirements` is a specification, not necessarily an execution-time environment.

## Recommended CSV schemas

`experiment_index.csv`:

```csv
experiment_id,date_label,date_basis,title,experiment_type,run_ids,primary_source,evidence_status
```

`evidence_manifest.csv`:

```csv
evidence_id,experiment_id,run_id,artifact_role,path,sha256,verification_status,notes
```

`figure_manifest.csv`:

```csv
experiment_id,figure_number,figure_path,source_evidence_ids,caption,provenance_status
```

`sha256` may be empty if not computed; never fake a digest. Quote CSV fields that contain commas/newlines. Retain conflicting dates and tell the reader which dates are run, source-summary, or archival compilation dates. Filenames containing `YYYY-MM-DD` are only a date clue.

## Critical bioinformatics safeguards

- State genome assembly and coordinate system (0-based BED vs 1-based GFF/VCF, strand/orientation) where source provides them.
- Keep sample counts, species counts, loci counts, HSP counts and model counts separate; never add them as if they were the same unit.
- Explain filtering levels and denominators: pre-QC, post-QC, total, evaluated, passing, recovered.
- Do not merge holdout Pearson R, training-side CV means, nested CV, repeated CV, per-fold baseline and TOPSIS rankings. Report exactly what metric was computed and over which unit.
- For gene families / TIR / TSD / CACTA, preserve the stated exact mismatch rules and orientation, and never convert “candidate” into “validated functional transposon.”
- For failed runs, record the actual error and the next successful correction if linked; do not infer success from a later copy of an output.

## Date grouping

Under `# YYYY-MM-DD`, put each independent experiment in a separate `## Experiment: ...` section. A study can have a general chronological Introduction and a brief methodological synthesis, but date-based grouping remains the backbone. If the original execution dates are unknown, create a separate `# [DATE_TBD]` section with clear provenance labels; do not assign preparation date to experiments. The date heading and the experiment's `date_label`/`date_basis` fields are the only places dates appear in the notebook Markdown: the prose under each heading must contain no calendar dates, timestamps, or relative date expressions ("the next day", "later that week", "on this date"); refer to ordering via headings and experiment IDs instead.

## Claim verification checklist

For every important finding, answer: Which source file? Which experiment/run? Which field/row? Which denominators and parameters? Was it directly observed, or copied, inferred, expected, or unverified? If two batches disagree, show the conflict; do not choose whichever number looks better.
