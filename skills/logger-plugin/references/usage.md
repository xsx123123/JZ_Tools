# Snakemake 日志插件运行手册

先检查 Snakemake 与日志插件：

```bash
bash /workspace/.skills/logger-plugin/scripts/check_env.sh
```

```bash
python /workspace/.skills/logger-plugin/scripts/run_with_logger.py \
  --input /workspace/input/Snakefile \
  --output /workspace/output/snakemake-log \
  --cores 4 --dry-run
```

移除 `--dry-run` 后执行真实任务。`--configfile` 可传入用户提供的配置文件。wrapper 仅把日志、状态与 `summary.json` 写入输出目录；Snakefile 的产物路径仍应由用户流程自行控制。
