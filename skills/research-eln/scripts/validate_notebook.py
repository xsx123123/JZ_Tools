#!/usr/bin/env python3
"""Lightweight, read-only structural QA for research-eln generated notebooks.

This tool checks consistency; it DOES NOT certify that scientific claims, historical
commands, or figure provenance are correct. No third-party package is required for
Markdown/CSV checks. PDF checks use optional PyMuPDF (fitz).
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import Counter
from pathlib import Path

DATE = re.compile(r"^#\s+(\d{4}-\d{2}-\d{2}|\[DATE_TBD\])\s*$", re.M)
EXPERIMENT = re.compile(r"^##\s+Experiment:\s+(.+)$", re.M)
EXP_ID = re.compile(r"\*\*Experiment ID:\*\*\s*`?([A-Za-z0-9_-]+)`?", re.I)
IMAGES = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
PLACEHOLDER_MANGLED = re.compile(r"\[(?:DATETBD|PATHTBD|VERSIONTBD|COMMANDTBD|FIGUREPROVENANCETBD|RESULTNOTVERIFIABLE)\]")
TOKEN_LEAK = re.compile(r"FIGURETOKEN|\[INSERT_[A-Z_]+\]|<figure_placeholder>", re.I)
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0e-\x1f\x7f-\x9f]")


class Reporter:
    def __init__(self):
        self.issues: list[tuple[str, str]] = []
        self.info: list[str] = []

    def issue(self, level: str, message: str) -> None:
        self.issues.append((level, message))

    def stat(self, message: str) -> None:
        self.info.append(message)

    def report(self) -> str:
        output = ["# Research ELN structural quality report", "",
                  "Automated static checks only; scientific provenance and PDF page layout still require manual verification.", ""]
        output.extend("- " + line for line in self.info)
        output += ["", "## Issues", ""]
        if self.issues:
            output.extend(f"- **{level}**: {msg}" for level, msg in self.issues)
        else:
            output.append("- No static problems detected (does not imply scientific validity).")
        output += ["", "## Result", ""]
        counts = Counter(level for level, _ in self.issues)
        output.append(f"P0={counts['P0']}; P1={counts['P1']}; P2={counts['P2']}")
        return "\n".join(output) + "\n"


def read_csv(path: Path, required: set[str], report: Reporter) -> list[dict[str, str]]:
    if not path.exists():
        report.issue("P1", f"Missing recommended manifest: `{path.name}`")
        return []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            headers = set(reader.fieldnames or [])
            if required - headers:
                report.issue("P0", f"`{path.name}` missing fields {sorted(required - headers)}")
                return []
            rows = list(reader)
    except (UnicodeError, OSError, csv.Error) as exc:
        report.issue("P0", f"Unable to parse `{path.name}`: {exc}")
        return []
    report.stat(f"{path.name}: {len(rows)} rows")
    return rows


def markdown_check(root: Path, r: Reporter) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    md = root / "EXPERIMENT_NOTEBOOK.md"
    if not md.is_file():
        r.issue("P0", f"Missing authoritative notebook: `{md}`")
        return [], []
    text = md.read_text(encoding="utf-8", errors="replace")
    dates, experiments = DATE.findall(text), EXPERIMENT.findall(text)
    r.stat(f"Markdown notebook: {len(text):,} characters; {len(dates)} date headings; {len(experiments)} experiments")
    if not dates:
        r.issue("P0", "No `# YYYY-MM-DD` or `# [DATE_TBD]` date section found")
    if not experiments:
        r.issue("P0", "No `## Experiment:` heading found")
    if len(re.findall(r"^\s*```", text, re.M)) % 2:
        r.issue("P0", "Unbalanced Markdown code fences; final record may be truncated")
    if PLACEHOLDER_MANGLED.search(text):
        r.issue("P0", "A placeholder lost underscores (e.g. `[VERSIONTBD]` instead of `[VERSION_TBD]`)")
    if TOKEN_LEAK.search(text):
        r.issue("P0", "Unresolved rendering token or editorial insertion marker found")
    if CONTROL_RE.search(text):
        r.issue("P0", "Unexpected control characters in Markdown")
    if text.rstrip().endswith(("### 1. Objective & Computational Environment", "### 2. Workflow Overview",
                             "### 3. Core Implementation", "### 4. Key Outputs & Findings",
                             "### 5. Troubleshooting & Next Steps", "```")):
        r.issue("P0", "Notebook appears to end abruptly at a heading/fence")
    # A code span must be preserved verbatim; these are only heuristic signs of corruption.
    if re.search(r"\b(?:cvmean|trainingselection|runsummary|featureselection)\b", text):
        r.issue("P2", "Inspect code identifiers against the exact source; normalized identifiers may be intentional")
    ids = EXP_ID.findall(text)
    duplicate_ids = {i for i, n in Counter(ids).items() if n > 1}
    if duplicate_ids:
        r.issue("P0", f"Duplicate experiment IDs: {', '.join(sorted(duplicate_ids))}")
    r.stat(f"Experiment IDs found in narrative: {len(ids)}")
    if len(ids) < len(experiments):
        r.issue("P1", "Some experiments have no explicit `**Experiment ID:**` field")
    figures = IMAGES.findall(text)
    for relative in figures:
        path_str = relative.split(" ", 1)[0].strip("<>\"'")
        if re.match(r"(?:https?://|data:)", path_str):
            r.issue("P1", f"Non-portable/external image reference: `{path_str[:100]}`")
        elif not (md.parent / path_str).exists():
            r.issue("P0", f"Embedded figure path does not exist: `{path_str}`")
    r.stat(f"Markdown image references: {len(figures)}")
    index = read_csv(root / "experiment_index.csv", {"experiment_id", "date_label", "date_basis", "title", "experiment_type", "run_ids", "primary_source", "evidence_status"}, r)
    evidence = read_csv(root / "evidence_manifest.csv", {"evidence_id", "experiment_id", "run_id", "artifact_role", "path", "sha256", "verification_status", "notes"}, r)
    figures_rows = read_csv(root / "figure_manifest.csv", {"experiment_id", "figure_number", "figure_path", "source_evidence_ids", "caption", "provenance_status"}, r)
    index_ids = [row.get("experiment_id", "").strip() for row in index]
    if any(not x for x in index_ids):
        r.issue("P0", "Empty experiment ID in experiment_index.csv")
    dup_index = {x for x, n in Counter(index_ids).items() if x and n > 1}
    if dup_index:
        r.issue("P0", f"Duplicate IDs in experiment_index.csv: {', '.join(sorted(dup_index))}")
    if index and len(index) != len(experiments):
        r.issue("P1", f"Manifest has {len(index)} experiment rows but notebook has {len(experiments)} experiment headings; document intentional compression")
    unknown_ids = sorted(set(ids) - set(index_ids))
    if index and unknown_ids:
        r.issue("P0", f"Experiment IDs not found in manifest: {', '.join(unknown_ids)}")
    ev_ids = [row.get("evidence_id", "").strip() for row in evidence]
    if len(set(ev_ids)) != len(ev_ids):
        r.issue("P0", "Duplicate evidence IDs found")
    for row in evidence:
        if index and row.get("experiment_id", "") not in index_ids:
            r.issue("P0", f"Evidence `{row.get('evidence_id')}` points to unknown experiment `{row.get('experiment_id')}`")
        digest = (row.get("sha256") or "").strip()
        if digest and not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            r.issue("P1", f"Invalid SHA256 format for `{row.get('evidence_id')}` (blank if not checked)")
    for row in figures_rows:
        p = (row.get("figure_path") or "").strip()
        if p and not (root / p).exists():
            r.issue("P0", f"Figure manifest path missing: `{p}`")
        if row.get("provenance_status", "").casefold() in {"uncertain", "unverified"} and p in figures:
            r.issue("P0", f"Figure `{p}` is embedded while provenance is uncertain")
        for evid in re.split(r"[,;|]", (row.get("source_evidence_ids") or "")):
            evid = evid.strip()
            if evid and evid not in set(ev_ids):
                r.issue("P1", f"Figure `{p}` uses unknown evidence ID `{evid}`")
    return index, evidence


def pdf_check(pdf: Path, r: Reporter) -> None:
    if not pdf.exists():
        r.issue("P1", f"PDF not supplied/found: `{pdf}`")
        return
    try:
        import fitz  # PyMuPDF optional
    except ImportError:
        r.issue("P1", "PyMuPDF not installed; PDF inspection was skipped")
        return
    try:
        doc = fitz.open(pdf)
    except Exception as exc:
        r.issue("P0", f"Cannot open PDF: {exc}")
        return
    with doc:
        r.stat(f"PDF: {doc.page_count} pages; {len(doc.get_toc())} bookmark entries")
        if doc.page_count < 1:
            r.issue("P0", "PDF contains no pages")
            return
        if not doc.get_toc():
            r.issue("P1", "PDF has no actual bookmark outline (a printed ToC is not sufficient)")
        bad_chars = []
        bad_geom = []
        blank_pages = []
        for index, page in enumerate(doc):
            text = page.get_text()
            if CONTROL_RE.search(text):
                bad_chars.append(index + 1)
            if len(text.strip()) < 5 and not page.get_images(full=True):
                blank_pages.append(index + 1)
            rect = page.rect
            # Geometric heuristic only: text exceeding page boundaries (not text-on-image).
            for block in page.get_text("blocks"):
                if block[6] == 0 and (block[0] < -1 or block[1] < -1 or block[2] > rect.width + 1 or block[3] > rect.height + 1):
                    bad_geom.append(index + 1)
                    break
        if bad_chars:
            r.issue("P1", f"PDF extraction contains control / broken glyphs on pages: {bad_chars[:30]}{'…' if len(bad_chars)>30 else ''}")
        if bad_geom:
            r.issue("P0", f"Possible text clipping beyond page boundary on pages: {bad_geom[:30]}{'…' if len(bad_geom)>30 else ''}")
        if blank_pages:
            r.issue("P1", f"Possibly blank PDF pages: {blank_pages[:30]}")
        last = doc[-1].get_text().strip()
        if len(last) < 80:
            r.issue("P1", "Last PDF page has little extracted text; visually inspect ending")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path, help="Directory containing EXPERIMENT_NOTEBOOK.md and manifests")
    parser.add_argument("--pdf", type=Path, help="Optional PDF path for font/text/bookmark/geometry preflight")
    parser.add_argument("--report", type=Path, help="Write report to this path; default: output_dir/quality_report.md")
    args = parser.parse_args()
    root = args.output_dir.resolve()
    r = Reporter()
    if not root.is_dir():
        print(f"Not a directory: {root}", file=sys.stderr)
        return 2
    markdown_check(root, r)
    if args.pdf:
        pdf_check(args.pdf.resolve(), r)
    else:
        candidate = root / "EXPERIMENT_NOTEBOOK.pdf"
        if candidate.is_file():
            pdf_check(candidate, r)
    report = r.report()
    destination = args.report or root / "quality_report.md"
    destination.write_text(report, encoding="utf-8")
    print(report)
    print(f"Wrote report to {destination}")
    return 1 if any(level == "P0" for level, _ in r.issues) else 0


if __name__ == "__main__":
    raise SystemExit(main())
