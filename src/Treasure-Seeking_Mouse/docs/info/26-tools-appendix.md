# 附录：26 项标准化组学检索 MCP 工具清单

> **第二项能力：多数据库组学数据发现。** 寻宝鼠围绕公共组学数据建立统一检索入口，覆盖 GEO、SRA、ENA、GSA，并针对不同数据库的字段和返回结构进行统一处理，最终将分散的数据资源转化为科研人员更容易理解的数据集信息。项目目前沉淀 **26 项标准化组学检索能力**，覆盖数据集检索、样本与实验条件筛选、Accession 追踪、跨数据库关联等多类标准化检索任务，并通过 MCP 工具化，可被 Agent 组合调用。

## 一、总览

| 分类 | 工具数 | 说明 |
|------|--------|------|
| 数据集检索 | 4 | 跨库全文检索与按物种/实验类型/测序策略的结构化过滤搜索 |
| 项目详情 | 4 | 项目元数据、摘要设计、BibTeX 引用、本体论增强元数据 |
| 实验与运行 | 4 | 实验列表、运行列表、单运行下载链接、全研究下载链接表 |
| 样本与元数据 | 5 | 样本元数据/详情、GSE 样本清单、合并元数据 CSV、样本归属反查 |
| Accession 追踪 | 1 | BioProject 编号解析到研究级编号（跨库关联） |
| 物种与本体论 | 3 | 支持物种列表、学名↔常用名互查、本体论术语查询 |
| 数据库统计 | 4 | 增长统计、物种实验总数、平台实验总数、Beacon 查询 |
| **合计** | **26** | 全部为只读检索工具，经 MCP（stdio 传输）暴露给 Agent |

