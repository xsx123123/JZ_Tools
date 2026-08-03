# jz_tools 技能台账（SKILLS_REGISTRY）

> 本文件记录本仓库脚本 skill 化的全部产出与版本历史。
> 新增模块 skill 化时：先读本表 → 确认无重复/冲突 → 按 `docs/Skill_design.md` 拆分 → 完成后回写本表。

## 技能清单

| skill_id | 名称 | 来源脚本（源仓库路径） | 类型 | 当前版本 | 状态 | 外部数据依赖 | 备注 |
|---|---|---|---|---|---|---|---|
| atac-tools | ATAC 工具集 | `src/ATACTools/tools/` | 可执行型 | 0.9.0 | 待验证 | 无 | GTF TSS BED 与 peaks 计数矩阵。 |
| blast | BLAST Homolog Locus Extraction | `src/blast/extract_homolog_loci.py` | 可执行型 | 0.9.0 | 待验证 | 无 | 仅处理已有 BLAST HSP 表。 |
| data-deliver | 数据交付 | `src/data-deliver/data_deliver/` | 可执行型 | 0.9.0 | 待验证 | 无 | 本地复制、链接与 MD5 交付清单。 |
| deg | deg | `src/DEG/` | 可执行型 | 0.9.0 | 待验证 | 无 | DESeq2、距离、热图与 GTF 转换子操作。 |
| dotplot | dotplot | `src/dotplot/plot_nucmer_dotplot.r` | 可执行型 | 0.9.0 | 待验证 | 无 | 基于 NUCmer 坐标结果绘制 dotplot。 |
| enrichments | enrichments | `src/Enrichments/` | 可执行型 | 0.9.0 | 待验证 | GO OBO 与物种关联表 | 参考数据供给见 `enrichments/references/provisioning.md`。 |
| fastq-screen | FastQ Screen 污染筛查 | `src/fastq_screen/` | 可执行型 | 0.9.0 | 待验证 | FastQ Screen 索引与配置 | 参考库不打包；供给说明见 `fastq-screen/references/provisioning.md`。 |
| gaf2go | GO Term Annotation | `src/GAF2GO/` | 可执行型 | 0.9.0 | 待验证 | GO OBO 本体 | 参考数据供给见 `gaf2go/references/provisioning.md`。 |
| gene-matrix | RSEM Gene Matrix Preparation | `src/gene_matrix/` | 可执行型 | 0.9.0 | 待验证 | 无 | RSEM 矩阵合并与表达矩阵质控。 |
| genome-tools | VCFtools heterozygosity calculator | `src/genome_tools/het/` | 可执行型 | 0.9.0 | 待验证 | 无 | 处理已有 VCFtools 结果。 |
| gffconvert | GFF Feature Table Conversion | `src/GFFconvert/` | 可执行型 | 0.9.0 | 待验证 | 无 | GFF/GTF feature 表转换。 |
| go-annotation | GO Annotation Table Preparation | `src/GO_Annotation/` | 可执行型 | 0.9.0 | 待验证 | UniProt 映射服务（可选） | GAF 提取与 UniProt 映射。 |
| kegg-pull | KEGG 离线注释下载 | `src/KEGG_pull/` | 可执行型 | 0.9.0 | 待验证 | KEGG 网络服务 | 支持构建离线注释资源；网络限制见 `kegg-pull/references/environment.md`。 |
| library-type | RNA library strandedness detector | `src/library_type/` | 可执行型 | 0.9.0 | 待验证 | 无 | 从比对统计检测文库链特异性。 |
| logger-plugin | Snakemake Rich Loguru 日志插件 | `src/logger_plugin/` | 可执行型 | 0.9.0 | 待验证 | 无 | 包装 Snakemake 日志插件运行。 |
| maftools-gistic2 | maftools-gistic2 | `src/maftools_gistic2/` | 可执行型 | 0.9.0 | 待验证 | 无 | 从 GISTIC2 结果提取基因与样本信息。 |
| md5 | MD5 manifest verifier | `src/md5/` | 可执行型 | 0.9.0 | 待验证 | 无 | 校验已有 MD5 manifest。 |
| mutational-patterns | mutational-patterns | `src/MutationalPatterns/` | 可执行型 | 0.9.0 | 待验证 | hg19/hg38 Bioconductor 参考包 | 供给说明见 `mutational-patterns/references/provisioning.md`。 |
| r-plot-library | r-plot-library | `src/R_plot_library/Plot_code/` | 可执行型 | 0.9.0 | 待验证 | 无 | Venn、volcano 与 ATAC UpSet 绘图。 |
| rmats | rMATS event merger | `src/rMATS/merge_rmats_summary.py` | 可执行型 | 0.9.0 | 待验证 | 无 | 合并已有 rMATS 事件表。 |
| scrna-seq | scrna-seq | `src/scRNA-seq/infercnv/` | 可执行型 | 0.9.0 | 待验证 | inferCNV 与 AnnoProbe 资源 | 供给说明见 `scrna-seq/references/provisioning.md`。 |
| software-manager | Conda environment software inventory | `src/software_manager/` | 可执行型 | 0.9.0 | 待验证 | 无 | 解析 Conda/Pip 环境声明。 |
| tissue-specific-genes | tissue-specific-genes | `src/Tissue-specific-genes/` | 可执行型 | 0.9.0 | 待验证 | 无 | TPM、Tau 与扩展 Tau 筛选。 |
| wgcna | wgcna | `src/wgcna/` | 可执行型 | 0.9.0 | 待验证 | 无 | 基于已有 WGCNA RDS 筛选 hub genes。 |

状态取值：待验证（未跑通端到端）/ 已验证（沙盒实测通过）/ 已挂载（已加入 agent skill_ids）/ 已弃用（注明替代者）。

## 未 skill 化的剩余模块

| 源路径 | 说明 | 未做原因 / 计划 |
|---|---|---|
| `src/ATACTools/filter_pe/` | ATAC paired-end filtering 辅助脚本 | 尚未形成独立、参数化的运行入口；后续按输入 BAM 与过滤规则拆分。 |
| `src/ATACTools/idr/` | IDR 一致性分析相关资源 | 依赖上游 peak calling 与受控参考环境；待明确完整输入输出契约后再 skill 化。 |
| `src/data-deliver/RNAFlow_Deliver_Tool/` | RNAFlow 专用交付工具 | 当前 `data-deliver` 覆盖通用本地交付；专用流程待单独评估，避免路由重叠。 |
| `src/fastq_screen/download_genomes/` | FastQ Screen 参考基因组下载/建库 | 属于管理员参考库供给，已在 `fastq-screen/references/provisioning.md` 说明，不作为运行时 skill。 |
| `src/md5/seq_preprocessor/` | FASTA 序列预处理二进制模块 | 输入、输出与运行依赖尚未形成可移植契约；待补 wrapper 后评估。 |
| `src/md5/json_md5_verifier/` | JSON MD5 校验二进制模块 | 与 `md5` 的 manifest 校验职责不同；待明确 JSON schema 后独立 skill 化。 |

## 版本历史

| 日期 | 变更 | 涉及技能 |
|---|---|---|
| 2026-08-03 | 建立首版汇总台账，登记当前已转换的 24 个技能，并记录尚未 skill 化模块。 | 全部已登记技能 |
