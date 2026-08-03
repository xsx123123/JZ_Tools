#!/usr/bin/env bash
set -euo pipefail
command -v python3 >/dev/null || { echo "Missing required command: python3" >&2; exit 1; }
python3 --version
python3 - <<'PY'
import urllib.request
request = urllib.request.Request("https://rest.kegg.jp/info/kegg", headers={"User-Agent": "OmicHub-kegg-pull/0.9"})
with urllib.request.urlopen(request, timeout=20) as response:
    if response.status != 200:
        raise RuntimeError(f"KEGG REST returned HTTP {response.status}")
print("KEGG REST: reachable")
PY
