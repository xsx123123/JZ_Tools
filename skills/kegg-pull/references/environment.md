# 运行环境

| 命令/组件 | 最低版本 | 版本来源与检查 |
| --- | --- | --- |
| `python3` | 3.10 | 平台 Python 镜像；`python3 --version`。 |
| KEGG REST HTTPS | 可访问 | `check_env.sh` 请求 `https://rest.kegg.jp/info/kegg`。 |

实现仅使用 Python 标准库，不依赖开发态包或构建命令。KEGG REST 的可用性和响应内容由运行时服务决定。
