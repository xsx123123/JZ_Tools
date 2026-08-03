# BLAST Homolog Locus Extraction 使用手册

输入 TSV 的必需列为：`database`、`method`、`query`、`sseqid`、`qstart`、`qend`、`sstart`、`send`、`evalue`、`bitscore`、`qlen`。

```bash
python /workspace/.skills/blast/scripts/extract_homolog_loci.py --input blast_hsps.tsv --output homolog_loci --query queryA --min-cov 50 --top-n 3
```

`--max-gap` 以 bp 计。位点首先按 `(database, query, sseqid, strand)` 分组，再按 subject 坐标合并。若输出为空，降低 `--min-cov` 或核对 query 坐标是否与 `qlen` 属于同一序列长度体系。
