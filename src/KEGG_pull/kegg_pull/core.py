#!/usr/bin/env python3
"""
Download KEGG organism annotations and build offline TSV/GMT resources.

Examples:
    kegg-pull ath -o kegg_annotations
    kegg-pull ath hsa mmu --delay 1
    kegg-pull ath --skip-download
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


KEGG_BASE_URL = "https://rest.kegg.jp"
DEFAULT_USER_AGENT = "jz-tools-kegg-downloader/1.0"

RAW_DOWNLOADS = (
    ("gene", "{org}_gene.list", "list/{org}", True),
    ("pathway", "{org}_pathway.list", "link/pathway/{org}", True),
    ("ko", "{org}_ko.list", "link/ko/{org}", False),
    ("pathway_name", "{org}_pathway_name.list", "list/pathway/{org}", True),
    ("brite", "{org}_brite.txt", "get/br:{org}00001", False),
)

SPECIES_RE = re.compile(r"^[a-z0-9]{2,12}$")
KO_RE = re.compile(r"\bK\d{5}\b")
HTML_TAG_RE = re.compile(r"<[^>]+>")


class KEGGDownloadError(RuntimeError):
    """Raised when a KEGG request cannot be completed."""


def log(message: str) -> None:
    try:
        from .utils.log_utils import get_logger

        active_logger = get_logger()
    except Exception:
        active_logger = None

    if active_logger is None:
        print(message, flush=True)
        return

    if message.startswith("[ERROR]"):
        active_logger.error(message)
    elif message.startswith("[WARN]"):
        active_logger.warning(message)
    else:
        active_logger.info(message)


def normalize_species_code(code: str) -> str:
    org = code.strip().lower()
    if not SPECIES_RE.fullmatch(org):
        raise ValueError(
            f"Invalid KEGG organism code {code!r}; expected lowercase letters/digits, e.g. ath or hsa."
        )
    return org


def build_url(api_path: str) -> str:
    return f"{KEGG_BASE_URL.rstrip('/')}/{api_path.lstrip('/')}"


def fetch_text(url: str, timeout: float, user_agent: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        encoding = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(encoding, errors="replace")


def fetch_with_retries(
    url: str,
    *,
    timeout: float,
    retries: int,
    backoff: float,
    user_agent: str,
) -> str:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return fetch_text(url, timeout=timeout, user_agent=user_agent)
        except urllib.error.HTTPError as exc:
            last_error = exc
            retryable = exc.code in {408, 429, 500, 502, 503, 504}
            if not retryable or attempt == retries:
                break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt == retries:
                break

        sleep_seconds = max(0.0, backoff) ** (attempt - 1)
        sleep_seconds = max(1.0, sleep_seconds)
        log(f"[WARN] Request failed, retrying in {sleep_seconds:.1f}s: {url}")
        time.sleep(sleep_seconds)

    raise KEGGDownloadError(f"Failed to fetch {url}: {last_error}")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def download_file(
    *,
    url: str,
    output: Path,
    timeout: float,
    retries: int,
    backoff: float,
    user_agent: str,
    force: bool,
) -> bool:
    if output.exists() and output.stat().st_size > 0 and not force:
        log(f"[SKIP] {output} exists")
        return False

    log(f"[GET] {url}")
    text = fetch_with_retries(
        url,
        timeout=timeout,
        retries=retries,
        backoff=backoff,
        user_agent=user_agent,
    )
    write_text(output, text)
    size = output.stat().st_size
    if not text.strip():
        log(f"[WARN] {output.name} is empty")
    elif text.strip().lower().startswith("no such data"):
        log(f"[WARN] {output.name} contains KEGG 'no such data' response")
    else:
        log(f"[OK] {output} ({size:,} bytes)")
    return True


def download_organism_list(args: argparse.Namespace) -> set[str]:
    outdir = Path(args.outdir)
    organism_file = outdir / "kegg_organism.list"
    url = build_url("list/organism")
    download_file(
        url=url,
        output=organism_file,
        timeout=args.timeout,
        retries=args.retries,
        backoff=args.backoff,
        user_agent=args.user_agent,
        force=args.force_organism_list,
    )

    codes: set[str] = set()
    with organism_file.open(encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                codes.add(parts[1].strip().lower())
    if not codes:
        raise KEGGDownloadError(f"No organism codes parsed from {organism_file}")
    return codes


def validate_species_codes(species: list[str], args: argparse.Namespace) -> None:
    if args.no_validate or args.skip_download:
        return
    known_codes = download_organism_list(args)
    invalid = [org for org in species if org not in known_codes]
    if invalid:
        joined = ", ".join(invalid)
        raise ValueError(
            f"Unknown KEGG organism code(s): {joined}. "
            "Use --no-validate to bypass this check if KEGG has just added them."
        )


def download_species(org: str, args: argparse.Namespace) -> Path:
    species_dir = Path(args.outdir) / org
    species_dir.mkdir(parents=True, exist_ok=True)

    for _, filename_template, api_template, required in RAW_DOWNLOADS:
        filename = filename_template.format(org=org)
        api_path = api_template.format(org=org)
        url = build_url(api_path)
        output = species_dir / filename
        try:
            download_file(
                url=url,
                output=output,
                timeout=args.timeout,
                retries=args.retries,
                backoff=args.backoff,
                user_agent=args.user_agent,
                force=args.force,
            )
        except KEGGDownloadError:
            if required or not args.keep_going:
                raise
            log(f"[WARN] Optional KEGG file failed and was skipped: {filename}")

        time.sleep(max(0.0, args.delay))

    return species_dir


def read_tsv_pairs(path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    if not path.exists():
        return pairs
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                pairs.append((parts[0].strip(), parts[1].strip()))
    return pairs


def normalize_gene_id(kegg_gene_id: str, org: str) -> str:
    prefix = f"{org}:"
    if kegg_gene_id.startswith(prefix):
        return kegg_gene_id[len(prefix) :]
    if ":" in kegg_gene_id:
        return kegg_gene_id.split(":", 1)[1]
    return kegg_gene_id


def normalize_pathway_id(pathway_id: str) -> str:
    pathway_id = pathway_id.strip()
    if pathway_id.startswith("path:"):
        pathway_id = pathway_id[5:]
    return pathway_id


def normalize_ko_id(ko_id: str) -> str:
    ko_id = ko_id.strip()
    if ko_id.startswith("ko:"):
        ko_id = ko_id[3:]
    return ko_id


def clean_cell(value: object) -> str:
    text = "" if value is None else str(value)
    return " ".join(text.replace("\t", " ").replace("\r", " ").replace("\n", " ").split())


def clean_pathway_name(name: str, keep_species_suffix: bool) -> str:
    cleaned = re.sub(r"\s*\[PATH:[^\]]+\]\s*", "", name).strip()
    if not keep_species_suffix and " - " in cleaned:
        cleaned = cleaned.split(" - ", 1)[0].strip()
    return clean_cell(cleaned)


def clean_brite_label(text: str) -> str:
    text = HTML_TAG_RE.sub("", text)
    text = re.sub(r"\[PATH:[^\]]+\]", "", text)
    text = re.sub(r"^\s*[A-D]?\s*\d{5}\s+", "", text)
    return clean_cell(text)


def parse_gene_list(path: Path, org: str) -> dict[str, dict[str, str]]:
    genes: dict[str, dict[str, str]] = {}
    for kegg_gene_id, description in read_tsv_pairs(path):
        gene_id = normalize_gene_id(kegg_gene_id, org)
        gene_name = ""
        gene_description = description
        if ";" in description:
            gene_name, gene_description = description.split(";", 1)
            gene_name = gene_name.strip()
            gene_description = gene_description.strip()
        genes[gene_id] = {
            "species_code": org,
            "gene_id": gene_id,
            "kegg_gene_id": kegg_gene_id,
            "gene_name": gene_name,
            "description": gene_description,
            "ko_ids": ";".join(sorted(set(KO_RE.findall(description)))),
        }
    return genes


def parse_gene_pathway_links(path: Path, org: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for kegg_gene_id, pathway_id in read_tsv_pairs(path):
        rows.append(
            {
                "species_code": org,
                "gene_id": normalize_gene_id(kegg_gene_id, org),
                "kegg_gene_id": kegg_gene_id,
                "pathway_id": normalize_pathway_id(pathway_id),
            }
        )
    return rows


def parse_gene_ko_links(path: Path, org: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for kegg_gene_id, ko_id in read_tsv_pairs(path):
        rows.append(
            {
                "species_code": org,
                "gene_id": normalize_gene_id(kegg_gene_id, org),
                "kegg_gene_id": kegg_gene_id,
                "ko_id": normalize_ko_id(ko_id),
            }
        )
    return rows


def parse_pathway_names(path: Path, keep_species_suffix: bool) -> dict[str, str]:
    names: dict[str, str] = {}
    for pathway_id, pathway_name in read_tsv_pairs(path):
        normalized = normalize_pathway_id(pathway_id)
        names[normalized] = clean_pathway_name(pathway_name, keep_species_suffix)
    return names


def extract_pathway_id(text: str, org: str) -> str | None:
    org_re = re.escape(org)
    patterns = (
        rf"\[PATH:({org_re}\d{{5}})\]",
        rf"\bpath:({org_re}\d{{5}})\b",
        rf"\b({org_re}\d{{5}})\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    return None


def parse_brite_categories(path: Path, org: str) -> dict[str, dict[str, str]]:
    categories: dict[str, dict[str, str]] = {}
    if not path.exists():
        return categories

    current = {"A": "", "B": "", "C": ""}
    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n")
            match = re.match(r"^([A-D])\s*(.*)$", line)
            if not match:
                continue

            level, payload = match.groups()
            pathway_id = extract_pathway_id(line, org)
            label = clean_brite_label(payload)

            if level == "A":
                current["A"] = label
                current["B"] = ""
                current["C"] = ""
            elif level == "B":
                current["B"] = label
                current["C"] = ""
            elif level == "C":
                if pathway_id:
                    categories[pathway_id] = {
                        "brite_level1": current["A"],
                        "brite_level2": current["B"],
                        "brite_level3": label,
                    }
                else:
                    current["C"] = label
            elif level == "D" and pathway_id:
                categories[pathway_id] = {
                    "brite_level1": current["A"],
                    "brite_level2": current["B"],
                    "brite_level3": current["C"] or label,
                }

    return categories


def ensure_required_raw_files(species_dir: Path, org: str) -> None:
    missing: list[str] = []
    for _, filename_template, _, required in RAW_DOWNLOADS:
        path = species_dir / filename_template.format(org=org)
        if required and not path.exists():
            missing.append(str(path))
    if missing:
        formatted = "\n  ".join(missing)
        raise FileNotFoundError(f"Missing required KEGG raw file(s):\n  {formatted}")


def write_tsv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, object]]) -> int:
    count = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            delimiter="\t",
            lineterminator="\n",
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({key: clean_cell(row.get(key, "")) for key in fieldnames})
            count += 1
    return count


def write_gmt(path: Path, gene_sets: dict[str, tuple[str, list[str]]]) -> int:
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for term_id in sorted(gene_sets):
            term_name, genes = gene_sets[term_id]
            unique_genes = sorted(set(gene for gene in genes if gene))
            if not unique_genes:
                continue
            cells = [clean_cell(term_id), clean_cell(term_name), *unique_genes]
            handle.write("\t".join(cells) + "\n")
            count += 1
    return count


def generate_readme(species_dir: Path, org: str, summary: dict[str, object]) -> None:
    lines = [
        f"# KEGG annotation data for {org}",
        "",
        f"- Generated at: {summary['generated_at_utc']}",
        f"- KEGG REST API: {KEGG_BASE_URL}",
        f"- Genes: {summary['genes']}",
        f"- Gene-pathway links: {summary['gene_pathway_links']}",
        f"- Gene-KO links: {summary['gene_ko_links']}",
        f"- Pathways with genes: {summary['pathways_with_genes']}",
        f"- KO terms with genes: {summary['ko_terms_with_genes']}",
        "",
        "## Raw files",
        "",
        f"- `{org}_gene.list`: `/list/{org}`",
        f"- `{org}_pathway.list`: `/link/pathway/{org}`",
        f"- `{org}_ko.list`: `/link/ko/{org}`",
        f"- `{org}_pathway_name.list`: `/list/pathway/{org}`",
        f"- `{org}_brite.txt`: `/get/br:{org}00001`",
        "",
        "## Derived files",
        "",
        f"- `{org}_kegg.gmt`: pathway gene sets for GSEApy/clusterProfiler/GSEA",
        f"- `{org}_ko.gmt`: KO gene sets",
        f"- `{org}_gene_info.tsv`: gene descriptions and KO annotations",
        f"- `{org}_gene_pathway.tsv`: gene to pathway mapping with names",
        f"- `{org}_gene_ko.tsv`: gene to KO mapping",
        f"- `{org}_pathway_annotation.tsv`: pathway names, BRITE categories, and gene counts",
        f"- `{org}_summary.json`: machine-readable run summary",
        "",
        "## Citation and license note",
        "",
        "KEGG REST API data is provided by KEGG. Check KEGG license terms before commercial use,",
        "and cite KEGG in publications that use these annotations.",
        "",
    ]
    write_text(species_dir / f"README_{org}.md", "\n".join(lines))


def generate_derived_files(org: str, species_dir: Path, args: argparse.Namespace) -> dict[str, object]:
    ensure_required_raw_files(species_dir, org)

    gene_path = species_dir / f"{org}_gene.list"
    pathway_link_path = species_dir / f"{org}_pathway.list"
    ko_link_path = species_dir / f"{org}_ko.list"
    pathway_name_path = species_dir / f"{org}_pathway_name.list"
    brite_path = species_dir / f"{org}_brite.txt"

    genes = parse_gene_list(gene_path, org)
    gene_pathway_rows = parse_gene_pathway_links(pathway_link_path, org)
    gene_ko_rows = parse_gene_ko_links(ko_link_path, org)
    pathway_names = parse_pathway_names(pathway_name_path, args.keep_species_suffix)
    brite_categories = parse_brite_categories(brite_path, org)

    ko_by_gene: dict[str, set[str]] = defaultdict(set)
    for gene_id, gene_info in genes.items():
        for ko_id in gene_info.get("ko_ids", "").split(";"):
            if ko_id:
                ko_by_gene[gene_id].add(ko_id)
    for row in gene_ko_rows:
        if row["ko_id"]:
            ko_by_gene[row["gene_id"]].add(row["ko_id"])

    for gene_id, ko_ids in ko_by_gene.items():
        if gene_id in genes:
            genes[gene_id]["ko_ids"] = ";".join(sorted(ko_ids))

    pathway_to_genes: dict[str, list[str]] = defaultdict(list)
    for row in gene_pathway_rows:
        pathway_to_genes[row["pathway_id"]].append(row["gene_id"])

    ko_to_genes: dict[str, list[str]] = defaultdict(list)
    for row in gene_ko_rows:
        ko_to_genes[row["ko_id"]].append(row["gene_id"])

    enriched_gene_pathway_rows: list[dict[str, object]] = []
    for row in gene_pathway_rows:
        pathway_id = row["pathway_id"]
        gene_id = row["gene_id"]
        enriched = dict(row)
        enriched["pathway_name"] = pathway_names.get(pathway_id, pathway_id)
        enriched["ko_ids"] = ";".join(sorted(ko_by_gene.get(gene_id, set())))
        enriched_gene_pathway_rows.append(enriched)

    gene_info_rows = sorted(genes.values(), key=lambda row: row["gene_id"])
    gene_ko_rows = sorted(gene_ko_rows, key=lambda row: (row["ko_id"], row["gene_id"]))
    enriched_gene_pathway_rows = sorted(
        enriched_gene_pathway_rows,
        key=lambda row: (str(row["pathway_id"]), str(row["gene_id"])),
    )

    pathway_rows: list[dict[str, object]] = []
    for pathway_id in sorted(set(pathway_names) | set(pathway_to_genes)):
        category = brite_categories.get(pathway_id, {})
        genes_in_pathway = sorted(set(pathway_to_genes.get(pathway_id, [])))
        pathway_rows.append(
            {
                "species_code": org,
                "pathway_id": pathway_id,
                "pathway_name": pathway_names.get(pathway_id, pathway_id),
                "brite_level1": category.get("brite_level1", ""),
                "brite_level2": category.get("brite_level2", ""),
                "brite_level3": category.get("brite_level3", ""),
                "gene_count": len(genes_in_pathway),
            }
        )

    pathway_gene_sets = {
        pathway_id: (pathway_names.get(pathway_id, pathway_id), genes_in_pathway)
        for pathway_id, genes_in_pathway in pathway_to_genes.items()
    }
    ko_gene_sets = {
        ko_id: (ko_id, genes_in_ko)
        for ko_id, genes_in_ko in ko_to_genes.items()
        if ko_id
    }

    gene_info_count = write_tsv(
        species_dir / f"{org}_gene_info.tsv",
        ["species_code", "gene_id", "kegg_gene_id", "gene_name", "description", "ko_ids"],
        gene_info_rows,
    )
    gene_pathway_count = write_tsv(
        species_dir / f"{org}_gene_pathway.tsv",
        ["species_code", "gene_id", "kegg_gene_id", "pathway_id", "pathway_name", "ko_ids"],
        enriched_gene_pathway_rows,
    )
    gene_ko_count = write_tsv(
        species_dir / f"{org}_gene_ko.tsv",
        ["species_code", "gene_id", "kegg_gene_id", "ko_id"],
        gene_ko_rows,
    )
    pathway_count = write_tsv(
        species_dir / f"{org}_pathway_annotation.tsv",
        [
            "species_code",
            "pathway_id",
            "pathway_name",
            "brite_level1",
            "brite_level2",
            "brite_level3",
            "gene_count",
        ],
        pathway_rows,
    )
    gmt_count = write_gmt(species_dir / f"{org}_kegg.gmt", pathway_gene_sets)
    ko_gmt_count = write_gmt(species_dir / f"{org}_ko.gmt", ko_gene_sets)

    summary: dict[str, object] = {
        "species_code": org,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "kegg_base_url": KEGG_BASE_URL,
        "genes": len(genes),
        "gene_info_rows": gene_info_count,
        "gene_pathway_links": gene_pathway_count,
        "gene_ko_links": gene_ko_count,
        "pathway_annotation_rows": pathway_count,
        "pathways_with_genes": gmt_count,
        "ko_terms_with_genes": ko_gmt_count,
        "raw_files": {
            key: filename_template.format(org=org)
            for key, filename_template, _, _ in RAW_DOWNLOADS
        },
        "derived_files": {
            "pathway_gmt": f"{org}_kegg.gmt",
            "ko_gmt": f"{org}_ko.gmt",
            "gene_info_tsv": f"{org}_gene_info.tsv",
            "gene_pathway_tsv": f"{org}_gene_pathway.tsv",
            "gene_ko_tsv": f"{org}_gene_ko.tsv",
            "pathway_annotation_tsv": f"{org}_pathway_annotation.tsv",
        },
    }

    write_text(
        species_dir / f"{org}_summary.json",
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
    )
    generate_readme(species_dir, org, summary)

    log(
        "[OK] Built derived files for "
        f"{org}: {gmt_count} pathways, {ko_gmt_count} KO terms, {gene_pathway_count} links"
    )
    return summary


def collect_species(args: argparse.Namespace) -> list[str]:
    codes = list(args.species)
    if args.species_file:
        with Path(args.species_file).open(encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    codes.append(stripped.split()[0])

    if not codes:
        raise ValueError("At least one species code is required.")

    normalized: list[str] = []
    seen: set[str] = set()
    for code in codes:
        org = normalize_species_code(code)
        if org not in seen:
            normalized.append(org)
            seen.add(org)
    return normalized


def run_pipeline(args: argparse.Namespace) -> int:
    species = collect_species(args)
    validate_species_codes(species, args)

    failures: list[tuple[str, Exception]] = []
    for org in species:
        log(f"[INFO] Processing KEGG organism: {org}")
        species_dir = Path(args.outdir) / org
        try:
            if not args.skip_download:
                species_dir = download_species(org, args)
            if not args.raw_only:
                generate_derived_files(org, species_dir, args)
        except Exception as exc:
            failures.append((org, exc))
            log(f"[ERROR] {org}: {exc}")
            if not args.keep_going:
                break

    if failures:
        log("[ERROR] Failed species: " + ", ".join(org for org, _ in failures))
        return 1
    return 0

