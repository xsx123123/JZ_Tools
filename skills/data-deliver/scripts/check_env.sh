#!/usr/bin/env bash
set -euo pipefail
command -v rnaflow-cli >/dev/null || { echo "Missing required command: rnaflow-cli" >&2; exit 1; }
rnaflow-cli --version
