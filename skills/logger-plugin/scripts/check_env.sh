#!/usr/bin/env bash
set -euo pipefail
command -v snakemake >/dev/null || { echo "Missing required command: snakemake" >&2; exit 1; }
snakemake --version
python3 - <<'PY'
import importlib.util
import sys
if importlib.util.find_spec("snakemake_logger_plugin_rich_loguru") is None:
    sys.stderr.write("Missing installed Python package: snakemake_logger_plugin_rich_loguru\n")
    raise SystemExit(1)
print("snakemake_logger_plugin_rich_loguru: installed")
PY
