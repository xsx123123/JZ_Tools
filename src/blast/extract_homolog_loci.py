#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_homolog_loci.py
=======================

Starting from a merged BLAST HSP table (all_filtered_hsps.tsv), the script:

  1) Merges HSPs into loci by (database, query, scaffold, strand).
     HSPs on the same strand are merged when their gap is <= max_gap.
  2) Calculates each locus's cumulative bitscore and non-redundant query coverage.
  3) Extracts each locus sequence from its corresponding genome FASTA.
     Both ends receive the requested flank; minus-strand loci are reverse-complemented.
  4) Writes:
     - loci_summary.tsv   Detailed locus coordinates for downstream analysis.
     - fasta/             One FASTA per database + query for phylogeny or miniprot.

Required: pandas, pyfaidx
Optional: rich-argparse (renders a richer --help page; falls back to argparse if absent)
  pip install pandas pyfaidx rich-argparse

Example:
  python3 extract_homolog_loci.py \
      --table all_filtered_hsps.tsv \
      --genome-map genomes.tsv \
      --max-gap 20000 \
      --flank 3000 \
      --top-n 3 \
      --outdir loci_out

genomes.tsv format (two-column TSV without a header):
  TAIR10<TAB>/data/genomes/TAIR10.fa
  HanXRQr2.0-SUNRISE<TAB>/data/genomes/HanXRQr2.0.fa
