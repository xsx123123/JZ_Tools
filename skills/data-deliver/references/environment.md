# 运行环境

| 命令/组件 | 最低版本 | 版本来源与检查 |
| --- | --- | --- |
| `rnaflow-cli` | 由平台交付镜像固定 | `rnaflow-cli --version`；平台交付镜像版本清单。 |
| `python3` | 3.10 | `python3 --version`；平台 Python 镜像。 |

`rnaflow-cli` 是编译型交付客户端，不进入技能包。wrapper 只使用其安装态 `local` 子命令，不执行构建、下载或配置命令。
