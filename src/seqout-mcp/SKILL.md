---
name: seqout-mcp
description: Seqout public database search MCP — full coverage of the seqout.org API with 26 read-only tools (GEO/SRA/ENA/GSA search, project details, sample manifest, accession resolution, ontology, statistics, download links). Install and use this MCP whenever you need to find datasets in public omics databases, resolve GSE/GSM/SRR/PRJNA accessions, inspect sample grouping, or obtain FASTQ download links.
---

# Seqout MCP — Public Database Search

Seqout MCP is a complete wrapper around the [seqout.org](https://seqout.org) public database search API, providing **26 read-only MCP tools** covering search across GEO / SRA / ENA / GSA, project details, sample manifests, accession resolution, ontology queries, statistics, and download links.

This is a standalone extraction from the CygnusX platform (`mcp-server/tools/seqout.py`). It depends only on `fastmcp` + `httpx`, has no platform coupling, and can be installed into any MCP client (Kimi Code / Claude Code / Cursor / Cline, etc.).

## When to Use

- The user wants to "find a public dataset for a given organism and assay type" (e.g., human HCC single-cell data)
- The user only provides a GSM/SRR accession and you need to resolve its parent GSE/PRJNA project
- You need a dataset's sample manifest, experimental grouping (treatment vs. control), or sample sources
- You need FASTQ download links or a merged metadata CSV
- You need a project's citation (BibTeX)

## Installation

### Option 1: Reference the bundled server directly (recommended)

`seqout_mcp.py` in this directory is a self-contained single-file server. Configure your MCP client:

```json
{
  "mcpServers": {
    "seqout": {
      "command": "uv",
      "args": [
        "run", "--with", "fastmcp", "--with", "httpx",
        "/home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py"
      ]
    }
  }
}
```

`uv run --with` automatically creates an ephemeral environment with the dependencies — no manual pip install needed. On environments without uv, fall back to:

```json
{
  "mcpServers": {
    "seqout": {
      "command": "python3",
      "args": ["/path/to/seqout_mcp.py"],
      "env": { "PATH": "/path/to/venv-with-fastmcp-httpx/bin:$PATH" }
    }
  }
}
```

### Option 2: Copy it as a standalone project

```bash
mkdir seqout-mcp && cd seqout-mcp
cp /home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py .
uv init --no-readme && uv add fastmcp httpx
# Configure MCP client: "command": "uv", "args": ["run", "seqout_mcp.py"]
```

The server runs over stdio and requires no environment variables or authentication (the seqout.org API is public and read-only).

### Verify Installation

After configuring, your MCP client should show 26 `seqout_*` tools. Quick command-line self-check (lists all tool names):

```bash
uv run --with fastmcp --with httpx python -c "
import asyncio
from fastmcp import Client
from fastmcp.server import FastMCP
import importlib.util
spec = importlib.util.spec_from_file_location('seqout_mcp', '/home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
tools = asyncio.run(mod.mcp._list_tools())
print('\n'.join(t.name for t in tools))
"
```

## Tool Catalog (26)

### Search (4)

| Tool | Endpoint | Purpose |
|---|---|---|
| `seqout_search` | `GET /search` | Full-text project search across GEO/SRA/ENA/GSA |
| `seqout_search_geo` | `GET /search/geo` | GEO only (microarray/single-cell) |
| `seqout_search_sra` | `GET /search/sra` | SRA sequencing records only |
| `seqout_search_structured` | `GET /search/structured` | Exact filtered search by organism + assay type |

### Project (4)

| Tool | Endpoint | Purpose |
|---|---|---|
| `seqout_get_project_detail` | `GET /project/{acc}` | Project details (experimental design, platform, citation) |
| `seqout_get_project_metadata` | `GET /project/{acc}/metadata` | Project title and description |
| `seqout_get_project_citation` | `GET /project/{acc}/cite` | BibTeX citation |
| `seqout_get_project_enriched` | `GET /project/{acc}/enriched` | AI-enriched sample metadata (with ontology annotations) |

### Experiment & Sample (7)

| Tool | Endpoint | Purpose |
|---|---|---|
| `seqout_get_experiments` | `GET /project/{study}/experiments` | List all experiments in a study |
| `seqout_get_runs` | `GET /project/{study}/runs` | List FASTQ download links |
| `seqout_get_run_download` | `GET /run/{run}` | Download link for a single run |
| `seqout_get_sample_metadata` | `GET /sample/{acc}` | Sample metadata |
| `seqout_get_sample_detail` | `GET /sample-detail/{acc}` | Full sample details |
| `seqout_get_sample_manifest` | `GET /geo/series/{acc}/samples` | Sample manifest (grouping/source; first 30 by default) |

### Accession Resolution (2)

| Tool | Endpoint | Purpose |
|---|---|---|
| `seqout_resolve_accession` | `GET /accession/{acc}/project` | GSM/SRR → parent GSE/PRJNA reverse lookup |
| `seqout_resolve_prj` | `GET /prj/{prj}` | BioProject → study-level accession mapping |

### Ontology & Statistics (6+2)

| Tool | Endpoint | Purpose |
|---|---|---|
| `seqout_get_ontology_term` | `GET /ontology/term` | Ontology term lookup (definition/synonyms/parents) |
| `seqout_get_organisms` | `GET /organisms` | List all supported organisms |
| `seqout_get_common_name` | `GET /common-name` | Common name of an organism |
| `seqout_get_stats_growth` | `GET /stats/growth` | Database growth trend |
| `seqout_get_organism_totals` | `GET /stats/organism-totals` | Experiment counts per organism |
| `seqout_get_platform_totals` | `GET /stats/platform-totals` | Experiment counts per sequencing platform |
| `seqout_beacon_info` | `GET /beacon/info` | Beacon protocol metadata |
| `seqout_beacon_runs` | `GET /beacon/runs` | Browse run records via Beacon protocol |

### Download (2)

| Tool | Endpoint | Purpose |
|---|---|---|
| `seqout_get_download_links` | `GET /project/{study}/runs/download` | Download links in TSV format |
| `seqout_get_metadata_csv` | `GET /project/{study}/metadata/download` | Merged metadata CSV |

## Typical Call Flows

**Scenario 1: Find a dataset and inspect grouping**
1. `seqout_search(query="melanoma single cell", limit=3)` → get a GSE accession
2. `seqout_get_project_detail(accession="GSE151530")` → understand the experimental design
3. `seqout_get_sample_manifest(accession="GSE151530", max_samples=30)` → filter target samples by characteristics

**Scenario 2: Reverse lookup from a sample accession**
1. `seqout_resolve_accession(accession="GSM456789")` → get the parent GSE
2. `seqout_get_sample_detail(accession="GSM456789")` → full sample information

**Scenario 3: Get download links**
1. `seqout_get_runs(study_accession="GSE123456")` → all SRR accessions + links
2. Or `seqout_get_download_links(study_accession="GSE123456")` → bulk TSV format

**Scenario 4: Precise search**
1. `seqout_search_structured(organism="Homo sapiens", assay="RNA-seq", limit=5)`

## Output Format & Notes

- Every tool returns a JSON string: `{"success": bool, "summary": str, "data": ..., "next_steps"?}`. Check `success` before reading `data`.
- **Context protection**: search tools default to `limit=5`; sample manifest defaults to `max_samples=30`. Do not increase these casually.
- **Rate limiting**: on HTTP 429 the `summary` will say so — wait and retry; do not hammer the API.
- **All tools are read-only** — no write operations, no destructive risk.
- Request timeout is 15s; HTML error pages from the server are detected and reported (no JSON parse crash).
- The `limit` parameter trims results client-side; it is forwarded to the server only for the structured/Beacon endpoints. Server-side pagination of the search endpoints is not controlled by `limit`.

## Implementation Notes (for maintainers)

- Implementation: single file `seqout_mcp.py`, FastMCP 2.x `@mcp.tool` decorators + httpx async client.
- Differences from the platform version: `core.logger` removed (no logging), `tools.yaml` registry and `_GROUP_REGISTRY` removed, and the `register(mcp, api)` double-registration dropped (the platform's `register()` re-decorates already-decorated functions; the standalone version decorates directly against a module-level FastMCP instance).
- API base URL is `https://seqout.org/api`; change `BASE_URL` to point at a self-hosted instance.
- Adding a tool: just add an `@mcp.tool` async function in the file — no other registration step is required.
