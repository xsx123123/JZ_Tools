# 使用手册

环境文件可含常见 Conda 条目，例如 `samtools=1.20`，以及 `pip:` 下的 `package==1.2.3`。目录输入不递归扫描。

```bash
python /workspace/.skills/software-manager/scripts/collect_versions.py --input /workspace/input/environment.yml /workspace/input/envs --output /workspace/output/software-versions
```

默认清单适用于常用 RNA-seq 软件。若要使用自定义清单，提供 `--config`，并按“功能分类 → `name` 与 `package`”的 YAML 结构填写。没有发现 YAML 文件时，请传入实际环境 YAML 或包含它们的目录。
