<!-- Notebook file: EXPERIMENT_NOTEBOOK.md. Replace examples with evidence. -->
<!-- Body prose must contain NO calendar dates or relative date expressions; dates appear only in date headings, the Date evidence field, the Prepared line, and CSV manifests. Refer to other experiments by title/ID, not by date. -->
# [Study Title] Computational Experiment Notebook

**Prepared:** [preparation date; explicitly not an experiment date]

**Scope and evidence policy:** This notebook reconstructs documented computational experiments from retained project materials. Notebook compilation is not a computational rerun. Each observation is linked to an experiment/run and an evidence identifier where available.

## Study Overview

[Two to four sentences identifying the scientific questions and the overall sequence of analytical stages. Avoid findings not grounded in the evidence.]

## Methods & Environment Evidence

[Brief common tools and verified versions; explain source/environment limitations. Only add relevant shared information.]

# [YYYY-MM-DD]  <!-- or [DATE_TBD] -->

## Experiment: [Concise, scientific, experiment-specific title]

**Experiment ID:** `EXP-YYYYMMDD-01`  
**Date evidence:** [Execution log / analysis document / encoded batch date / unknown; precise evidence path]  
**Run identity/status:** [Run ID and completion evidence; do not invent]  
**Evidence level:** [Verified / Reported / Inferred / Not verifiable]

### 1. Objective & Computational Environment

**Objective.** [A biological or technical question; include why it follows preceding experiment when supported.]

**Run-specific environment.** [Tools, versions, and exact evidence; else `[VERSION_TBD]`. Shared dependencies are listed once in Methods & Environment Evidence.]

### 2. Workflow Overview

**Inputs.** [Exact relevant data, species, traits, assembly or sequence IDs; evidence ref.]

**Included/excluded units.** [Verified counts and exclusions; label missing evidence.]

**Workflow.** [Input → transformations and key threshold/filter → output.]

### 3. Core Implementation

**Primary source.** [`relative/path/to/script.sh` — indicate source availability and historical run mapping.]

**Invocation and parameters.** [A run-specific exact command or parameter table. If unavailable use `[COMMAND_TBD]`.]

**Source excerpt (faithful; not necessarily independently executable):**

```bash
# Paste the exact original command or source excerpt here without modifying tokens.
```

[State source path and, if available, exact line range. Replace the code fence with a source link if a meaningful excerpt is unavailable.]

### 4. Key Outputs & Findings

**Artifacts.** [3–8 significant files or artifact groups; the complete inventory is linked in evidence_manifest.csv.]

**Observed results.** [Verified measurements/counts and denominators, tied to evidence IDs.]

**Interpretation.** [What is consistent with the observation; distinguish from hypothesis or biological validation.]

**Evidence status.** [Scripts: verified/partial/missing; input: complete/partial/missing; outputs: verified/reported/unverifiable; figure provenance: verified/uncertain/N/A.]

### Key Figures

<!-- Include only provenance-linked figures; omit entire subsection otherwise. -->

![Figure 1. Specific observation, comparison, metric, and provenance.](assets/example.png)

### 5. Troubleshooting & Next Steps

**Technical issues and resolution.** [Actual evidenced errors, version confounds, workarounds.]

**Change from preceding experiment.** [Exactly what changed, or earlier-run evidence missing.]

**Limitations.** [Specific missing logs, source revisions, input hashes, unverifiable outputs.]

**Next steps.** [1–2 precise and actionable follow-ups.]

---

# Cross-Experiment Reproducibility and Data-Use Notes

[Short evidence-grounded synthesis; unresolved limitations and source data-use cautions.]
