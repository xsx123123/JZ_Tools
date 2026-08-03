#!/usr/bin/env bash
set -euo pipefail

config=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) config="${2:-}"; shift 2 ;;
    *) echo "Usage: check_env.sh --config <fastq_screen.conf>" >&2; exit 2 ;;
  esac
done
command -v fastq_screen >/dev/null || { echo "Missing required command: fastq_screen" >&2; exit 1; }
fastq_screen --version || true
[[ -n "$config" && -f "$config" ]] || { echo "Missing FastQ Screen config: $config" >&2; exit 1; }
for spec in 'BOWTIE:bowtie' 'BOWTIE2:bowtie2' 'BWA:bwa' 'MINIMAP2:minimap2'; do
  key="${spec%%:*}"
  aligner="${spec##*:}"
  if grep -Eqi "^[[:space:]]*${key}[[:space:]]" "$config" && ! command -v "$aligner" >/dev/null; then
    echo "Configured aligner is missing: $aligner" >&2
    exit 1
  fi
done
