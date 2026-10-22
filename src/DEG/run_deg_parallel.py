#!/usr/bin/env python3
"""Run independent DEG contrasts in bounded R processes and merge their results."""

import argparse
import csv
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


STATISTICS = "All_Contrast_DEG_Statistics.csv"


def get_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rscript", default=str(Path(__file__).with_name("run_deseq2.r")))
    parser.add_argument("-c", "--counts", required=True)
    parser.add_argument("-m", "--metadata", required=True)
    parser.add_argument("-p", "--pairs", required=True)
    parser.add_argument("-a", "--annotation")
    parser.add_argument("-o", "--outdir", required=True)
    parser.add_argument("--threads", type=int, default=1, help="Maximum concurrent R processes [default: 1]")
    parser.add_argument("--log-dir", help="Worker logs and failed workspaces [default: OUTDIR/logs]")
    parser.add_argument("--lfc", default="1")
    parser.add_argument("--pval", default="0.05")
    parser.add_argument("--bcv", help="Optional edgeR BCV")
    parser.add_argument("--min-rep", help="Optional edgeR minimum replicates")
    parser.add_argument("-l", "--log_file", default="deseq2.log")
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads must be at least 1")
    return args


def run(args):
    with open(args.pairs, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        if not fields or not {"Control", "Treat"}.issubset(fields):
            raise ValueError("Contrast CSV must contain Control and Treat columns")
        pairs = list(reader)
    if not pairs:
        raise ValueError("Contrast CSV contains no comparisons")
    names = []
    for pair in pairs:
        if not pair["Control"] or not pair["Treat"]:
            raise ValueError("Control and Treat must not be empty")
        name = f'{pair["Treat"]}_vs_{pair["Control"]}'
        if "/" in name or "\\" in name:
            raise ValueError(f"Contrast name cannot contain path separators: {name}")
        names.append(name)
    if len(set(names)) != len(names):
        raise ValueError("Duplicate contrast names would overwrite result files")

    output = Path(args.outdir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    stats_path = output / STATISTICS
    stats_path.unlink(missing_ok=True)
    logs = Path(args.log_dir).resolve() if args.log_dir else output / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    workers = min(args.threads, len(pairs))
    work = Path(tempfile.mkdtemp(prefix=".deg-workers-", dir=logs if args.log_dir else output))
    env = os.environ.copy()
    # Each R process gets one CPU; BLAS/OpenMP must not multiply the allocation.
    for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "BLIS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[key] = "1"
    print(f"Running {len(pairs)} DEG contrasts with {workers} R worker(s)", flush=True)

    def run_batch(index):
        batch = pairs[index::workers]
        pair_file = work / f"pairs_{index + 1:03d}.csv"
        with pair_file.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(batch)
        destination = work / f"worker_{index + 1:03d}"
        command = [
            "Rscript", args.rscript, "--counts", args.counts,
            "--metadata", args.metadata, "--pairs", str(pair_file),
            "--outdir", str(destination), "--lfc", str(args.lfc), "--pval", str(args.pval),
            "--log_file", f"worker_{index + 1:03d}.{Path(args.log_file).name}",
        ]
        for value, flag in ((args.annotation, "--annotation"), (args.bcv, "--bcv"), (args.min_rep, "--min-rep")):
            if value is not None:
                command.extend([flag, str(value)])
        if index:
            command.append("--skip-pca")
        console_log = logs / f"worker_{index + 1:03d}.console.log"
        print(f"Worker {index + 1}: {len(batch)} contrasts; log: {console_log}", flush=True)
        with console_log.open("w", encoding="utf-8") as handle:
            subprocess.run(command, check=True, env=env, stdout=handle, stderr=subprocess.STDOUT)
        print(f"Worker {index + 1} completed", flush=True)
        return destination

    try:
        destinations = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(run_batch, index) for index in range(workers)]
            for future in as_completed(futures):
                destinations.append(future.result())

        rows = {}
        stat_fields = None
        for destination in sorted(destinations):
            with (destination / STATISTICS).open(encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                if stat_fields is None:
                    stat_fields = reader.fieldnames
                elif reader.fieldnames != stat_fields:
                    raise ValueError("Workers produced inconsistent statistics columns")
                for row in reader:
                    rows[row["Contrast"]] = row
        missing = [name for name in names if name not in rows]
        if missing:
            raise ValueError(f"Missing DEG statistics for: {', '.join(missing)}")

        # Publish the completion table last, after every worker has succeeded.
        for destination in sorted(destinations):
            for artifact in destination.iterdir():
                if artifact.name == STATISTICS:
                    continue
                target = logs / artifact.name if artifact.suffix == ".log" else output / artifact.name
                shutil.move(str(artifact), str(target))
        merged = work / STATISTICS
        with merged.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=stat_fields)
            writer.writeheader()
            writer.writerows(rows[name] for name in names)
        merged.replace(stats_path)
    except Exception:
        print(f"DEG failed; worker results retained in {work}; console logs: {logs}", file=sys.stderr)
        raise
    else:
        shutil.rmtree(work)
    print(f"Merged {len(names)} contrasts: {stats_path}", flush=True)


def main():
    try:
        run(get_args())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
