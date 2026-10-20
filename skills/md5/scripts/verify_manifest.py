#!/usr/bin/env python3
"""Verify an md5sum-style manifest without writing outside --output."""
import argparse, csv, hashlib, json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

def digest(path):
    checksum = hashlib.md5()
    try:
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""): checksum.update(block)
        return checksum.hexdigest(), None
    except OSError as error: return None, str(error)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if args.threads < 1: parser.error("--threads must be at least 1")
    if not args.input.is_file(): parser.error(f"manifest not found: {args.input}")
    entries = []
    for line_number, raw in enumerate(args.input.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        fields = raw.strip().split(maxsplit=1)
        if not raw.strip(): continue
        if len(fields) != 2 or len(fields[0]) != 32:
            parser.error(f"invalid manifest line {line_number}; expected MD5 followed by path")
        entries.append((fields[0].lower(), fields[1].lstrip(" *")))
    if not entries: parser.error("manifest contains no entries")
    def verify(entry):
        expected, name = entry; path = Path(name)
        if not path.is_absolute(): path = args.input.parent / path
        actual, error = digest(path)
        status = "SUCCESS" if actual == expected else "MISSING" if error and not path.exists() else "ERROR" if error else "FAIL"
        return {"path":str(path),"expected_md5":expected,"actual_md5":actual or "","status":status,"error":error or ""}
    with ThreadPoolExecutor(max_workers=args.threads) as executor: rows = list(executor.map(verify, entries))
    args.output.mkdir(parents=True, exist_ok=True)
    with (args.output / "verification.tsv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["path","expected_md5","actual_md5","status","error"], delimiter="\t"); writer.writeheader(); writer.writerows(rows)
    counts = {key:sum(row["status"] == key for row in rows) for key in ("SUCCESS","FAIL","MISSING","ERROR")}
    warnings = ["One or more files did not pass verification."] if sum(counts[key] for key in counts if key != "SUCCESS") else []
    summary = {"tool":"md5","version":"0.9.0","status":"success" if not warnings else "completed_with_failures","outputs":[{"path":"verification.tsv","type":"table"}],"stats":{"total_files":len(rows),**counts},"warnings":warnings}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    if warnings: sys.exit(1)

if __name__ == "__main__": main()
