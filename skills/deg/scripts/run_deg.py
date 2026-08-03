#!/usr/bin/env python3
"""Unified runner for vendored DEG utilities."""

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent


def read_manifest(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or "mode" not in payload:
        raise ValueError("Input manifest must be a JSON object containing 'mode'.")
    return payload


def require(payload: dict, key: str) -> str:
    value = payload.get(key)
    if not value:
        raise ValueError(f"Manifest field '{key}' is required for mode '{payload['mode']}'.")
    return str(value)


def build_command(payload: dict, output: Path) -> list[str]:
    mode = payload["mode"]
    if mode == "deseq2":
        command = ["Rscript", str(SCRIPT_DIR / "run_deseq2.r"), "--counts", require(payload, "counts"), "--metadata", require(payload, "metadata"), "--pairs", require(payload, "pairs"), "--outdir", str(output)]
        for manifest_key, flag in (("annotation", "--annotation"), ("log_file", "--log_file"), ("lfc", "--lfc"), ("pval", "--pval")):
            if payload.get(manifest_key) is not None:
                command.extend([flag, str(payload[manifest_key])])
        return command
    if mode == "atac-deseq2":
        command = ["Rscript", str(SCRIPT_DIR / "atac_deseq2_pipeline.r"), "--counts", require(payload, "counts"), "--metadata", require(payload, "metadata"), "--pairs", require(payload, "pairs"), "--outdir", str(output)]
        for manifest_key, flag in (("samples", "--samples"), ("count_cutoff", "--count_cutoff"), ("lfc", "--lfc"), ("pval", "--pval"), ("label_col", "--label_col")):
            if payload.get(manifest_key) is not None:
                command.extend([flag, str(payload[manifest_key])])
        return command
    if mode == "distribution":
        command = ["Rscript", str(SCRIPT_DIR / "run_dist.r"), "--metadata", require(payload, "metadata"), "--outdir", str(output)]
        if payload.get("tpm"):
            command.extend(["--tpm", str(payload["tpm"])])
        if payload.get("fpkm"):
            command.extend(["--fpkm", str(payload["fpkm"])])
        if not payload.get("tpm") and not payload.get("fpkm"):
            raise ValueError("Distribution mode requires either 'tpm' or 'fpkm'.")
        for manifest_key, flag in (("log_file", "--log_file"), ("width", "--width"), ("height", "--height")):
            if payload.get(manifest_key) is not None:
                command.extend([flag, str(payload[manifest_key])])
        return command
    if mode == "pheatmap":
        command = ["Rscript", str(SCRIPT_DIR / "run_pheatmap.r"), "--input", require(payload, "matrix"), "--metadata", require(payload, "metadata"), "--outdir", str(output)]
        for manifest_key, flag in (("min_exp", "--min_exp"), ("top_n", "--top_n")):
            if payload.get(manifest_key) is not None:
                command.extend([flag, str(payload[manifest_key])])
        return command
    if mode == "plotly-heatmap":
        command = [sys.executable, str(SCRIPT_DIR / "run_plotly_heatmap.py"), "--input", require(payload, "matrix"), "--metadata", require(payload, "metadata"), "--outdir", str(output)]
        if payload.get("processed"):
            command.append("--processed")
        if payload.get("no_cluster"):
            command.append("--no_cluster")
        if payload.get("top_n") is not None:
            command.extend(["--top_n", str(payload["top_n"])])
        return command
    if mode == "gtf2tsv":
        destination = output / "gene_info.tsv"
        command = [sys.executable, str(SCRIPT_DIR / "gtf2tsv.py"), "--input", require(payload, "gtf"), "--output", str(destination)]
        if payload.get("attributes"):
            command.extend(["--attributes", ",".join(payload["attributes"])])
        if payload.get("column_names"):
            command.extend(["--columns", ",".join(payload["column_names"])])
        if payload.get("keep_version"):
            command.append("--keep-version")
        return command
    raise ValueError("Unsupported mode. Use deseq2, atac-deseq2, distribution, pheatmap, plotly-heatmap, or gtf2tsv.")


def table_rows(path: Path) -> int | None:
    if path.suffix.lower() not in {".csv", ".tsv", ".txt"}:
        return None
    try:
        with path.open(encoding="utf-8", errors="replace", newline="") as handle:
            return max(sum(1 for _ in csv.reader(handle, delimiter="\t" if path.suffix.lower() in {".tsv", ".txt"} else ",")) - 1, 0)
    except OSError:
        return None


def write_summary(output: Path, payload: dict, command: list[str], return_code: int) -> None:
    artifacts = []
    for path in sorted(output.rglob("*")):
        if path.is_file() and path.name != "summary.json":
            item = {"path": str(path.relative_to(output)), "bytes": path.stat().st_size}
            rows = table_rows(path)
            if rows is not None:
                item["rows"] = rows
            artifacts.append(item)
    summary = {"status": "success" if return_code == 0 else "failed", "mode": payload["mode"], "command": command, "artifacts": artifacts}
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a DEG operation from a JSON manifest.")
    parser.add_argument("--input", required=True, help="JSON manifest describing the selected operation and its input files.")
    parser.add_argument("--output", required=True, help="Directory for all generated results and summary.json.")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    try:
        payload = read_manifest(Path(args.input))
        command = build_command(payload, output)
        completed = subprocess.run(command, check=False)
        write_summary(output, payload, command, completed.returncode)
        return completed.returncode
    except (OSError, ValueError, json.JSONDecodeError) as error:
        payload = {"mode": "invalid-manifest"}
        write_summary(output, payload, [], 1)
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