**数据通道**：工具统一经由 [seqout.org](https://seqout.org)（定期同步 NCBI GEO/SRA 及 ENA、GSA 等库的镜像服务）取数，对上层屏蔽不同数据库字段与返回结构的差异。

## 二、完整 26 项工具明细

### 1. 数据集检索（4 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 1 | `seqout_search` | 在 GEO/SRA/ENA/GSA 公共数据库中**跨库搜索**组学项目 | `query`（必填）、`limit`、`cursor`（翻页） | `/search` |
| 2 | `seqout_search_geo` | 仅搜索 **GEO 数据集**（表达谱/芯片/RNA-Seq 等研究） | `query`（必填）、`limit`、`cursor` | `/search/geo` |
| 3 | `seqout_search_sra` | 仅搜索 **SRA 测序记录** | `query`（必填）、`limit`、`cursor` | `/search/sra` |
| 4 | `seqout_search_structured` | **结构化过滤搜索**：按物种、实验类型、测序策略筛选 | `organism`、`library_strategy`（RNA-Seq/WGS/ChIP-Seq/scRNA-Seq）、`assay_l1`、`assay_l2`、`limit`、`cursor` | `/search/structured` |

### 2. 项目详情（4 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 5 | `seqout_get_project_detail` | 获取 GEO/SRA 项目详情（标题、摘要、实验设计、样本引用等） | `accession`（如 GSE151530、PRJNA 系列） | `/project/{accession}` |
| 6 | `seqout_get_project_metadata` | 获取项目标题与描述元数据 | `accession` | `/project/{accession}/metadata` |
| 7 | `seqout_get_project_citation` | 获取项目 **BibTeX 引用**信息 | `accession` | `/project/{accession}/cite` |
| 8 | `seqout_get_project_enriched` | 获取带**本体论注释**的增强样本元数据 | `accession` | `/project/{accession}/enriched` |

### 3. 实验与运行（4 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 9 | `seqout_get_experiments` | 列出研究的**实验**列表；支持 GSE（自动解析为 SRA/BioProject 编号） | `study_accession`（GSE 或 SRP/PRJ 编号） | `/project/{study_accession}/experiments` |
| 10 | `seqout_get_runs` | 列出研究的**测序运行**（SRR 编号列表）；支持 GSE 自动解析 | `study_accession` | `/project/{study_accession}/runs` |
| 11 | `seqout_get_run_download` | 获取**单个测序运行**的下载链接 | `run_accession`（SRR 开头） | `/run/{run_accession}` |
| 12 | `seqout_get_download_links` | 获取研究**全部运行的下载链接表**（fastq/sra 直链、大小、MD5）；GEO-only 项目无公开 run 时返回空表说明 | `study_accession` | `/project/{study_accession}/runs/download` |

### 4. 样本与元数据（5 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 13 | `seqout_get_sample_metadata` | 获取**样本元数据**；GSM 编号自动走 sample-detail 通道 | `accession`（GSM/SAMN/SAMD） | `/sample/{accession}` 或 `/sample-detail/{accession}` |
| 14 | `seqout_get_sample_detail` | 获取**完整样本详细信息** | `accession` | `/sample-detail/{accession}` |
| 15 | `seqout_get_sample_manifest` | 获取 GEO 项目（GSE）的**样本清单预览** | `accession`（GSE）、`max_samples`（默认 20） | `/geo/series/{accession}/samples` |
| 16 | `seqout_get_metadata_csv` | 获取研究**合并样本/运行元数据表**（测序策略、平台、样本属性等，CSV） | `study_accession` | `/project/{study_accession}/metadata/download` |
| 17 | `seqout_resolve_accession` | **反查 GSM 或 Run 编号**归属的项目 | `accession`（GSM/SRR 等） | `/accession/{accession}/project` |

### 5. Accession 追踪与跨库关联（1 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 18 | `seqout_resolve_prj` | 将 **BioProject 编号解析到研究级编号**（跨库关联） | `prj_accession`（PRJNA/PRJEB/PRJDB + 数字，如 PRJNA732811） | `/prj/{prj_accession}` |

### 6. 物种与本体论（3 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 19 | `seqout_get_ontology_term` | 查询**本体论术语**及相关信息 | `term`（如 `EFO:0000000` 或名称） | `/ontology/term` |
| 20 | `seqout_get_organisms` | 列出数据库**支持的物种**（最多展示 20 条并保留总数） | 无 | `/organisms` |
| 21 | `seqout_get_common_name` | 查询物种**学名对应的常用名** | `scientific_name`（如 Homo sapiens） | `/common-name` |

### 7. 数据库统计与 Beacon（4 项）

| # | 工具名 | 功能 | 关键参数 | 对应后端接口 |
|---|--------|------|----------|--------------|
| 22 | `seqout_get_stats_growth` | 获取数据库**增长统计** | `mode`（projects / experiments / bases） | `/stats/growth` |
| 23 | `seqout_get_organism_totals` | 获取**每个物种的实验总数**（截断至 20 条） | 无 | `/stats/organism-totals` |
| 24 | `seqout_get_platform_totals` | 获取**平台实验总数**；传 platform 时查询对应过滤选项 | `platform`（可空） | `/stats/platform-totals` 或 `/stats/platform-filters` |
| 25 | `seqout_beacon_info` | 获取 **Beacon 身份和元数据** | 无 | `/beacon/info` |
| 26 | `seqout_beacon_runs` | Beacon **默认运行记录查询**（服务端默认分页，不支持 limit/skip） | 无 | `/beacon/runs` |

## 三、代码位置与实现形态

| 位置 | 说明 |
|------|------|
| `src/seqout-mcp/src/seqout_mcp/tools/search.py` | 检索类工具定义（4 项，`ToolSpec` 声明式注册） |
| `src/seqout-mcp/src/seqout_mcp/tools/project.py` | 项目/实验/运行/下载工具定义（9 项） |
| `src/seqout-mcp/src/seqout_mcp/tools/sample.py` | 样本与编号解析工具定义（5 项） |
| `src/seqout-mcp/src/seqout_mcp/tools/stats.py` | 物种/本体论/统计/Beacon 工具定义（8 项） |
| `src/Treasure-Seeking_Mouse/functions/seqout-chat/index.ts:178-229` | 对话后端以 OpenAI function schema 声明式移植同一套 26 项工具（另有 5 项 NGDC 工具与 1 项九源文献搜索工具，不在本 26 项之内） |

**MCP 工具化方式**：`seqout-mcp` 以 stdio 传输运行（MCP 客户端启动进程、经标准输入/输出通信，普通日志只写 stderr 不污染协议数据）；寻宝鼠应用侧则将同一套工具能力以 OpenAI function schema 移植进对话服务，无需本地运行 Python MCP 进程，LLM tool-calling 可将这 26 项工具自由组合完成多步检索任务（例如：`seqout_search` 找到 GSE → `seqout_get_project_detail` 看设计 → `seqout_get_sample_manifest` 筛样本 → `seqout_get_download_links` 导下载表）。

**统一处理细节**（对上层屏蔽库间差异）：

- **编号自动解析**：GSE 编号在 experiments/runs/download_links/metadata_csv 等工具中自动解析为 SRA/BioProject 编号；GSM 在样本元数据工具中自动切换 sample-detail 通道。
- **统一错误语义**：seqout 为定期同步 NCBI 的镜像库，很新的项目（尤其 PRJNA）尚未同步时返回 404，会明确区分「项目较新未同步」与「项目不存在/编号有误」两种情况；GEO-only 无实验/无 run 的空结果按 `empty` 业务空返回，不计为工具失败。
- **结果规整**：长列表（物种、运行、实验等）统一截断展示 20 条并保留总数；搜索结果支持 `cursor` 翻页。
