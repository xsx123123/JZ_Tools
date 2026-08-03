# 外部资源供给

## inferCNV 与基因坐标注释

| 资源 | 大小 | 管理员获取方式 | 运行时位置 | 校验 |
|---|---:|---|---|---|
| inferCNV 运行支持数据 | 大于 512KB | 构建分析镜像时随 `infercnv` 受控安装 | R library path | `Rscript -e 'library(infercnv)'` |
| AnnoProbe 人/鼠基因坐标资源 | 大于 512KB | 构建分析镜像时随 `AnnoProbe` 受控安装或离线导入 | R library path | `Rscript -e 'library(AnnoProbe)'` |

这些资源由环境管理员供给，不进入技能包。脚本不会下载资源；缺失时终止并返回可读错误。
