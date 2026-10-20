#!/usr/bin/env python3
"""Run an installed Snakemake logger plugin with a stable result summary."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Snakemake with installed rich-loguru logger")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cores", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--configfile", type=Path)
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"Snakefile not found: {args.input}")
    if args.configfile is not None and not args.configfile.is_file():
        parser.error(f"config file not found: {args.configfile}")
    if args.cores < 1:
        parser.error("--cores must be positive")
    if shutil.which("snakemake") is None:
        print("ERROR: snakemake is not installed; run check_env.sh first", file=sys.stderr)
        return 1
    args.output.mkdir(parents=True, exist_ok=True)
    log_path = args.output / "snakemake.log"
    command = ["snakemake", "--snakefile", str(args.input.resolve()), "--directory", str(args.output.resolve()), "--cores", str(args.cores), "--logger", "rich-loguru"]
    if args.dry_run:
        command.append("--dry-run")
    if args.configfile is not None:
        command.extend(["--configfile", str(args.configfile.resolve())])
    with log_path.open("w", encoding="utf-8") as handle:
        completed = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT)
    if completed.returncode != 0:
        print(f"ERROR: snakemake exited with status {completed.returncode}; inspect {log_path}", file=sys.stderr)
        return completed.returncode
    summary = {"tool": "logger-plugin", "version": "0.9.0", "status": "success", "outputs": [{"path": log_path.name, "type": "log"}], "stats": {"cores": args.cores, "dry_run": args.dry_run, "exit_code": 0}, "warnings": []}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
