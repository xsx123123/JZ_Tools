# Usage

The wrapper parses a NUCmer `.delta` file, filters alignment segments by absolute reference span, then writes one plot and `summary.json`.

```bash
Rscript /workspace/.skills/dotplot/scripts/run_dotplot.R --input alignment.delta --output results --min_length 5000 --flanks 10000 --format png
```

`--min_length` is the primary sensitivity control. If no retained segment remains, lower it gradually. A parser error normally indicates a non-NUCmer input or a truncated delta file. Reverse-orientation segments are blue and forward segments are orange.
