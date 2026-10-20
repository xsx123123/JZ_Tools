#!/usr/bin/env python3
"""Download a minimal KEGG offline annotation bundle using only Python stdlib."""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "OmicHub-kegg-pull/0.9"


def fetch(url: str, timeout: float) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def species_codes(path: Path) -> list[str]:
    values = []
    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.split("#", 1)[0].strip()
        if value:
            values.append(value)
    if not values:
        raise ValueError("input contains no organism codes")
    return list(dict.fromkeys(values))


def parse_list(text: str) -> list[tuple[str, str]]:
    rows = []
    for line in text.splitlines():
        fields = line.split("\t", 1)
        if len(fields) == 2:
            rows.append((fields[0], fields[1]))
    return rows


def build_species(code: str, output: Path, skip_download: bool, raw_only: bool, timeout: float, delay: float) -> dict:
    species_dir = output / code
    raw_dir = species_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    endpoints = {"gene_pathway": f"link/pathway/{code}", "pathway_names": f"list/pathway/{code}"}
    raw_paths = {name: raw_dir / f"{name}.tsv" for name in endpoints}
    if not skip_download:
        for name, endpoint in endpoints.items():
            raw_paths[name].write_text(fetch(f"https://rest.kegg.jp/{endpoint}", timeout), encoding="utf-8")
            time.sleep(delay)
    missing = [str(path) for path in raw_paths.values() if not path.is_file()]
    if missing:
        raise ValueError("missing raw file(s): " + ", ".join(missing))
    outputs = [{"path": str(path.relative_to(output)), "type": "raw_table"} for path in raw_paths.values()]
    stats = {"organism": code, "n_gene_pathway_rows": len(parse_list(raw_paths["gene_pathway"].read_text(encoding="utf-8"))), "n_pathways": len(parse_list(raw_paths["pathway_names"].read_text(encoding="utf-8")))}
    if not raw_only:
        gene_pathway = species_dir / "gene_pathway.tsv"
        pathway_names = species_dir / "pathway_names.tsv"
        gene_pathway.write_text("gene\tpathway\n" + raw_paths["gene_pathway"].read_text(encoding="utf-8"), encoding="utf-8")
        pathway_names.write_text("pathway\tname\n" + raw_paths["pathway_names"].read_text(encoding="utf-8"), encoding="utf-8")
        names = dict(parse_list(raw_paths["pathway_names"].read_text(encoding="utf-8")))
        grouped: dict[str, list[str]] = {}
        for gene, pathway in parse_list(raw_paths["gene_pathway"].read_text(encoding="utf-8")):
            grouped.setdefault(pathway, []).append(gene)
        gmt = species_dir / "pathway_gene.gmt"
        with gmt.open("w", encoding="utf-8") as handle:
            for pathway, genes in sorted(grouped.items()):
                handle.write("\t".join([pathway, names.get(pathway, pathway), *genes]) + "\n")
        outputs.extend([{"path": str(path.relative_to(output)), "type": "table"} for path in (gene_pathway, pathway_names)] + [{"path": str(gmt.relative_to(output)), "type": "gmt"}])
    species_summary = {"tool": "kegg-pull", "version": "0.9.0", "status": "success", "outputs": outputs, "stats": stats, "warnings": []}
    (species_dir / "summary.json").write_text(json.dumps(species_summary, ensure_ascii=False, indent=2) + "\n")
    outputs.append({"path": str((species_dir / "summary.json").relative_to(output)), "type": "summary"})
    return {"outputs": outputs, "stats": stats}


def main() -> int:
    parser = argparse.ArgumentParser(description="Download KEGG annotation TSV/GMT files")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--raw-only", action="store_true")
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=60.0)
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"input file not found: {args.input}")
    if args.delay <= 0 or args.timeout <= 0:
        parser.error("--delay and --timeout must be positive")
    args.output.mkdir(parents=True, exist_ok=True)
    outputs, completed, warnings = [], [], []
    try:
        codes = species_codes(args.input)
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    for code in codes:
        try:
            result = build_species(code, args.output, args.skip_download, args.raw_only, args.timeout, args.delay)
            completed.append(result["stats"])
            outputs.extend(result["outputs"])
        except (OSError, ValueError, urllib.error.URLError, TimeoutError) as error:
            warnings.append(f"{code}: {error}")
    status = "success" if completed else "failed"
    summary = {"tool": "kegg-pull", "version": "0.9.0", "status": status, "outputs": outputs, "stats": {"n_requested": len(codes), "n_completed": len(completed), "species": completed}, "warnings": warnings}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    if not completed:
        print("ERROR: no organism completed; inspect summary.json", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
