---
name: seqout-mcp
description: Search public omics datasets through seqout.org, resolve GSE/GSM/SRR/PRJ accessions, inspect sample metadata, and retrieve run download links.
---

# Seqout MCP

Standalone Python MCP server with 26 read-only tools for GEO/SRA/ENA/GSA search, project and sample inspection, accession resolution, ontology, statistics, Beacon metadata, and downloads.

## Setup

Requires Python 3.10+. FastMCP is pinned to 3.1 for stdio compatibility, with a buffered bridge for Python 3.13 pipes. Install from this directory with `pip install .`, then run `seqout-mcp`. Cherry Studio and other MCP clients should use STDIO. PyPI configuration uses `command: "uvx"`, `args: ["seqout-mcp"]`; before publication use `args: ["--from", "git+https://github.com/xsx123123/JZ_Tools.git#subdirectory=src/seqout-mcp", "seqout-mcp"]`. Local development uses `command: "uv"`, `args: ["--directory", "<checkout>/src/seqout-mcp", "run", "seqout-mcp"]`.

Environment variables: `SEQOUT_BASE_URL` defaults to `https://seqout.org/api`; `SEQOUT_API_KEY` is optional; `SEQOUT_TIMEOUT` defaults to 30 seconds and is capped at 30; `SEQOUT_LOG_LEVEL` defaults to WARNING. Logs are written only to stderr.

## Tool Groups

The 26 tools are grouped without overlap:

- Search (4): `seqout_search`, `seqout_search_geo`, `seqout_search_sra`, `seqout_search_structured`.
- Project (4): project detail, metadata, citation, and enriched metadata.
- Studies and runs (3): experiments, runs, and single-run download lookup.
- Samples (3): sample metadata, full sample detail, and GEO sample manifest.
- Accession resolution (2): accession-to-project lookup and BioProject mapping.
- Ontology and statistics (6): ontology term, organisms, common name, growth, organism totals, and platform totals.
- Beacon (2): Beacon info and default run query.
- Bulk downloads (2): study run links and merged metadata CSV.

## Query Guidance

- Use `seqout_search` for broad discovery and `seqout_search_structured` for filters. Structured filters include `organism`, `library_strategy`, `assay_l1`, and `assay_l2`; common library strategies include `RNA-Seq`, `WGS`, `ChIP-Seq`, and `scRNA-Seq`.
- Search results include `total`, `took_ms`, and `next_cursor`. Pass `next_cursor` as `cursor` to continue where supported; results are limited to at most 20 entries per response.
- Experiment, run, and download tools resolve GSE identifiers automatically to a supported study accession. GSM sample metadata is fetched through the sample-detail route.
- `seqout_get_stats_growth` accepts `projects`, `experiments`, or `bases` as `mode`.
- `seqout_beacon_runs` currently performs the server's default query and does not accept pagination parameters.
- Unpaginated collections are capped at 20 entries with a total count; results larger than 10 KB are truncated with an explicit marker. API errors distinguish invalid parameters, missing identifiers, server faults, timeout, network failure, empty responses, and non-JSON base URL responses.
