#!/usr/bin/env python3
"""Calculate Ho and He from a VCFtools --het table."""
import argparse, json
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--decimals", type=int, default=6)
    args = parser.parse_args()
    if args.decimals < 0: parser.error("--decimals must be non-negative")
    if not args.input.is_file(): parser.error(f"input file not found: {args.input}")
    lines = [line.strip() for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(lines) < 2: parser.error("input has no data rows")
    args.output.mkdir(parents=True, exist_ok=True)
    result = args.output / "heterozygosity.tsv"
    processed = skipped = 0
    fmt = f".{{}}f".format(args.decimals)
    with result.open("w", encoding="utf-8") as handle:
        handle.write(lines[0] + "\tHo\tHe\n")
        for line in lines[1:]:
            fields = line.split()
            if len(fields) != 5:
                skipped += 1; continue
            try:
                observed_hom = int(fields[1]); expected_hom = float(fields[2]); sites = int(fields[3])
                if sites < 0: raise ValueError
            except ValueError:
                skipped += 1; continue
            ho = he = "NA" if sites == 0 else None
            if sites:
                ho = format((sites - observed_hom) / sites, fmt)
                he = format(1 - expected_hom / sites, fmt)
            handle.write(line + f"\t{ho}\t{he}\n")
            processed += 1
    if not processed:
        result.unlink(); parser.error("input has no valid five-column data rows")
    (args.output / "summary.json").write_text(json.dumps({"tool":"genome-tools","version":"0.9.0","status":"success","outputs":[{"path":"heterozygosity.tsv","type":"table"}],"stats":{"processed_rows":processed,"skipped_rows":skipped},"warnings":[]}, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__": main()
