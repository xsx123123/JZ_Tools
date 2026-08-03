#!/usr/bin/env python3
"""Invoke installed FastQ Screen and write the standard result summary."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run installed fastq_screen with a stable output contract")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--mate2", type=Path)
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--subset", type=int)
    args = parser.parse_args()
    for path in (args.input, args.config, args.mate2):
        if path is not None and not path.is_file():
            parser.error(f"file not found: {path}")
    if args.threads < 1 or args.subset is not None and args.subset < 1:
        parser.error("--threads and --subset must be positive")
    if shutil.which("fastq_screen") is None:
        print("ERROR: fastq_screen is not installed; run check_env.sh first", file=sys.stderr)
        return 1
    args.output.mkdir(parents=True, exist_ok=True)
    command = ["fastq_screen", "--conf", str(args.config), "--outdir", str(args.output), "--threads", str(args.threads)]
    if args.subset is not None:
        command.extend(["--subset", str(args.subset)])
    command.append(str(args.input))
    if args.mate2 is not None:
        command.append(str(args.mate2))
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as error:
        print(f"ERROR: fastq_screen exited with status {error.returncode}", file=sys.stderr)
        return error.returncode or 1
    reports = sorted(args.output.rglob("*_screen.txt"))
    outputs = [{"path": str(path.relative_to(args.output)), "type": "report"} for path in reports]
    outputs.extend({"path": str(path.relative_to(args.output)), "type": "html"} for path in sorted(args.output.rglob("*.html")))
    summary = {"tool": "fastq-screen", "version": "0.9.0", "status": "success", "outputs": outputs, "stats": {"n_text_reports": len(reports), "paired_end": args.mate2 is not None, "threads": args.threads, "subset": args.subset}, "warnings": []}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
