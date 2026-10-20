#!/usr/bin/env python3
"""Add GO term names and namespaces to a gene-to-GO table."""
import argparse
import csv
import json
from pathlib import Path


def parse_obo(path):
    terms, current, alt_ids = {}, {}, []
    def store():
        if current.get("id") and current.get("name"):
            value = (current.get("namespace", "NA"), current["name"], current.get("obsolete", "false") == "true")
            terms[current["id"]] = value
            for alt_id in alt_ids:
                terms[alt_id] = value
    with path.open(encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            if line == "[Term]":
                store(); current, alt_ids = {}, []
            elif line.startswith("id: GO:"):
                current["id"] = line[4:]
            elif line.startswith("name: "):
                current["name"] = line[6:]
            elif line.startswith("namespace: "):
                current["namespace"] = line[11:]
            elif line == "is_obsolete: true":
                current["obsolete"] = "true"
            elif line.startswith("alt_id: GO:"):
                alt_ids.append(line[8:])
        store()
    return terms


def main():
    parser = argparse.ArgumentParser(description="Annotate gene-GO associations using a GO OBO file")
    parser.add_argument("--input", required=True, help="Input tab-separated gene-to-GO table")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--obo", default="ref/go-basic.obo", help="GO OBO ontology file")
    parser.add_argument("--gene-col", default="Gene_ID", help="Gene column name")
    parser.add_argument("--go-col", default="GO_ID", help="GO identifier column name")
    parser.add_argument("--include-obsolete", action="store_true", help="Retain annotations to obsolete terms")
    parser.add_argument("--filename", default="gene_go_annotated.tsv", help="Output filename")
    args = parser.parse_args()
    input_path, obo_path, output_dir = Path(args.input), Path(args.obo), Path(args.output)
    if not input_path.is_file(): parser.error(f"input file does not exist: {input_path}")
    if not obo_path.is_file(): parser.error(f"OBO file does not exist: {obo_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / args.filename
    if output_path.parent != output_dir: parser.error("--filename must be a filename, not a path")
    terms = parse_obo(obo_path)
    annotated, unknown, obsolete = 0, 0, 0
    with input_path.open(encoding="utf-8", errors="replace", newline="") as source:
        reader = csv.DictReader(source, delimiter="\t")
        if not reader.fieldnames or args.gene_col not in reader.fieldnames or args.go_col not in reader.fieldnames:
            raise ValueError(f"input must contain {args.gene_col!r} and {args.go_col!r} columns")
        with output_path.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=[args.gene_col, args.go_col, "GO_Namespace", "GO_Term", "GO_Obsolete"], delimiter="\t")
            writer.writeheader()
            for row in reader:
                term = terms.get(row[args.go_col])
                if not term:
                    unknown += 1
                    continue
                namespace, name, is_obsolete = term
                if is_obsolete and not args.include_obsolete:
                    obsolete += 1
                    continue
                writer.writerow({args.gene_col: row[args.gene_col], args.go_col: row[args.go_col], "GO_Namespace": namespace, "GO_Term": name, "GO_Obsolete": str(is_obsolete).lower()})
                annotated += 1
    warnings = []
    if unknown: warnings.append("Input contained GO identifiers absent from the supplied OBO")
    if obsolete: warnings.append("Obsolete GO identifiers were excluded")
    summary = {"tool": "annotate_go_terms", "version": "0.9.0", "status": "success",
               "outputs": [{"path": output_path.name, "type": "table"}],
               "stats": {"annotated_rows": annotated, "unknown_go_ids": unknown, "obsolete_rows_excluded": obsolete, "obo_terms": len(terms)}, "warnings": warnings}
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
