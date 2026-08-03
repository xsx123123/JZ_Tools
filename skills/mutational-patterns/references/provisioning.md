# 外部资源供给

## 人类参考基因组 Bioconductor 包

| 资源 | 大小 | 管理员获取方式 | 运行时位置 | 校验 |
|---|---:|---|---|---|
| `BSgenome.Hsapiens.UCSC.hg38` | 大于 512KB | 在分析镜像中通过受控 Bioconductor 镜像安装 | R library path | `Rscript -e 'library(BSgenome.Hsapiens.UCSC.hg38)'` |
| `BSgenome.Hsapiens.UCSC.hg19` | 大于 512KB | 同上 | R library path | `Rscript -e 'library(BSgenome.Hsapiens.UCSC.hg19)'` |

资源由环境管理员预置，不放入技能包，也不要求任务运行时访问网络。
