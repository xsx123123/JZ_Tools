# 使用手册

输入由 VCFtools `--het` 产生，数据行的第二、三、四列分别是 `O(HOM)`、`E(HOM)`、`N_SITES`。计算为 `Ho=(N_SITES-O(HOM))/N_SITES` 与 `He=1-E(HOM)/N_SITES`。

```bash
python /workspace/.skills/genome-tools/scripts/calculate_heterozygosity.py --input /workspace/input/sample.het --output /workspace/output/heterozygosity
```

若提示没有有效数据行，请确认文件含表头和五列数据；若跳过记录数偏高，请检查分隔符及数值列。
