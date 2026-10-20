# 运行环境

| 命令/组件 | 最低版本 | 版本来源与检查 |
| --- | --- | --- |
| `snakemake` | 8 | 平台工作流镜像；`snakemake --version`。 |
| `snakemake_logger_plugin_rich_loguru` | 0.3.0 | 平台 Python 环境；`check_env.sh` 的 import 检查。 |
| `python3` | 3.10 | 平台 Python 镜像。 |

Snakemake logger 依赖 Snakemake 插件发现机制，不适合在技能运行时 vendoring 或安装。技能仅调用已安装的 `snakemake` 与已发现插件。
