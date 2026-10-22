#!/usr/bin/env python3
"""Convert eggNOG-style annotations into RNAFlow enrichment maps."""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

GO_RE = re.compile(r"^GO:\d+$")
PATHWAY_RE = re.compile(r"^(?:ko|map)\d{5}$")


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
    pathway_names = {}
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
            pathway_names.setdefault(pathway, pathway)

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
