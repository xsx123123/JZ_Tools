#!/usr/bin/env python3
"""Convert a GAF 2.x or tabular gene-to-GO file to a compact TSV."""
import argparse
import csv
import json
from pathlib import Path


GAF_COLUMNS = [
    "DB", "DB_Object_ID", "DB_Object_Symbol", "Qualifier", "GO_ID", "DB_Reference",
    "Evidence_Code", "With_or_From", "Aspect", "DB_Object_Name", "DB_Object_Synonym",
    "DB_Object_Type", "Taxon", "Date", "Assigned_By", "Annotation_Extension", "Gene_Product_Form_ID",
]


def resolve_column(header, requested):
    if requested in header:
        return header.index(requested)
    if requested.isdigit() and int(requested) < len(header):
        return int(requested)
    raise ValueError(f"column not found: {requested}")


def main():
    parser = argparse.ArgumentParser(description="Extract gene-to-GO associations from GAF or TSV")
    parser.add_argument("--input", required=True, help="Input GAF or tab-separated table")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--gene-col", default="DB_Object_Symbol", help="Gene column name or zero-based index")
    parser.add_argument("--go-col", default="GO_ID", help="GO column name or zero-based index")
    parser.add_argument("--filename", default="gene_go.tsv", help="Output filename")
    args = parser.parse_args()
    input_path, output_dir = Path(args.input), Path(args.output)
    if not input_path.is_file():
        parser.error(f"input file does not exist: {input_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / args.filename
    if output_path.parent != output_dir:
        parser.error("--filename must be a filename, not a path")

    rows, skipped = set(), 0
    with input_path.open(encoding="utf-8", errors="replace") as handle:
        data_lines = [line.rstrip("\n") for line in handle if line.strip() and not line.startswith("!") and not line.startswith("#")]
    if not data_lines:
        raise ValueError("input contains no data rows")
    first_fields = data_lines[0].split("\t")
    is_gaf = len(first_fields) >= len(GAF_COLUMNS) and first_fields[4].startswith("GO:")
    header = GAF_COLUMNS if is_gaf else first_fields
    records = data_lines if is_gaf else data_lines[1:]
    gene_index, go_index = resolve_column(header, args.gene_col), resolve_column(header, args.go_col)
    for line in records:
        fields = line.split("\t")
        if max(gene_index, go_index) >= len(fields):
            skipped += 1
            continue
        gene, go_id = fields[gene_index].strip().split(".")[0], fields[go_index].strip()
        if gene and go_id:
            rows.add((gene, go_id))
        else:
            skipped += 1
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["Gene_ID", "GO_ID"])
        writer.writerows(sorted(rows))
    summary = {"tool": "gaf_extract", "version": "0.9.0", "status": "success",
               "outputs": [{"path": output_path.name, "type": "table"}],
               "stats": {"associations": len(rows), "skipped_rows": skipped, "input_format": "GAF" if is_gaf else "TSV"},
               "warnings": []}
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
