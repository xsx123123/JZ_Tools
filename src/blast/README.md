# Extract Homologous Loci from BLAST HSPs

`extract_homolog_loci.py` merges BLAST high-scoring pairs (HSPs) into genomic loci and extracts the matching genomic intervals as FASTA sequences.

It is designed for workflows such as homology discovery, transposable-element analysis, coding-region prediction with miniprot, and downstream phylogenetic analysis.

## Features

- Groups HSPs by `database`, `query`, subject sequence, and strand.
- Merges adjacent HSPs into one locus when their genomic gap is within `--max-gap`.
- Calculates cumulative bitscore, best e-value, HSP details, and non-redundant query coverage.
- Filters and ranks loci by query coverage and cumulative bitscore.
- Extracts loci with configurable flanking bases from genome FASTA files.
- Reverse-complements minus-strand loci automatically.
- Supports local FASTA files and BLAST databases through `blastdbcmd`.
- Uses a Rich-formatted help page when `rich-argparse` is installed, with a standard argparse fallback otherwise.

## Requirements

- Python 3.9 or later
- `pandas`
- `pyfaidx` for extraction from local FASTA files
- Optional: `rich-argparse` for enhanced `--help` output
- Optional: NCBI BLAST+ (`blastdbcmd`) when using `blastdb:` sources

Install Python dependencies:

```bash
python3 -m pip install pandas pyfaidx rich-argparse
```

## Input Files

### HSP table

Pass a tab-separated table with a header through `--table`. The following columns are required:

```text
database  method  query  sseqid  qstart  qend  sstart  send  evalue  bitscore  qlen
```

Coordinates must be BLAST coordinates: 1-based and inclusive. The script determines strand from subject coordinates:

- `sstart <= send`: plus strand
- `sstart > send`: minus strand

### Genome map

Pass a two-column, tab-separated file without a header through `--genome-map`:

```tsv
TAIR10	/data/genomes/TAIR10.fa
HanXRQr2.0-SUNRISE	/data/genomes/HanXRQr2.0.fa
```

The first column must exactly match the `database` column in the HSP table.

For a BLAST database instead of a FASTA file, prefix the second column with `blastdb:`:

```tsv
TAIR10	blastdb:/data/blastdb/TAIR10
```

This mode requires `blastdbcmd` to be available on `PATH`.

## Usage

Display all options:

```bash
python3 extract_homolog_loci.py --help
```

Extract the top three `tblastn` loci for each genome/query pair:

```bash
python3 extract_homolog_loci.py \
  --table all_filtered_hsps.tsv \
  --genome-map genomes.tsv \
  --method tblastn \
  --max-gap 20000 \
  --flank 3000 \
  --min-cov 40 \
  --top-n 3 \
  --outdir loci_out
```

Extract loci for one query only:

```bash
python3 extract_homolog_loci.py \
  --table all_filtered_hsps.tsv \
  --genome-map genomes.tsv \
  --query TnpA \
  --outdir tnpA_loci
```

Keep the top 20 loci across all databases after per-group filtering:

```bash
python3 extract_homolog_loci.py \
  --table all_filtered_hsps.tsv \
  --genome-map genomes.tsv \
  --top-n 5 \
  --global-top-n 20 \
  --outdir global_top_loci
```

## Options

| Option | Description |
| --- | --- |
| `--table TSV` | Required merged BLAST HSP table. |
| `--genome-map TSV` | Required database-to-genome source mapping. |
| `--query NAME` | Process only this query name. |
| `--method METHOD` | Process only `blastn`, `tblastn`, `blastp`, or `blastx`. |
| `--max-gap BP` | Maximum gap between adjacent HSPs merged into one locus. Default: `20000`. |
| `--flank BP` | Bases added to each side of a locus during extraction. Default: `3000`. |
| `--min-cov PCT` | Minimum non-redundant query coverage. Default: `0`. |
| `--top-n N` | Keep top N loci per database/query pair; `0` keeps all. Default: `0`. |
| `--global-top-n N` | Keep top N loci globally after `--top-n`; `0` keeps all. Default: `0`. |
| `--outdir DIR` | Output directory. Default: `loci_out`. |

## Output

The output directory contains:

```text
loci_out/
├── loci_summary.tsv
└── fasta/
    ├── TAIR10__TnpA.fa
    └── HanXRQr2.0-SUNRISE__TnpA.fa
```

### `loci_summary.tsv`

Each row represents one merged locus. Important fields include:

- `database`, `query`, `sseqid`, `strand`: identity and orientation of the locus.
- `locus_start`, `locus_end`, `locus_len`: 1-based inclusive genomic coordinates before flank extension.
- `n_hsp`: number of HSPs merged into the locus.
- `qcov_union`: non-redundant query coverage percentage.
- `sum_bitscore`: sum of HSP bitscores, used for ranking.
- `best_evalue`: lowest e-value among merged HSPs.
- `hsp_s_ranges`, `hsp_q_ranges`, `hsp_gaps`: merged HSP coordinate details.
- `rank`: rank within each `database` + `query` group.
- `global_rank`: global rank when `--global-top-n` is used.

### FASTA headers

FASTA records use headers similar to:

```text
>TAIR10|TnpA|locus1|Chr1:1000-15000(+)|cov92.5|bits1200.0
```

The genomic interval in the header includes the applied flank. Minus-strand records are reverse-complemented, so every output sequence is oriented in the direction of its BLAST match.

## Notes and Limitations

- This script merges HSPs only by genomic distance and strand. It does not require query-coordinate collinearity, so choose `--max-gap` carefully in repeat-rich or rearranged regions.
- `sum_bitscore` is a ranking score. Overlapping HSPs can contribute multiple times to this sum.
- `blastp` results usually reference protein subjects rather than genomic coordinates. Use `blastp` only when `sstart` and `send` legitimately refer to extractable genomic sequence coordinates.
- A locus can appear in `loci_summary.tsv` but be absent from FASTA output if its subject identifier cannot be resolved in the supplied genome source. Check `[WARNING]` and `[PROGRESS]` messages.
- For protein-query hits, a common follow-up workflow is `miniprot -> MAFFT -> trimAl -> IQ-TREE`.
