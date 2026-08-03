# 运行环境

| 命令/组件 | 适用操作 | 最低版本 | 版本来源与检查 |
| --- | --- | --- | --- |
| `python3` | 全部 | 3.10 | 平台 Python 镜像；`python3 --version`。 |
| `bedtools`（含 `multicov`） | `matrix` | 2.30 | 平台生信工具镜像；`bedtools --version`。 |

`tss` 只依赖 Python 标准库。`matrix` 不 vendoring `bedtools`，因为它是系统级 C++ 工具；运行前必须通过 `check_env.sh`。
