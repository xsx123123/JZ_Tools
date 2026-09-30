---
name: seqout-mcp
description: Seqout 公共数据库检索 MCP — 完整覆盖 seqout.org API 的 26 个只读工具（GEO/SRA/ENA/GSA 搜索、项目详情、样本清单、编号反查、本体论、统计、下载链接）。当需要在公共组学数据库中查找数据集、解析 GSE/GSM/SRR/PRJNA 编号、获取样本分组信息或 FASTQ 下载链接时，安装并使用本 MCP。
---

# Seqout MCP — 公共数据库检索

Seqout MCP 是对 [seqout.org](https://seqout.org) 公共数据库检索 API 的完整封装，提供 **26 个只读 MCP 工具**，覆盖 GEO / SRA / ENA / GSA 等公共数据库的搜索、项目详情、样本清单、编号解析、本体论查询、统计与下载链接。

源自 CygnusX 平台（`mcp-server/tools/seqout.py`）的独立剥离版，仅依赖 `fastmcp` + `httpx`，无任何平台耦合，可安装到任意 MCP 客户端（Kimi Code / Claude Code / Cursor / Cline 等）。

## 何时使用

- 用户想"找一个某物种某实验类型的公共数据集"（如人类肝癌单细胞数据）
- 用户只给了 GSM/SRR 编号，需要反查所属 GSE/PRJNA 项目
- 需要查看数据集的样本清单、实验分组（处理组/对照组）、样本来源
- 需要获取 FASTQ 下载链接或合并元数据 CSV
- 需要项目引用文献（BibTeX）

## 安装

### 方式一：直接引用本 skill 自带的服务器（推荐）

本目录下的 `seqout_mcp.py` 是独立的单文件服务器。在 MCP 客户端配置中：

```json
{
  "mcpServers": {
    "seqout": {
      "command": "uv",
      "args": [
        "run", "--with", "fastmcp", "--with", "httpx",
        "/home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py"
      ]
    }
  }
}
```

`uv run --with` 会自动创建临时环境安装依赖，无需手动 pip install。无 uv 的环境可改为：

```json
{
  "mcpServers": {
    "seqout": {
      "command": "python3",
      "args": ["/path/to/seqout_mcp.py"],
      "env": { "PATH": "/path/to/venv-with-fastmcp-httpx/bin:$PATH" }
    }
  }
}
```

### 方式二：复制为独立项目

```bash
mkdir seqout-mcp && cd seqout-mcp
cp /home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py .
uv init --no-readme && uv add fastmcp httpx
# 配置 MCP 客户端: "command": "uv", "args": ["run", "seqout_mcp.py"]
```

服务器以 stdio 传输运行，无需任何环境变量和鉴权（seqout.org API 公开只读）。

### 验证安装

配置完成后，在 MCP 客户端中应能看到 26 个 `seqout_*` 工具。命令行快速自检（列出全部工具名）：

```bash
uv run --with fastmcp --with httpx python -c "
import asyncio
from fastmcp import Client
from fastmcp.server import FastMCP
import importlib.util
spec = importlib.util.spec_from_file_location('seqout_mcp', '/home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
tools = asyncio.run(mod.mcp._list_tools())
print('\n'.join(t.name for t in tools))
"
```

## 工具清单（26 个）

### 搜索（4）

| 工具 | 端点 | 用途 |
|---|---|---|
| `seqout_search` | `GET /search` | 跨 GEO/SRA/ENA/GSA 全文搜索项目 |
| `seqout_search_geo` | `GET /search/geo` | 仅搜 GEO（微阵列/单细胞） |
| `seqout_search_sra` | `GET /search/sra` | 仅搜 SRA 测序记录 |
| `seqout_search_structured` | `GET /search/structured` | 按物种+实验类型精确过滤搜索 |

### 项目（4）

| 工具 | 端点 | 用途 |
|---|---|---|
| `seqout_get_project_detail` | `GET /project/{acc}` | 项目详情（实验设计、平台、引用） |
| `seqout_get_project_metadata` | `GET /project/{acc}/metadata` | 项目标题与描述 |
| `seqout_get_project_citation` | `GET /project/{acc}/cite` | BibTeX 引用文献 |
| `seqout_get_project_enriched` | `GET /project/{acc}/enriched` | AI 增强样本元数据（含本体论注释） |

### 实验与样本（7）

| 工具 | 端点 | 用途 |
|---|---|---|
| `seqout_get_experiments` | `GET /project/{study}/experiments` | 列出研究下所有实验 |
| `seqout_get_runs` | `GET /project/{study}/runs` | 列出 FASTQ 下载链接 |
| `seqout_get_run_download` | `GET /run/{run}` | 单个运行的下载链接 |
| `seqout_get_sample_metadata` | `GET /sample/{acc}` | 样本元数据 |
| `seqout_get_sample_detail` | `GET /sample-detail/{acc}` | 样本完整详情 |
| `seqout_get_sample_manifest` | `GET /geo/series/{acc}/samples` | 样本清单（含分组/来源，默认前 30 个） |

### 编号解析（2）

| 工具 | 端点 | 用途 |
|---|---|---|
| `seqout_resolve_accession` | `GET /accession/{acc}/project` | GSM/SRR → 所属 GSE/PRJNA 反查 |
| `seqout_resolve_prj` | `GET /prj/{prj}` | BioProject → 研究级别编号映射 |

### 本体论与统计（6+2）

| 工具 | 端点 | 用途 |
|---|---|---|
| `seqout_get_ontology_term` | `GET /ontology/term` | 查询本体论术语（定义/同义词/父类） |
| `seqout_get_organisms` | `GET /organisms` | 列出所有支持的物种 |
| `seqout_get_common_name` | `GET /common-name` | 物种常用名 |
| `seqout_get_stats_growth` | `GET /stats/growth` | 数据库增长趋势 |
| `seqout_get_organism_totals` | `GET /stats/organism-totals` | 各物种实验总数 |
| `seqout_get_platform_totals` | `GET /stats/platform-totals` | 各测序平台实验总数 |
| `seqout_beacon_info` | `GET /beacon/info` | Beacon 协议元数据 |
| `seqout_beacon_runs` | `GET /beacon/runs` | Beacon 协议浏览运行记录 |

### 下载（2）

| 工具 | 端点 | 用途 |
|---|---|---|
| `seqout_get_download_links` | `GET /project/{study}/runs/download` | TSV 格式下载链接 |
| `seqout_get_metadata_csv` | `GET /project/{study}/metadata/download` | 合并元数据 CSV |

## 典型调用流程

**场景 1：找数据集并查看分组**
1. `seqout_search(query="melanoma single cell", limit=3)` → 拿到 GSE 编号
2. `seqout_get_project_detail(accession="GSE151530")` → 了解实验设计
3. `seqout_get_sample_manifest(accession="GSE151530", max_samples=30)` → 按 characteristics 筛选目标样本

**场景 2：从样本编号反查**
1. `seqout_resolve_accession(accession="GSM456789")` → 得到所属 GSE
2. `seqout_get_sample_detail(accession="GSM456789")` → 完整样本信息

**场景 3：拿下载链接**
1. `seqout_get_runs(study_accession="GSE123456")` → 全部 SRR + 链接
2. 或 `seqout_get_download_links(study_accession="GSE123456")` → TSV 批量格式

**场景 4：精确搜索**
1. `seqout_search_structured(organism="Homo sapiens", assay="RNA-seq", limit=5)`

## 输出格式与注意事项

- 所有工具返回 JSON 字符串：`{"success": bool, "summary": str, "data": ..., "next_steps"?}`，先检查 `success` 再读 `data`。
- **上下文保护**：搜索类工具默认 `limit=5`，样本清单默认 `max_samples=30`，不要随意调大。
- **速率限制**：触发 429 时 `summary` 会提示，稍后重试即可，不要连续高频调用。
- **全部为只读工具**，无写操作、无破坏性风险。
- 请求超时 15 秒；服务端返回 HTML 错误页时会被识别并报错（而非 JSON 解析崩溃）。
- `limit` 参数由调用方裁剪结果，服务端 `limit` 参数仅传给结构化/Beacon 接口；搜索接口的服务端分页不受 limit 控制。

## 技术要点（维护者向）

- 实现：单文件 `server/seqout_mcp.py`，FastMCP 2.x `@mcp.tool` 装饰器 + httpx 异步客户端。
- 与平台版的差异：去掉 `core.logger`（改无日志）、去掉 `tools.yaml` 注册表和 `_GROUP_REGISTRY`、去掉 `register(mcp, api)` 双注册（平台版 `register()` 会对已装饰函数二次注册，独立版直接用模块内 FastMCP 实例装饰）。
- API 基址 `https://seqout.org/api`，如需指向自建实例改 `BASE_URL` 即可。
- 新增工具：在文件中加 `@mcp.tool` 异步函数，无需其他注册步骤。
