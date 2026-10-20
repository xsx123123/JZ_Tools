#!/usr/bin/env python3
"""Map UniProt accessions from a GAF to an identifier database via UniProt."""
import argparse
import csv
import json
import time
from pathlib import Path


API = "https://rest.uniprot.org/idmapping"


def main():
    parser = argparse.ArgumentParser(description="Map UniProt GAF annotations to target gene identifiers")
    parser.add_argument("--input", required=True, help="Input GAF file")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--to-db", default="Ensembl", choices=["Ensembl", "GeneID", "Ensembl_Genomes"], help="Target identifier database")
    parser.add_argument("--filename", default="mapped_gene_go.tsv", help="Output filename")
    args = parser.parse_args()
    input_path, output_dir = Path(args.input), Path(args.output)
    if not input_path.is_file():
        parser.error(f"input file does not exist: {input_path}")
    try:
        import requests
    except ImportError:
        parser.error("missing runtime dependency: requests; see references/environment.md")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / args.filename
    if output_path.parent != output_dir:
        parser.error("--filename must be a filename, not a path")

    annotations, descriptions = [], {}
    with input_path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not line.strip() or line.startswith("!") or line.startswith("#"):
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) < 10 or not fields[1] or not fields[4].startswith("GO:"):
                continue
            annotations.append((fields[1], fields[4]))
            descriptions[fields[1]] = fields[9] or "NA"
    accessions = sorted({accession for accession, _ in annotations})
    if not accessions:
        raise ValueError("no UniProt accessions with GO identifiers found")
    response = requests.post(f"{API}/run", data={"from": "UniProtKB_AC-ID", "to": args.to_db, "ids": ",".join(accessions)}, timeout=60)
    response.raise_for_status()
    job_id = response.json()["jobId"]
    for _ in range(60):
        status = requests.get(f"{API}/status/{job_id}", timeout=30).json()
        if status.get("jobStatus") == "RUNNING":
            time.sleep(2)
            continue
        if status.get("jobStatus"):
            raise RuntimeError(f"UniProt mapping failed: {status['jobStatus']}")
        break
    result = requests.get(f"{API}/results/{job_id}", params={"format": "tsv", "size": 500}, timeout=60)
    result.raise_for_status()
    mappings = {}
    for row in csv.DictReader(result.text.splitlines(), delimiter="\t"):
        mappings.setdefault(row["From"], []).append(row["To"].split(".")[0])
    mapped, missing = 0, 0
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["Gene_ID", "GO_ID", "Description", "Original_UniProt"])
        for accession, go_id in annotations:
            targets = mappings.get(accession, [])
            if not targets:
                missing += 1
            for target in targets:
                writer.writerow([target, go_id, descriptions[accession], accession])
                mapped += 1
    summary = {"tool": "uniprot_gaf_map", "version": "0.9.0", "status": "success",
               "outputs": [{"path": output_path.name, "type": "table"}],
               "stats": {"input_accessions": len(accessions), "mapped_annotations": mapped, "unmapped_annotations": missing, "target_database": args.to_db},
               "warnings": ["Some annotations had no target mapping"] if missing else []}
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
