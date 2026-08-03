#!/usr/bin/env python3
"""Unified runner for vendored GO enrichment scripts."""

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent


def required(payload: dict, key: str) -> str:
    value = payload.get(key)
    if not value:
        raise ValueError(f"Manifest field '{key}' is required.")
    return str(value)


def append_if_set(command: list[str], payload: dict, key: str, flag: str) -> None:
    if payload.get(key) is not None:
        command.extend([flag, str(payload[key])])


def command_for(payload: dict, output: Path) -> list[str]:
    mode = payload.get("mode", "single")
    if mode == "single":
        command = ["Rscript", str(SCRIPT_DIR / "go_enricher.r"), "--obo", required(payload, "obo"), "--assoc", required(payload, "assoc"), "--table", required(payload, "table"), "--out_dir", str(output), "--name", str(payload.get("name", "Enrich"))]
        for key, flag in (("cutoff", "--cutoff"), ("gene_col", "--gene_col"), ("padj_col", "--padj_col"), ("lfc_col", "--lfc_col"), ("padj_th", "--padj_th"), ("lfc_th", "--lfc_th"), ("gene_regex", "--gene_regex")):
            append_if_set(command, payload, key, flag)
        return command
    if mode == "batch":
        command = [sys.executable, str(SCRIPT_DIR / "deg_enrich_wrapper.py"), "--rscript", str(SCRIPT_DIR / "go_enricher.r"), "--deg_info", required(payload, "deg_info"), "--deg_dir", required(payload, "deg_dir"), "--obo", required(payload, "obo"), "--assoc", required(payload, "assoc"), "--out_dir", str(output), "--lib_type", str(payload.get("lib_type", "RNA"))]
        for key, flag in (("gene_col", "--gene_col"), ("gene_regex", "--gene_regex"), ("cutoff", "--cutoff")):
            append_if_set(command, payload, key, flag)
        return command
    raise ValueError("Unsupported mode. Use 'single' or 'batch'.")


def artifact_list(output: Path) -> list[dict]:
    artifacts = []
    for file_path in sorted(output.rglob("*")):
        if not file_path.is_file() or file_path.name == "summary.json":
            continue
        item = {"path": str(file_path.relative_to(output)), "bytes": file_path.stat().st_size}
        if file_path.suffix.lower() == ".csv":
            try:
                with file_path.open(encoding="utf-8", errors="replace", newline="") as handle:
                    item["rows"] = max(sum(1 for _ in csv.reader(handle)) - 1, 0)
            except OSError:
                pass
        artifacts.append(item)
    return artifacts


def main() -> int:
    parser = argparse.ArgumentParser(description="Run GO enrichment from a JSON manifest.")
    parser.add_argument("--input", required=True, help="JSON manifest containing mode and file paths.")
    parser.add_argument("--output", required=True, help="Directory for enrichment tables and summary.json.")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    payload = {"mode": "invalid-manifest"}
    command: list[str] = []
    return_code = 1
    try:
        payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Input manifest must be a JSON object.")
        command = command_for(payload, output)
        return_code = subprocess.run(command, check=False).returncode
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
    summary = {"status": "success" if return_code == 0 else "failed", "mode": payload["mode"], "command": command, "artifacts": artifact_list(output)}
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
