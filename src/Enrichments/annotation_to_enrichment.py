#!/usr/bin/env python3
"""Convert eggNOG-style annotations into RNAFlow enrichment maps."""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

GO_RE = re.compile(r"^GO:\d+$")
PATHWAY_RE = re.compile(r"^(?:ko|map)\d{5}$")
KEGG_REST_PATHWAY_KO = "https://rest.kegg.jp/list/pathway/ko"
KEGG_REST_PATHWAY_MAP = "https://rest.kegg.jp/list/pathway"

# Pathways deleted/merged by KEGG (https://www.genome.jp/kegg/docs/upd_map.html)
# but still emitted by older eggNOG database builds.
RETIRED_PATHWAYS = {
    "ko00072": "Synthesis and degradation of ketone bodies (retired by KEGG, merged into ko00650)",
    "ko00281": "Geraniol degradation (retired by KEGG, merged into ko00907)",
    "ko00471": "D-Glutamine and D-glutamate metabolism (retired by KEGG, merged into ko00470)",
    "ko01058": "Acridone alkaloid biosynthesis (retired by KEGG, merged into ko00996)",
    "ko01130": "Biosynthesis of antibiotics (retired by KEGG, merged into ko01110)",
}


def load_pathway_names(path: str) -> dict:
    """ko##### pathway id -> name.

    Resolution order: explicit TSV file, then the KEGG REST API (short
    timeout, best effort; ko list supplemented by the map list since a few
    pathways only exist at map level). Retired IDs get historical names.
    Returns {} when everything is unavailable.
    """
    mapping = {}

    def absorb(text: str) -> None:
        for line in text.splitlines():
            parts = line.split("\t")
            if len(parts) == 2 and parts[0].strip():
                mapping[parts[0].strip().removeprefix("path:")] = parts[1].strip()

    if path:
        with open(path, encoding="utf-8-sig") as handle:
            absorb(handle.read())
        if not mapping:
            print(f"[warn] pathway name file {path} is empty; trying KEGG REST",
                  file=sys.stderr)
    if not mapping:
        try:
            import urllib.request
            with urllib.request.urlopen(KEGG_REST_PATHWAY_KO, timeout=10) as resp:
                absorb(resp.read().decode("utf-8"))
            map_names = {}
            with urllib.request.urlopen(KEGG_REST_PATHWAY_MAP, timeout=10) as resp:
                for line in resp.read().decode("utf-8").splitlines():
                    parts = line.split("\t")
                    if len(parts) == 2 and parts[0].strip():
                        map_names[parts[0].strip().removeprefix("path:")] = parts[1].strip()
            for pid, name in map_names.items():
                mapping.setdefault(pid.replace("map", "ko", 1), name)
        except Exception as exc:  # noqa: BLE001 - offline fallback keeps IDs as names
            print(f"[warn] cannot fetch KEGG pathway list: {exc}", file=sys.stderr)
    for pid, name in RETIRED_PATHWAYS.items():
        mapping.setdefault(pid, name)
    return mapping


def split_values(value: str):
    if not value or value in {"-", "None", "nan"}:
        return []
    return [item.strip() for item in re.split(r"[,;|]", value) if item.strip()]


def normalize_gene_id(value: str) -> str:
    """Match eggNOG transcript IDs to the gene IDs used by RSEM/DESeq2."""
    return re.sub(r"_mRNA$", "", value.strip())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--format", choices=["eggnog"], default="eggnog")
    parser.add_argument("--go-assoc", required=True)
    parser.add_argument("--kegg-id-map", required=True)
    parser.add_argument("--kegg-term2gene", required=True)
    parser.add_argument("--kegg-term2name", required=True)
    parser.add_argument("--kegg-pathway-names", default="",
                        help="TSV of ko##### pathway id -> name (falls back to KEGG REST)")
    parser.add_argument("--kegg-config")
    args = parser.parse_args()

    input_path = Path(args.input)
    rows = []
    with input_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        required = {"query"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"annotation table must contain query; found {reader.fieldnames}")
        for row in reader:
            query = normalize_gene_id(row.get("query") or "")
            if query:
                rows.append(row)

    go_column = "gos"
    pathway_column = "kegg_pathway"
    missing = [name for name in (go_column, pathway_column) if name not in (rows[0] if rows else {})]
    if missing:
        raise ValueError(f"{args.format} annotation table missing columns: {', '.join(missing)}")

    go_rows = set()
    id_rows = set()
    pathway_rows = set()
    pathway_names = load_pathway_names(args.kegg_pathway_names)
    observed_pathways = set()
    for row in rows:
        query = normalize_gene_id(row["query"])
        gos = sorted({go for go in split_values(row.get(go_column, "")) if GO_RE.fullmatch(go)})
        if gos:
            go_rows.add((query, ",".join(gos)))
        id_rows.add((query, query))
        pathways = sorted({path for path in split_values(row.get(pathway_column, ""))
                           if PATHWAY_RE.fullmatch(path) and path.startswith("ko")})
        for pathway in pathways:
            pathway_rows.add((pathway, query))
            observed_pathways.add(pathway)
    for pathway in observed_pathways:
        pathway_names.setdefault(pathway, pathway)
    unnamed = sorted(p for p, n in pathway_names.items() if p == n)
    if unnamed:
        print(f"[warn] no KEGG pathway name for: {', '.join(unnamed)}", file=sys.stderr)

    outputs = {
        "go": Path(args.go_assoc),
        "id": Path(args.kegg_id_map),
        "term_gene": Path(args.kegg_term2gene),
        "term_name": Path(args.kegg_term2name),
    }
    for path in outputs.values():
        path.parent.mkdir(parents=True, exist_ok=True)
    with outputs["go"].open("w", encoding="utf-8") as handle:
        for query, gos in sorted(go_rows):
            handle.write(f"{query}\t{gos}\n")
    with outputs["id"].open("w", encoding="utf-8") as handle:
        for query, kegg_id in sorted(id_rows):
            handle.write(f"{query}\t{kegg_id}\n")
    with outputs["term_gene"].open("w", encoding="utf-8") as handle:
        for pathway, query in sorted(pathway_rows):
            handle.write(f"{pathway}\t{query}\n")
    with outputs["term_name"].open("w", encoding="utf-8") as handle:
        for pathway, name in sorted(pathway_names.items()):
            handle.write(f"{pathway}\t{name}\n")

    if args.kegg_config:
        config_path = Path(args.kegg_config)
        with config_path.open(encoding="utf-8") as handle:
            kegg_config = json.load(handle)
        kegg_config.update({
            "enabled": True,
            "id_map": str(outputs["id"].resolve()),
            "term2gene": str(outputs["term_gene"].resolve()),
            "term2name": str(outputs["term_name"].resolve()),
        })
        with config_path.open("w", encoding="utf-8") as handle:
            json.dump(kegg_config, handle)

    if not go_rows:
        raise ValueError("annotation table produced no valid GO:###### terms")
    if not pathway_rows:
        raise ValueError("annotation table produced no ko##### KEGG pathways")


if __name__ == "__main__":
    main()
