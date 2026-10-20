# 运行环境

| 命令/组件 | 最低版本 | 版本来源与检查 |
| --- | --- | --- |
| `python3` | 3.10 | 平台 Python 镜像；`python3 --version`。 |
| `fastq_screen` | 0.15 | 平台生信工具镜像；`fastq_screen --version`。 |
| `bowtie`、`bowtie2`、`bwa` 或 `minimap2` | 与配置一致 | 平台镜像；由 `check_env.sh` 根据配置检查命令存在。 |

FastQ Screen 是 Perl 工具并依赖预建索引，不适合 vendoring。技能只调用安装态 `fastq_screen`；版本由平台镜像清单固定并以运行时 `--version` 复核。
