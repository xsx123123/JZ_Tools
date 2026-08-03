#!/usr/bin/env python3
"""Merge BLAST HSP rows into strand-aware subject loci."""
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


REQUIRED = {"database", "method", "query", "sseqid", "qstart", "qend", "sstart", "send", "evalue", "bitscore", "qlen"}


def union_coverage(intervals, length):
    merged = []
    for start, end in sorted((min(a, b), max(a, b)) for a, b in intervals):
        if not merged or start > merged[-1][1] + 1:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return round(100 * sum(end - start + 1 for start, end in merged) / length, 2)


def loci_for_rows(rows, max_gap):
    loci, current = [], None
    for row in sorted(rows, key=lambda item: item["s_lo"]):
        if current is None or row["s_lo"] - current["end"] > max_gap:
            if current: loci.append(current)
            current = {"start": row["s_lo"], "end": row["s_hi"], "n_hsp": 1, "sum_bitscore": row["bitscore"], "best_evalue": row["evalue"], "q": [(row["qstart"], row["qend"])], "s": [(row["s_lo"], row["s_hi"])], "qlen": row["qlen"]}
        else:
            current["end"] = max(current["end"], row["s_hi"]); current["n_hsp"] += 1
            current["sum_bitscore"] += row["bitscore"]; current["best_evalue"] = min(current["best_evalue"], row["evalue"])
            current["q"].append((row["qstart"], row["qend"])); current["s"].append((row["s_lo"], row["s_hi"]))
    if current: loci.append(current)
    for locus in loci:
        locus["qcov_union"] = union_coverage(locus.pop("q"), locus["qlen"])
        ranges = sorted(locus.pop("s")); locus["hsp_s_ranges"] = ";".join(f"{a}-{b}" for a, b in ranges)
        locus["hsp_gaps"] = ";".join(str(ranges[index + 1][0] - ranges[index][1] - 1) for index in range(len(ranges) - 1)) or "0"
    return loci


def main():
    parser = argparse.ArgumentParser(description="Merge BLAST HSPs into homolog loci")
    parser.add_argument("--input", required=True, help="Tab-separated HSP table")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--query", help="Restrict to one query identifier")
    parser.add_argument("--method", help="Restrict to one search method")
    parser.add_argument("--max-gap", type=int, default=10000, help="Maximum subject-coordinate gap to merge")
    parser.add_argument("--min-cov", type=float, default=0.0, help="Minimum union query coverage percentage")
    parser.add_argument("--top-n", type=int, default=0, help="Keep top loci per database/query; zero keeps all")
    parser.add_argument("--global-top-n", type=int, default=0, help="Keep top loci globally; zero keeps all")
    args = parser.parse_args()
    input_path, output_dir = Path(args.input), Path(args.output)
    if not input_path.is_file(): parser.error(f"input file does not exist: {input_path}")
    output_dir.mkdir(parents=True, exist_ok=True)
    with input_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        if not reader.fieldnames or REQUIRED - set(reader.fieldnames):
            raise ValueError(f"input is missing required columns: {sorted(REQUIRED - set(reader.fieldnames or []))}")
        rows = []
        for record in reader:
            if (args.query and record["query"] != args.query) or (args.method and record["method"] != args.method): continue
            record.update({"qstart": int(record["qstart"]), "qend": int(record["qend"]), "sstart": int(record["sstart"]), "send": int(record["send"]), "qlen": int(record["qlen"]), "evalue": float(record["evalue"]), "bitscore": float(record["bitscore"])})
            record["s_lo"], record["s_hi"] = min(record["sstart"], record["send"]), max(record["sstart"], record["send"])
            record["strand"] = "+" if record["sstart"] <= record["send"] else "-"; rows.append(record)
    groups = defaultdict(list)
    for row in rows: groups[(row["database"], row["query"], row["sseqid"], row["strand"])].append(row)
    records = []
    for (database, query, sseqid, strand), group in groups.items():
        for locus in loci_for_rows(group, args.max_gap):
            locus.update({"database": database, "query": query, "sseqid": sseqid, "strand": strand, "method": group[0]["method"], "locus_start": locus.pop("start"), "locus_end": locus.pop("end")})
            locus["locus_len"] = locus["locus_end"] - locus["locus_start"] + 1
            if locus["qcov_union"] >= args.min_cov: records.append(locus)
    records.sort(key=lambda item: (item["database"], item["query"], -item["sum_bitscore"]))
    ranks = defaultdict(int)
    for record in records: ranks[(record["database"], record["query"])] += 1; record["rank"] = ranks[(record["database"], record["query"])]
    if args.top_n > 0: records = [record for record in records if record["rank"] <= args.top_n]
    if args.global_top_n > 0: records = sorted(records, key=lambda item: (-item["sum_bitscore"], -item["qcov_union"]))[:args.global_top_n]
    fields = ["database", "method", "query", "sseqid", "strand", "locus_start", "locus_end", "locus_len", "n_hsp", "qcov_union", "sum_bitscore", "best_evalue", "hsp_s_ranges", "hsp_gaps", "rank"]
    table = output_dir / "loci_summary.tsv"
    with table.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter="\t", extrasaction="ignore"); writer.writeheader(); writer.writerows(records)
    summary = {"tool": "extract_homolog_loci", "version": "0.9.0", "status": "success", "outputs": [{"path": table.name, "type": "table"}], "stats": {"input_hsps": len(rows), "loci": len(records), "min_coverage": args.min_cov}, "warnings": ["No loci passed the filters"] if not records else []}
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__": main()
