#!/usr/bin/env python3
"""Small, self-contained ATAC helper with a stable output contract."""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import shutil
import subprocess
import sys
from pathlib import Path


def write_summary(output: Path, outputs: list[dict], stats: dict, warnings: list[str]) -> None:
    (output / "summary.json").write_text(json.dumps({"tool": "atac-tools", "version": "0.9.0", "status": "success", "outputs": outputs, "stats": stats, "warnings": warnings}, ensure_ascii=False, indent=2) + "\n")


def run_tss(args: argparse.Namespace, output: Path) -> None:
    opener = gzip.open if str(args.input).endswith(".gz") else open
    result = output / "tss.bed.gz"
    stats = {"processed_lines": 0, "tss_extracted": 0, "skipped_comments": 0, "skipped_invalid": 0, "feature": args.feature}
    with opener(args.input, "rt", encoding="utf-8", errors="replace") as source, gzip.open(result, "wt", encoding="utf-8") as destination:
        for line in source:
            stats["processed_lines"] += 1
            if line.startswith("#"):
                stats["skipped_comments"] += 1
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 9 or fields[2] != args.feature or fields[6] not in {"+", "-"}:
                stats["skipped_invalid"] += 1
                continue
            try:
                start, end = int(fields[3]), int(fields[4])
            except ValueError:
                stats["skipped_invalid"] += 1
                continue
            position = start - 1 if fields[6] == "+" else end - 1
            if position < 0:
                stats["skipped_invalid"] += 1
                continue
            destination.write(f"{fields[0]}\t{position}\t{position + 1}\t.\t0\t{fields[6]}\n")
            stats["tss_extracted"] += 1
    write_summary(output, [{"path": result.name, "type": "bed"}], stats, [])


def load_manifest(path: Path) -> tuple[list[str], list[Path]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        if not reader.fieldnames or not {"sample_id", "bam"}.issubset(reader.fieldnames):
            raise ValueError("matrix manifest must be a TSV with sample_id and bam headers")
        rows = list(reader)
    if not rows:
        raise ValueError("matrix manifest has no samples")
    names = [row["sample_id"].strip() for row in rows]
    bams = [Path(row["bam"].strip()) for row in rows]
    if not all(names) or len(set(names)) != len(names):
        raise ValueError("sample_id values must be non-empty and unique")
    missing = [str(path) for path in bams if not path.is_file()]
    if missing:
        raise ValueError("BAM file(s) not found: " + ", ".join(missing))
    return names, bams


def run_matrix(args: argparse.Namespace, output: Path) -> None:
    if not args.peaks:
        raise ValueError("--peaks is required for --operation matrix")
    peaks = Path(args.peaks)
    if not peaks.is_file():
        raise ValueError(f"peaks file not found: {peaks}")
    if shutil.which("bedtools") is None:
        raise RuntimeError("bedtools is not installed; run check_env.sh --operation matrix")
    names, bams = load_manifest(Path(args.input))
    raw = output / "multicov.raw.tsv"
    matrix = output / "peak_counts.tsv"
    command = ["bedtools", "multicov", "-bams", *map(str, bams), "-bed", str(peaks)]
    with raw.open("w", encoding="utf-8") as handle:
        subprocess.run(command, stdout=handle, check=True)
    with raw.open(encoding="utf-8") as source, matrix.open("w", encoding="utf-8") as destination:
        destination.write("chrom\tstart\tend\t" + "\t".join(names) + "\n")
        peak_count = 0
        for line in source:
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 3 + len(names):
                raise ValueError("bedtools multicov emitted an incomplete record")
            destination.write("\t".join(fields[:3] + fields[-len(names):]) + "\n")
            peak_count += 1
    raw.unlink()
    write_summary(output, [{"path": matrix.name, "type": "table"}], {"n_samples": len(names), "n_peaks": peak_count}, [])


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate ATAC TSS BED or peak count matrix")
    parser.add_argument("--operation", required=True, choices=["tss", "matrix"])
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--feature", default="transcript")
    parser.add_argument("--peaks")
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"input file not found: {args.input}")
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        if args.operation == "tss":
            run_tss(args, args.output)
        else:
            run_matrix(args, args.output)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
