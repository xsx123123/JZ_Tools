# FastQ Screen 运行手册

先运行：

```bash
bash /workspace/.skills/fastq-screen/scripts/check_env.sh
```

单端示例：

```bash
python /workspace/.skills/fastq-screen/scripts/run_fastq_screen.py \
  --input /workspace/input/sample.fastq.gz \
  --config ref/fastq-screen/fastq_screen.conf \
  --output /workspace/output/fastq-screen --threads 8
```

双端时额外传入 `--mate2 /workspace/input/sample_R2.fastq.gz`。配置和索引由管理员按 `references/provisioning.md` 预置；缺失时不要下载或修改配置。结果目录包含 FastQ Screen 原始报告及 `summary.json`。
