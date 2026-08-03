# ATAC 工具运行手册

先执行环境检查：

```bash
bash /workspace/.skills/atac-tools/scripts/check_env.sh
```

## 生成 TSS BED

```bash
python /workspace/.skills/atac-tools/scripts/run_atac_tools.py \
  --operation tss --input /workspace/input/annotation.gtf \
  --output /workspace/output/tss --feature transcript
```

输出 `tss.bed` 和 `summary.json`。输入必须是可读 GTF/GFF 注释；输出目录会由脚本创建。

## 构建峰计数矩阵

```bash
python /workspace/.skills/atac-tools/scripts/run_atac_tools.py \
  --operation matrix --input /workspace/input/bam-list.txt \
  --peaks /workspace/input/consensus-peaks.bed \
  --output /workspace/output/peak-matrix
```

`bam-list.txt` 每行一个已索引 BAM 路径。环境检查失败时停止并联系管理员配置 `bedtools`。
