#!/usr/bin/env python3
"""Merge and filter rMATS JC event tables."""
import argparse, csv, json
from pathlib import Path

EVENTS = ("SE", "MXE", "A3SS", "A5SS", "RI")
def number(value):
    try: return float(value)
    except (TypeError, ValueError): return None
def reads(row):
    total = 0.0
    for key, value in row.items():
        if "IJC" in key or "SJC" in key:
            for item in (value or "").split(","):
                parsed = number(item.strip())
                if parsed is not None: total += parsed
    return total
def comparison_name(folder):
    return folder.parent.name if folder.name in {"tmp", "split_dot_rmats"} else folder.name
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True); parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("summary", "details"), default="details")
    parser.add_argument("--fdr", type=float, default=.05); parser.add_argument("--psi", type=float, default=.1); parser.add_argument("--min-reads", type=int, default=10)
    args = parser.parse_args()
    if not args.input.is_dir(): parser.error(f"input directory not found: {args.input}")
    roots = sorted({file.parent for file in args.input.rglob("SE.MATS.JC.txt")})
    if not roots: parser.error("no directory containing SE.MATS.JC.txt was found")
    summary_rows, details, retained = [], [], 0
    for root in roots:
        name = comparison_name(root)
        for event in EVENTS:
            table = root / f"{event}.MATS.JC.txt"
            if not table.is_file(): continue
            with table.open(encoding="utf-8", errors="replace", newline="") as handle: rows = list(csv.DictReader(handle, delimiter="\t"))
            paired = any((row.get("FDR") or "").strip() for row in rows)
            up = down = total = 0
            for row in rows:
                if reads(row) < args.min_reads: continue
                difference = number(row.get("IncLevelDifference"))
                if paired:
                    fdr = number(row.get("FDR"))
                    if fdr is None or difference is None or fdr >= args.fdr or abs(difference) <= args.psi: continue
                total += 1
                if paired and difference > 0: up += 1
                elif paired and difference < 0: down += 1
                record = {"Comparison":name,"EventType":event,**row}; details.append(record)
            summary_rows.append({"Comparison":name,"EventType":event,"Total":total,"Up":up,"Down":down})
            retained += total
    args.output.mkdir(parents=True, exist_ok=True)
    target = "rmats_summary.tsv" if args.mode == "summary" else "rmats_details.tsv"
    rows = summary_rows if args.mode == "summary" else details
    fields = (sorted({key for row in rows for key in row}) if args.mode == "details" and rows else list(rows[0]) if rows else ["Comparison","EventType","Total","Up","Down"] if args.mode == "summary" else ["Comparison","EventType"])
    with (args.output / target).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", extrasaction="ignore"); writer.writeheader(); writer.writerows(rows)
    output = {"tool":"rmats","version":"0.9.0","status":"success","outputs":[{"path":target,"type":"table"}],"stats":{"comparison_directories":len(roots),"retained_events":retained,"mode":args.mode,"fdr":args.fdr,"psi":args.psi,"min_reads":args.min_reads},"warnings":[]}
    (args.output / "summary.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__": main()
