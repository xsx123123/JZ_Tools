# 使用手册

`--input` 是目录而非单个 VCF。脚本只读取目录第一层中扩展名为 `.vcf` 或 `.vcf.gz` 的文件，按文件名字典序处理。含有非 SNV、空 VCF 或无有效 SBS context 的样本可能被底层包拒绝。

端到端命令：

```bash
Rscript /workspace/.skills/mutational-patterns/scripts/mutational_patterns.R --input {vcf目录} --output {输出目录} --genome hg38 --rank 4 --nrun 100
```

常见错误：

- `No VCF files found`：检查目录和扩展名；不要将 VCF 放入更深层目录。
- 参考基因组包缺失：由管理员按 `references/provisioning.md` 预置，不要在任务中联网安装。
- `rank` 大于样本数：降低 `--rank`，或增加样本；该脚本不自动选择 rank。
