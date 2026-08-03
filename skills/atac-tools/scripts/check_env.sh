#!/usr/bin/env bash
set -euo pipefail

operation="${2:-all}"
if [[ "${1:-all}" != "--operation" && "${1:-all}" != "all" ]]; then
  echo "Usage: check_env.sh [--operation tss|matrix]" >&2
  exit 2
fi

command -v python3 >/dev/null || { echo "Missing required command: python3" >&2; exit 1; }
python3 --version
if [[ "$operation" == "matrix" || "$operation" == "all" ]]; then
  command -v bedtools >/dev/null || { echo "Missing required command: bedtools (requires multicov)" >&2; exit 1; }
  bedtools --version
fi
