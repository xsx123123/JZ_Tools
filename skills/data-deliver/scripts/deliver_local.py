#!/usr/bin/env python3
"""Run the installed local delivery client and normalize its summary."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path


def checksum(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Deliver local files through installed rnaflow-cli")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--mode", choices=["copy", "hardlink", "symlink"], default="copy")
    parser.add_argument("--regex")
    parser.add_argument("--threads", type=int)
    args = parser.parse_args()
    if not args.input.is_dir():
        parser.error(f"input directory not found: {args.input}")
    if args.threads is not None and args.threads < 1:
        parser.error("--threads must be positive")
    if shutil.which("rnaflow-cli") is None:
        print("ERROR: rnaflow-cli is not installed; run check_env.sh first", file=sys.stderr)
        return 1
    command = ["rnaflow-cli", "local", "--input", str(args.input), "--output", str(args.output), "--project-id", args.project_id, "--mode", args.mode]
    if args.regex:
        command.extend(["--regex", args.regex])
    if args.threads:
        command.extend(["--threads", str(args.threads)])
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as error:
        print(f"ERROR: rnaflow-cli exited with status {error.returncode}", file=sys.stderr)
        return error.returncode or 1
    if not args.output.is_dir():
        print("ERROR: rnaflow-cli reported success but did not create output directory", file=sys.stderr)
        return 1
    files = sorted(path for path in args.output.rglob("*") if path.is_file() and path.name not in {"summary.json", "all_files.md5"})
    manifest = args.output / "all_files.md5"
    if not manifest.exists():
        with manifest.open("w", encoding="utf-8") as handle:
            for path in files:
                handle.write(f"{checksum(path)}  {path.relative_to(args.output)}\n")
    summary = {"tool": "data-deliver", "version": "0.9.0", "status": "success", "outputs": [{"path": "all_files.md5", "type": "checksum"}], "stats": {"project_id": args.project_id, "mode": args.mode, "n_files": len(files), "total_bytes": sum(path.stat().st_size for path in files)}, "warnings": []}
    (args.output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
