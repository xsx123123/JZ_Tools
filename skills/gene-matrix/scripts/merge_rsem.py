#!/usr/bin/env python3
"""Merge RSEM genes.results or isoforms.results files into expression matrices."""
import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path


def clean_identifier(value):
    return re.sub(r"\.\d+$", "", value.removeprefix("gene:"))


def main():
    parser = argparse.ArgumentParser(description="Merge RSEM result files into count and TPM matrices")
    parser.add_argument("--input", required=True, help="Directory containing RSEM *.genes.results or *.isoforms.results files")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--sample-map", help="Optional CSV with sample,sample_name columns")
    parser.add_argument("--include-fpkm", action="store_true", help="Write FPKM matrix when the column is available")
    args = parser.parse_args()
    input_dir, output_dir = Path(args.input), Path(args.output)
    if not input_dir.is_dir(): parser.error(f"input directory does not exist: {input_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    mapping = {}
    if args.sample_map:
        with Path(args.sample_map).open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle): mapping[row["sample"]] = row["sample_name"]
    files = sorted([*input_dir.glob("*.genes.results"), *input_dir.glob("*.isoforms.results")])
    if not files: raise ValueError("input directory contains no RSEM result files")
    metrics = {"expected_count": defaultdict(dict), "TPM": defaultdict(dict), "FPKM": defaultdict(dict)}
    sample_names = []
    for path in files:
        sample_id = path.name.split(".")[0]; sample_name = mapping.get(sample_id, sample_id)
        if sample_name in sample_names: raise ValueError(f"duplicate output sample name: {sample_name}")
        sample_names.append(sample_name)
        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle, delimiter="\t"):
                identifier = clean_identifier(row.get("transcript_id") or row.get("gene_id") or "")
                if not identifier: continue
                for metric in metrics:
                    if metric in row and row[metric] != "": metrics[metric][identifier][sample_name] = row[metric]
    outputs = []
    for metric, filename in (("expected_count", "counts_matrix.tsv"), ("TPM", "tpm_matrix.tsv"), ("FPKM", "fpkm_matrix.tsv")):
        if metric == "FPKM" and not args.include_fpkm: continue
        if not metrics[metric]: continue
        path = output_dir / filename
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter="\t"); writer.writerow(["feature_id", *sample_names])
            for identifier in sorted(metrics[metric]): writer.writerow([identifier, *[metrics[metric][identifier].get(sample, "0") for sample in sample_names]])
        outputs.append({"path": filename, "type": "matrix"})
    summary = {"tool": "merge_rsem", "version": "0.9.0", "status": "success", "outputs": outputs,
               "stats": {"samples": len(sample_names), "features": len(metrics["TPM"]), "input_files": len(files)}, "warnings": []}
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__": main()
