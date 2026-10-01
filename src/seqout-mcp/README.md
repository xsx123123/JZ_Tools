# seqout-mcp

`seqout-mcp` 是一个通过 [seqout.org](https://seqout.org) 查询公共组学数据的 MCP Server，提供 26 个只读工具，覆盖 GEO、SRA、ENA、GSA 数据集搜索、项目详情、样本信息、编号反查、统计和下载链接。

它使用 **stdio** 传输：MCP 客户端负责启动进程并通过标准输入/输出通信。普通日志只写入 stderr，不会污染 MCP 协议数据。

## 系统要求

- Python 3.10 或更高版本
- [uv](https://docs.astral.sh/uv/)（推荐）或 pip
- 能够访问 `https://seqout.org/api`
- 一个支持 MCP 的客户端，例如 Cherry Studio、Claude Desktop、Cursor 或 MCP Inspector

## 安装与启动

### 直接从当前目录运行（推荐）

```bash
cd <checkout>/src/seqout-mcp
uv run --project . seqout-mcp
```

首次运行时，uv 会根据 `pyproject.toml` 创建环境并安装依赖。服务启动后会等待 MCP 客户端输入，不会显示交互式提示，这是正常现象。

也可以使用 Python 模块入口：

```bash
uv run --project . python -m seqout_mcp
```

### 安装到当前 Python 环境

```bash
cd <checkout>/src/seqout-mcp
python -m pip install .
seqout-mcp
```

### 从 Git 仓库运行

项目尚未发布到 PyPI 时，可以用 uv 从 Git 子目录运行：

```bash
uvx --from \
  'git+https://github.com/xsx123123/JZ_Tools.git#subdirectory=src/seqout-mcp' \
  seqout-mcp
```

发布到 PyPI 后，最简方式是：

```bash
uvx seqout-mcp
```

## Cherry Studio 配置

在 Cherry Studio 中打开 **设置 → MCP 服务器 → 添加服务器**，类型选择 **STDIO**。

### 本地目录配置

- 命令：`uv`
- 参数：每行填写一个参数

```text
--directory
<checkout>/src/seqout-mcp
run
seqout-mcp
```

- 环境变量：

```text
SEQOUT_BASE_URL=https://seqout.org/api
SEQOUT_TIMEOUT=30
```

对应的 JSON 配置如下：

```json
{
  "mcpServers": {
    "seqout": {
      "command": "uv",
      "args": [
        "--directory",
        "<checkout>/src/seqout-mcp",
        "run",
        "seqout-mcp"
      ],
      "env": {
        "SEQOUT_BASE_URL": "https://seqout.org/api",
        "SEQOUT_TIMEOUT": "30"
      }
    }
  }
}
```

### Git 配置

如果 Cherry Studio 使用 uvx，可以将命令设为 `uvx`，参数逐行填写：

```text
--from
git+https://github.com/xsx123123/JZ_Tools.git#subdirectory=src/seqout-mcp
seqout-mcp
```

如果 Cherry Studio 找不到 `uv` 或 `uvx`，请在客户端设置中启用内置 uv，或者改用本机 uv 的绝对路径。

## MCP Inspector 检测

安装 MCP Inspector 后，可以列出服务提供的工具：

```bash
cd <checkout>/src/seqout-mcp

mcp-inspector --cli \
  uv run --project . seqout-mcp \
  -- \
  --method tools/list \
  --format json
```

注意：服务器启动命令必须写在 Inspector 参数之前，单独的 `--` 用来分隔服务器参数和 Inspector 参数。正常结果应包含 26 个工具，并出现类似日志：

```text
Starting MCP server 'seqout' with transport 'stdio'
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SEQOUT_BASE_URL` | `https://seqout.org/api` | API 根地址，必须包含 `/api` 前缀 |
| `SEQOUT_API_KEY` | 空 | 可选 Bearer Token，适用于启用了鉴权的兼容部署 |
| `SEQOUT_TIMEOUT` | `30` | 单次请求超时秒数，范围会限制在 `0.1` 到 `30` 秒 |
| `SEQOUT_LOG_LEVEL` | `WARNING` | stderr 日志级别，例如 `INFO` 或 `DEBUG` |

如果把 `SEQOUT_BASE_URL` 改成不带 `/api` 的地址，服务端通常会返回 HTML 404 页面，MCP 会提示检查 `/api` 前缀。

## 工具清单

### 搜索

- `seqout_search`：跨 GEO/SRA/ENA/GSA 搜索
- `seqout_search_geo`：搜索 GEO 数据集
- `seqout_search_sra`：搜索 SRA 记录
- `seqout_search_structured`：按物种、实验类型和测序策略过滤

结构化搜索支持 `organism`、`library_strategy`、`assay_l1` 和 `assay_l2`。常用 `library_strategy` 值包括 `RNA-Seq`、`WGS`、`ChIP-Seq` 和 `scRNA-Seq`。

### 项目、实验与下载

- `seqout_get_project_detail`
- `seqout_get_project_metadata`
- `seqout_get_project_citation`
- `seqout_get_project_enriched`
- `seqout_get_experiments`
- `seqout_get_runs`
- `seqout_get_run_download`
- `seqout_get_download_links`
- `seqout_get_metadata_csv`

实验、运行和批量下载工具支持传入 GSE；服务器会先解析为 API 支持的 SRA/BioProject 编号。

### 样本与编号解析

- `seqout_get_sample_metadata`
- `seqout_get_sample_detail`
- `seqout_get_sample_manifest`
- `seqout_resolve_accession`
- `seqout_resolve_prj`

传入 GSM 时，样本元数据会自动使用 `sample-detail` 接口。

### 本体论、统计与 Beacon

- `seqout_get_ontology_term`
- `seqout_get_organisms`
- `seqout_get_common_name`
- `seqout_get_stats_growth`
- `seqout_get_organism_totals`
- `seqout_get_platform_totals`
- `seqout_beacon_info`
- `seqout_beacon_runs`

`seqout_get_stats_growth` 的 `mode` 可选 `projects`、`experiments` 或 `bases`。Beacon 运行查询目前使用服务端默认查询，不接受 `limit` 或 `skip` 参数。

## 常见使用方式

在支持工具调用的模型中，可以直接提出自然语言请求：

```text
搜索人类 RNA-Seq 公共数据集，返回前 5 个。
```

```text
查询 GSE151530 的项目详情和实验列表。
```

```text
查询 GSM4581240 的完整样本信息。
```

```text
查询 Homo sapiens 的常用名。
```

```text
获取 GSE151530 的运行下载链接。
```

搜索响应会保留 `total`、`took_ms` 和 `next_cursor`。需要继续检索时，把上一次返回的 `next_cursor` 作为 `cursor` 传入。普通列表结果默认最多展示 20 条，超过 10 KB 的返回体会被截断并标记 `data_truncated`。

## 返回值和错误

成功响应通常为 JSON 字符串：

```json
{
  "success": true,
  "summary": "结构化搜索结果",
  "data": [],
  "total": 0,
  "took_ms": 12
}
```

错误响应会区分参数错误、编号不存在、限流、服务端故障、超时、网络错误和非 JSON 响应，并在 `next_steps` 中给出处理建议。

## 开发与测试

```bash
cd <checkout>/src/seqout-mcp
uv sync --dev
uv run pytest -q
```

源码位于 `src/seqout_mcp/`，主要模块如下：

- `server.py`：FastMCP 实例、stdio 入口和共享客户端生命周期
- `client.py`：环境变量、HTTP 请求、超时和重试
- `accessions.py`：GSE/GSM/研究编号归一化
- `errors.py`：结构化错误与返回体大小控制
- `parsers.py`：搜索、样本和列表结果解析
- `tools/`：26 个声明式工具定义

## 故障排查

### Inspector 显示 `No servers found in config file`

说明 Inspector 没有识别到目标命令。请确保服务器命令在前，Inspector 参数在 `--` 后：

```bash
mcp-inspector --cli uv run --project . seqout-mcp -- --method tools/list --format json
```

### 显示 `Connection closed`

通常是 MCP 服务进程启动失败。直接运行下面的命令查看根本错误：

```bash
uv run --project . seqout-mcp
```

常见原因是依赖下载失败、`uv` 不在 PATH 中或 Python 版本低于 3.10。

### 服务启动但工具调用失败

先检查：

1. `SEQOUT_BASE_URL` 是否为 `https://seqout.org/api`；
2. 当前机器是否能访问 seqout.org；
3. `SEQOUT_TIMEOUT` 是否过短；
4. 编号是否属于对应类型，例如 GSM 应用于样本工具；
5. 是否把 `assay` 传给了结构化搜索，正确参数是 `library_strategy`、`assay_l1` 或 `assay_l2`。