"""

import argparse
import os
import subprocess
import sys
import tempfile

import pandas as pd

try:
    from rich_argparse import ArgumentDefaultsRichHelpFormatter

    HELP_FORMATTER = ArgumentDefaultsRichHelpFormatter
except ImportError:
    HELP_FORMATTER = argparse.ArgumentDefaultsHelpFormatter


# ---------------------------------------------------------------- CLI

def build_parser():
    """Build the command-line parser with optional rich-argparse rendering."""
    p = argparse.ArgumentParser(
        prog="extract_homolog_loci.py",
        description=(
            "Merge BLAST HSPs into genomic loci and extract sequences with flanking bases."
        ),
        epilog=(
            "The input table must contain the database, method, query, sseqid, qstart, "
            "qend, sstart, send, evalue, bitscore, and qlen columns.\n\n"
            "Example:\n"
            "  %(prog)s --table all_filtered_hsps.tsv --genome-map genomes.tsv "
            "--method tblastn --min-cov 40 --top-n 3 --outdir loci_out\n\n"
            "Each genomes.tsv row: database<TAB>/path/to/genome.fa\n"
            "Alternatively, use blastdb:DATABASE_NAME to extract sequences with blastdbcmd."
        ),
        formatter_class=HELP_FORMATTER,
    )

    input_group = p.add_argument_group("Input and scope")
    input_group.add_argument(
        "--table", required=True, metavar="TSV",
        help="Merged BLAST HSP table.",
    )
    input_group.add_argument(
        "--genome-map", required=True, metavar="TSV",
        help="Two-column TSV containing database names and genome FASTA paths.",
    )
    input_group.add_argument(
        "--query", metavar="NAME",
        help="Process only one query, for example TnpA or TE_CACTA.",
    )
    input_group.add_argument(
        "--method", choices=["blastn", "tblastn", "blastp", "blastx"],
        help="Process only one BLAST method.",
    )

    merge_group = p.add_argument_group("Locus merging and extraction")
    merge_group.add_argument(
        "--max-gap", type=int, default=20000, metavar="BP",
        help="Maximum gap between adjacent HSPs in one locus; consider 20000–50000 for large introns.",
    )
    merge_group.add_argument(
        "--flank", type=int, default=3000, metavar="BP",
        help="Number of bases to extract beyond each locus boundary.",
    )

    filter_group = p.add_argument_group("Filtering and ranking")
    filter_group.add_argument(
        "--min-cov", type=float, default=0, metavar="PCT",
        help="Minimum non-redundant query coverage for a locus; 40–60 is typical for protein queries.",
    )
    filter_group.add_argument(
        "--top-n", type=int, default=0, metavar="N",
        help="Keep the top N loci per database + query; 0 keeps all loci.",
    )
    filter_group.add_argument(
        "--global-top-n", type=int, default=0, metavar="N",
        help="After --top-n, keep the top N loci globally by cumulative bitscore; 0 keeps all loci.",
    )

    output_group = p.add_argument_group("Output")
    output_group.add_argument(
        "--outdir", default="loci_out", metavar="DIR",
        help="Output directory containing loci_summary.tsv and fasta/.",
    )
    return p


def parse_args():
    return build_parser().parse_args()


# ---------------------------------------------------------------- Helpers

def union_cov(intervals, qlen):
    """Calculate non-redundant coverage (%) across query coordinate intervals."""
    if not intervals:
        return 0.0
    iv = sorted((min(a, b), max(a, b)) for a, b in intervals)
    merged = [list(iv[0])]
    for lo, hi in iv[1:]:
        if lo <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    cov = sum(hi - lo + 1 for lo, hi in merged)
    return round(100.0 * cov / qlen, 2)


def assign_loci(grp, max_gap):
    """
    Sort HSPs from one (database, query, scaffold, strand) group by subject
    coordinates and merge adjacent HSPs when their gap is <= max_gap.
    Return a list of locus records.
    """
    grp = grp.sort_values("s_lo")
    loci, cur = [], None
    for _, r in grp.iterrows():
        if cur is None or r["s_lo"] - cur["end"] > max_gap:
            if cur is not None:
                loci.append(cur)
            cur = {
                "start": r["s_lo"], "end": r["s_hi"],
                "n_hsp": 1,
                "sum_bitscore": r["bitscore"],
                "best_evalue": r["evalue"],
                "q_intervals": [(r["qstart"], r["qend"])],
                "s_ranges": [(r["s_lo"], r["s_hi"])],
                "q_ranges": [(min(r["qstart"], r["qend"]),
                              max(r["qstart"], r["qend"]))],
                "qlen": r["qlen"],
            }
        else:
            cur["end"] = max(cur["end"], r["s_hi"])
            cur["n_hsp"] += 1
            cur["sum_bitscore"] += r["bitscore"]
            cur["best_evalue"] = min(cur["best_evalue"], r["evalue"])
            cur["q_intervals"].append((r["qstart"], r["qend"]))
            cur["s_ranges"].append((r["s_lo"], r["s_hi"]))
            cur["q_ranges"].append((min(r["qstart"], r["qend"]),
                                    max(r["qstart"], r["qend"])))
    if cur is not None:
        loci.append(cur)
    for lc in loci:
        lc["qcov_union"] = union_cov(lc.pop("q_intervals"), lc["qlen"])
        lc["sum_bitscore"] = round(lc["sum_bitscore"], 1)
        # Build readable HSP details after sorting by genomic coordinates.
        sr = sorted(lc.pop("s_ranges"))
        qr = sorted(lc.pop("q_ranges"))
        lc["hsp_s_ranges"] = ";".join(f"{a}-{b}" for a, b in sr)
        lc["hsp_q_ranges"] = ";".join(f"{a}-{b}" for a, b in qr)
        lc["hsp_gaps"] = ";".join(str(sr[i + 1][0] - sr[i][1] - 1)
                                  for i in range(len(sr) - 1)) or "0"
    return loci


def fasta_seqid_candidates(sseqid):
    seqid = str(sseqid).strip()
    candidates = [seqid]
    first_field = seqid.split()[0]
    candidates.append(first_field)
    if "|" in first_field:
        candidates.extend(
            field for field in first_field.split("|") if field)
    return list(dict.fromkeys(candidates))


def resolve_fasta_seqid(fasta, sseqid):
    for candidate in fasta_seqid_candidates(sseqid):
        if candidate in fasta:
            return candidate
    return None


def blastdbcmd_value(database, sseqid, outfmt, region=None, strand=None):
    for candidate in fasta_seqid_candidates(sseqid):
        command = ["blastdbcmd", "-db", database, "-entry", candidate,
                   "-outfmt", outfmt]
        if region:
            command.extend(["-range", region])
        if strand:
            command.extend(["-strand", strand])
        result = subprocess.run(command, text=True, capture_output=True)
        if result.returncode == 0 and result.stdout.strip():
            return candidate, result.stdout.strip().replace("\n", "")
    return None, None


# ---------------------------------------------------------------- Main workflow

def main():
    args = parse_args()

    # Genome source mapping.
    genome_map = {}
    with open(args.genome_map) as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            db, path = line.split("\t")[:2]
            genome_map[db] = path

    # Read the HSP table.
    df = pd.read_csv(args.table, sep="\t")
    need = {"database", "method", "query", "sseqid", "qstart", "qend",
            "sstart", "send", "evalue", "bitscore", "qlen"}
    missing = need - set(df.columns)
    if missing:
        sys.exit(f"[ERROR] Input table is missing columns: {missing}")

    # Filter by query and/or method.
    if args.query:
        df = df[df["query"] == args.query]
        if df.empty:
            sys.exit(f"[ERROR] No records found for query = {args.query}")
    if args.method:
        df = df[df["method"] == args.method]
        if df.empty:
            sys.exit(f"[ERROR] No records found for method = {args.method}")
    print(f"[INFO] Processing: query={args.query or 'all'} "
          f"method={args.method or 'all'} HSPs={len(df)}")

    # Standardize strand and coordinates; keep sseqid as text.
    df["sseqid"] = df["sseqid"].astype(str)
    df["strand"] = ["+" if a <= b else "-"
                    for a, b in zip(df["sstart"], df["send"])]
    df["s_lo"] = df[["sstart", "send"]].min(axis=1)
    df["s_hi"] = df[["sstart", "send"]].max(axis=1)

    # Merge HSPs into loci.
    records = []
    for (db, query, sid, strand), grp in df.groupby(
            ["database", "query", "sseqid", "strand"]):
        for lc in assign_loci(grp, args.max_gap):
            records.append({
                "database": db, "query": query, "sseqid": sid,
                "strand": strand,
                "locus_start": lc["start"], "locus_end": lc["end"],
                "locus_len": lc["end"] - lc["start"] + 1,
                "n_hsp": lc["n_hsp"],
                "qcov_union": lc["qcov_union"],
                "sum_bitscore": lc["sum_bitscore"],
                "best_evalue": lc["best_evalue"],
                "hsp_s_ranges": lc["hsp_s_ranges"],
                "hsp_q_ranges": lc["hsp_q_ranges"],
                "hsp_gaps": lc["hsp_gaps"],
            })
    loci = pd.DataFrame(records)
    if loci.empty:
        sys.exit("[ERROR] No HSPs are available for locus merging")

    # Sort, filter by coverage, and assign ranks.
    loci = loci.sort_values(
        ["database", "query", "sum_bitscore"],
        ascending=[True, True, False])
    loci = loci[loci["qcov_union"] >= args.min_cov]
    loci["rank"] = loci.groupby(["database", "query"])[
        "sum_bitscore"].rank(method="first", ascending=False).astype(int)
    if args.top_n > 0:
        loci = loci[loci["rank"] <= args.top_n]
    if args.global_top_n > 0:
        loci = (loci.sort_values(
                    ["sum_bitscore", "qcov_union", "database", "rank"],
                    ascending=[False, False, True, True])
                .head(args.global_top_n)
                .copy())
        loci["global_rank"] = range(1, len(loci) + 1)

    method_map = (df.drop_duplicates(["database", "query"])
                    .set_index(["database", "query"])["method"].to_dict())
    loci["method"] = [method_map[(d, q)]
                      for d, q in zip(loci["database"], loci["query"])]

    # Write the locus summary.
    os.makedirs(args.outdir, exist_ok=True)
    fa_dir = os.path.join(args.outdir, "fasta")
    os.makedirs(fa_dir, exist_ok=True)

    summary_path = os.path.join(args.outdir, "loci_summary.tsv")
    loci.to_csv(summary_path, sep="\t", index=False)
    print(f"[OUTPUT] Locus summary: {summary_path} ({len(loci)} loci)")

    # Extract sequences.
    try:
        from pyfaidx import Fasta
    except ImportError:
        sys.exit("[ERROR] pyfaidx is required. Install it with: pip install pyfaidx")

    fa_handles, n_seq = {}, 0
    fasta_files = {}
    for db, db_loci in loci.groupby("database", sort=True):
        if db not in genome_map:
            print(f"[WARNING] {db} is absent from --genome-map; skipping")
            continue
        source = genome_map[db]
        if source.startswith("blastdb:"):
            database = source.removeprefix("blastdb:")
            prepared = []
            with tempfile.NamedTemporaryFile("w", delete=False) as batch:
                batch_path = batch.name
                for _, r in db_loci.iterrows():
                    fasta_seqid = fasta_seqid_candidates(r["sseqid"])[0]
                    lo = max(1, int(r["locus_start"]) - args.flank)
                    hi = int(r["locus_end"]) + args.flank
                    strand = "minus" if r["strand"] == "-" else "plus"
                    batch.write(f"{fasta_seqid}\t{lo}-{hi}\t{strand}\n")
                    prepared.append((r, fasta_seqid, lo, hi))
            try:
                result = subprocess.run(
                    ["blastdbcmd", "-db", database, "-entry_batch", batch_path,
                     "-outfmt", "%s"], text=True, capture_output=True)
            finally:
                os.unlink(batch_path)
            sequences = [line.strip() for line in result.stdout.splitlines()
                         if line.strip()]
            if result.returncode != 0 or len(sequences) != len(prepared):
                sys.exit(
                    f"[ERROR] Batch extraction failed for {db}: expected {len(prepared)} "
                    f"sequences, received {len(sequences)}\n{result.stderr.strip()}")
            extracted = zip(prepared, sequences)
        else:
            fa_handles[db] = Fasta(source)
            fa = fa_handles[db]
            prepared_sequences = []
            for _, r in db_loci.iterrows():
                fasta_seqid = resolve_fasta_seqid(fa, r["sseqid"])
                if fasta_seqid is None:
                    print(f"[WARNING] Sequence {r['sseqid']} was not found in {db}; skipping")
                    continue
                chrom_len = len(fa[fasta_seqid])
                lo = max(1, int(r["locus_start"]) - args.flank)
                hi = min(chrom_len, int(r["locus_end"]) + args.flank)
                seq = fa[fasta_seqid][lo - 1:hi]
                if r["strand"] == "-":
                    seq = seq.reverse.complement
                prepared_sequences.append(((r, fasta_seqid, lo, hi), str(seq)))
            extracted = prepared_sequences

        db_count = 0
        for (r, fasta_seqid, lo, hi), seq in extracted:
            header = (f">{db}|{r['query']}|locus{r['rank']}|"
                      f"{fasta_seqid}:{lo}-{hi}({r['strand']})|"
                      f"cov{r['qcov_union']}|bits{r['sum_bitscore']}")
            key = (db, r["query"])
            if key not in fasta_files:
                path = os.path.join(fa_dir, f"{db}__{r['query']}.fa")
                fasta_files[key] = open(path, "w")
            fasta_files[key].write(f"{header}\n{seq}\n")
            n_seq += 1
            db_count += 1
        print(f"[PROGRESS] {db}: extracted {db_count}/{len(db_loci)} sequences", flush=True)
    for fh in fasta_files.values():
        fh.close()
    print(f"[OUTPUT] Extracted {n_seq} sequences -> {fa_dir}/")
    print("[DONE] For protein-query loci, a typical next workflow is "
          "miniprot -> MAFFT -> trimAl -> IQ-TREE.")


if __name__ == "__main__":
    main()
