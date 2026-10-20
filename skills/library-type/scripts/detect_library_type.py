#!/usr/bin/env python3
"""Detect RNA library strandedness from RSeQC infer_experiment output."""
import argparse, json
from pathlib import Path

VALID = {"auto", "fr-firststrand", "fr-secondstrand", "fr-unstranded"}
FIRST = ('"1+-,1-+,2++,2--"', '"+-,-+"')
SECOND = ('"1++,1--,2+-,2-+"', '"++,--"')

def values(path):
    first, second = [], []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        text = raw.strip()
        target = first if any(marker in text for marker in FIRST) else second if any(marker in text for marker in SECOND) else None
        if target is not None:
            try: target.append(float(text.rsplit(":", 1)[1].strip()))
            except (IndexError, ValueError): pass
    return first, second

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--configured-type", default="auto", choices=sorted(VALID))
    args = parser.parse_args()
    if not args.input.is_file(): parser.error(f"input file not found: {args.input}")
    first, second = values(args.input)
    first_avg = sum(first)/len(first) if first else 0.0; second_avg = sum(second)/len(second) if second else 0.0
    detected = "fr-firststrand" if first_avg > .75 else "fr-secondstrand" if second_avg > .75 else "fr-unstranded"
    conflict = args.configured_type != "auto" and args.configured_type != detected
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "library_type.txt").write_text(detected + "\n", encoding="utf-8")
    warning = f"WARNING: configured={args.configured_type}; detected={detected}. Use detected type for downstream analysis.\n" if conflict else f"OK: detected {detected}.\n"
    (args.output / "warning.txt").write_text(warning, encoding="utf-8")
    data = {"tool":"library-type","version":"0.9.0","status":"success","outputs":[{"path":"library_type.txt","type":"text"},{"path":"warning.txt","type":"text"}],"stats":{"detected_type":detected,"firststrand_score":first_avg,"secondstrand_score":second_avg,"conflict":conflict},"warnings":[warning.strip()] if conflict else []}
    (args.output / "summary.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__": main()
