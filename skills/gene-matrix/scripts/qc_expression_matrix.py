#!/usr/bin/env python3
"""Create per-sample library and detected-feature QC summaries for one matrix."""
import argparse
import csv
import json
import math
from pathlib import Path


def correlation(first, second):
    n = len(first)
    if n < 2: return float("nan")
    mean_first, mean_second = sum(first) / n, sum(second) / n
    numerator = sum((a - mean_first) * (b - mean_second) for a, b in zip(first, second))
    denominator = math.sqrt(sum((a - mean_first) ** 2 for a in first) * sum((b - mean_second) ** 2 for b in second))
    return numerator / denominator if denominator else float("nan")


def main():
    parser = argparse.ArgumentParser(description="Summarize an expression matrix and sample correlations")
    parser.add_argument("--input", required=True, help="Tab-separated feature-by-sample matrix with header")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--detect-cutoff", type=float, default=1.0, help="Expression threshold for detected features")
    parser.add_argument("--filename-prefix", default="matrix_qc", help="Prefix for QC tables")
    args = parser.parse_args()
    input_path, output_dir = Path(args.input), Path(args.output)
    if not input_path.is_file(): parser.error(f"input file does not exist: {input_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    with input_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter="\t"); header = next(reader, None)
        if not header or len(header) < 3: raise ValueError("matrix requires one feature column and at least two samples")
        samples, values = header[1:], [[] for _ in header[1:]]
        feature_count, detected = 0, [0] * len(samples)
        for row in reader:
            if len(row) < len(header): continue
            feature_count += 1
            for index, raw in enumerate(row[1:len(header)]):
                value = float(raw); values[index].append(value)
                if value > args.detect_cutoff: detected[index] += 1
    metrics_path = output_dir / f"{args.filename_prefix}_sample_metrics.tsv"
    with metrics_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t"); writer.writerow(["sample", "library_size", "detected_features", "median_expression"])
        for sample, vector, detected_count in zip(samples, values, detected):
            ordered = sorted(vector); median = ordered[len(ordered) // 2] if ordered else 0
            writer.writerow([sample, sum(vector), detected_count, median])
    correlation_path = output_dir / f"{args.filename_prefix}_pearson.tsv"
    with correlation_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t"); writer.writerow(["sample", *samples])
        for sample, vector in zip(samples, values): writer.writerow([sample, *["NA" if math.isnan(correlation(vector, other)) else f"{correlation(vector, other):.6f}" for other in values]])
    summary = {"tool": "qc_expression_matrix", "version": "0.9.0", "status": "success", "outputs": [{"path": metrics_path.name, "type": "table"}, {"path": correlation_path.name, "type": "table"}], "stats": {"samples": len(samples), "features": feature_count, "detect_cutoff": args.detect_cutoff}, "warnings": []}
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__": main()
