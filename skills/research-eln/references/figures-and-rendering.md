# Figures, Markdown, LaTeX/Typst, and PDF release gates

## Figures are scientific evidence

Before embedding, validate file existence; identify source data and producing script/run; determine whether it is historical source or a plot derived **during notebook compilation**; capture caption, labels, units and caveat. Do not re-use a figure from an unrelated date merely for decoration. For uncertain provenance, list in an appendix with `[FIGURE_PROVENANCE_TBD]` and do not embed.

Select max 1–3 informative figures per substantive experiment; maintain consistent numbering within experiment or, if PDF class supports it, global numbers with clear experiment links. Place each close to the result it supports. Never stretch disproportionately: fit in page text width, preserve aspect ratio and sufficient resolution, and keep the caption with figure. If original is large, copy a resized **derivative** to `assets/` without overwriting source.

## Document design

- Classical restrained white A4 portrait, one column, 10.5–11pt body, consistent type hierarchy, strong headings, moderate whitespace, sober figure captions; avoid decorative starfield or dashboard-styled cards.
- Generate a title page or compact header with title, scope, preparation date explicitly labeled, project-root provenance and version.
- A ToC with clickable PDF bookmarks: date and experiment levels only by default.
- Page numbers. Long sections may flow normally but headings must not be stranded at page bottom; code and figures may be kept together when possible.
- Use a tested syntax highlighting system for Python/R/Bash preserving all whitespace. No naive LaTeX `\texttt{...}` string concatenation around unescaped path tokens. Use a renderer/TeX package that can wrap long paths, or layout-aware path entries outside running prose.
- In notebook Markdown, use normal backtick fences with language names and relative Markdown figure links; do not leak internal tokens such as `FIGURETOKEN` to Markdown/PDF.
- Recommended rendering: Quarto or Pandoc with XeLaTeX/LuaLaTeX; Typst is an alternative when tested. Use whichever exists locally; if none, still deliver valid Markdown and mention PDF was not produced.
- Maintain the authoritative Markdown separately and compile a derived PDF. Keep code escaping, scientific names, emphasis, and mathematics consistent; avoid text escaping after Markdown has become TeX code.

## Mandatory PDF inspection

1. Run renderer, capture stdout/stderr/exit code; preserve `.log` for debug.
2. In LaTeX logs, inspect `Overfull \\hbox`, `Underfull \\hbox`, font/glyph warnings. `Overfull` affecting paths or figures is a **must-fix**, not just a warning.
3. Use a page renderer (`pdftoppm`, `pdfium`, or PyMuPDF) and visually inspect title+ToC, one representative date, code-heavy pages, all figure pages, every page reported with issues, and last page. In very long documents, inspect additional evenly distributed pages.
4. Verify a PDF can be opened, all pages have expected size, ToC/bookmarks exist, figures/text do not overlap, images preserve aspect ratio, long paths are readable, code syntax is intact, and all special glyphs/underscores survive.
5. Compare printed critical tokens against original: `--indep-pairwise`, `feature_selection`, `[VERSION_TBD]`, `miniprot`, original motif strings, signs (`<=`, `>=`) and numbers. Ensure PDF extractor does not return control characters in scientific prose; if it does, investigate font/encoding.
6. Confirm first/last section, number of dated experiments, embedded figures and outputs match the manifests. A manuscript ending mid-code or mid-experiment is **P0**.

## Severity gate

- **P0, block delivery**: altered scientific thresholds/identifiers, source code corruption, invented dates/results, wrong figure experiment, actual figure/text overlap, clipping, blank broken pages, unresolved internal figure tokens, truncated ending.
- **P1, resolve before release if practical**: overfull boxes, missing PDF bookmarks, broken text extraction, excessive duplicate prose, figures detached from results, unportable links without warning.
- **P2, optional polish**: minor typography and stylistic preferences.

Automated checks help but cannot certify scientific accuracy or pixel-perfect layout. Always include a human-readable `quality_report.md` with defects and inspection scope.
