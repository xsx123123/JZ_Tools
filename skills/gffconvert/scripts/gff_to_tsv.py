#!/usr/bin/env python3
"""Extract selected GFF3 features into a normalized TSV table."""
import argparse
import csv
import json
import sys
import urllib.parse
from pathlib import Path


def parse_attributes(value):
    attributes = {}
    for item in value.strip().strip(";").split(";"):
        if "=" in item:
            key, item_value = item.strip().split("=", 1)
            attributes[key] = item_value.strip()
    return attributes


def main():
    parser = argparse.ArgumentParser(description="Extract GFF3 features to TSV")
    parser.add_argument("--input", required=True, help="Input GFF3 file")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--feature-type", default="gene", help="GFF feature type to retain")
    parser.add_argument("--filename", default="features.tsv", help="Output TSV filename")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / args.filename
    if not input_path.is_file():
        parser.error(f"input file does not exist: {input_path}")
    if output_path.parent != output_dir:
        parser.error("--filename must be a filename, not a path")

    feature_count = 0
    skipped_lines = 0
    with input_path.open(encoding="utf-8") as source, output_path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.writer(destination, delimiter="\t")
        writer.writerow(["GeneID", "GeneName", "Chrom", "Start", "End", "Strand", "Type", "Description"])
        for line_number, line in enumerate(source, start=1):
            if not line.strip() or line.startswith("#"):
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 9:
                skipped_lines += 1
                continue
            if fields[2] != args.feature_type:
                continue
            attributes = parse_attributes(fields[8])
            description = attributes.get("description", attributes.get("Note", attributes.get("product", "NA")))
            writer.writerow([
                attributes.get("ID", attributes.get("gene_id", "NA")),
                attributes.get("Name", attributes.get("gene_name", attributes.get("symbol", "NA"))),
                fields[0], fields[3], fields[4], fields[6], fields[2],
                urllib.parse.unquote(description),
            ])
            feature_count += 1

    summary = {
        "tool": "gff_to_tsv",
        "version": "0.9.0",
        "status": "success",
        "outputs": [{"path": output_path.name, "type": "table"}],
        "stats": {"features": feature_count, "malformed_lines_skipped": skipped_lines, "feature_type": args.feature_type},
        "warnings": ["No matching features found"] if feature_count == 0 else [],
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(1)
