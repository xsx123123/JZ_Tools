# 使用手册

清单兼容常见 `md5sum` 文本格式，例如 `d41d8cd98f00b204e9800998ecf8427e  sample.fastq.gz`。相对路径从清单所在目录解析。

```bash
python /workspace/.skills/md5/scripts/verify_manifest.py --input /workspace/input/md5.txt --output /workspace/output/md5-check --threads 4
```

命令以非零状态结束时，先查看 `verification.tsv` 中的 `status`：`MISSING` 表示文件不存在，`FAIL` 表示摘要不同，`ERROR` 表示无法读取。
