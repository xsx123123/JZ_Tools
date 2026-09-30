"""Seqout MCP Server — 独立版

公共数据库检索 MCP：完整覆盖 seqout.org API（GEO/SRA/ENA/GSA 搜索、项目详情、
样本清单、编号解析、本体论查询、统计、下载链接），共 26 个只读工具。

从 CygnusX 平台（mcp-server/tools/seqout.py）剥离，去除平台依赖（core.logger /
tools.yaml 注册表 / CygnusXAPIClient），仅依赖 fastmcp + httpx。

运行方式（stdio，供 MCP 客户端调用）：
    uv run --with fastmcp --with httpx seqout_mcp.py

或直接安装依赖后：
    pip install fastmcp httpx
    python seqout_mcp.py
"""

import json
from typing import Any

import httpx
from fastmcp import FastMCP

BASE_URL = "https://seqout.org/api"

mcp = FastMCP("seqout")


class SeqoutAPIError(Exception):
    """Seqout API 调用异常"""


async def _seqout_request(endpoint: str, params: dict | None = None) -> Any:
    """发送 Seqout API 请求，处理速率限制、超时和非 JSON 响应。"""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(f"{BASE_URL}{endpoint}", params=params)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "").lower()
            if "text/html" in content_type:
                raise SeqoutAPIError(f"服务端返回 HTML 页面：{response.text[:200]}")

            return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise SeqoutAPIError("触发速率限制 (Rate Limit)，请稍后重试")
            raise SeqoutAPIError(f"Seqout API 错误 {e.response.status_code}: {e.response.text[:200]}")
        except httpx.TimeoutException:
            raise SeqoutAPIError("请求超时")
        except json.JSONDecodeError:
            raise SeqoutAPIError("响应解析失败：非 JSON 格式")


def _ok(summary: str, data: Any, next_steps: list[str] | None = None) -> str:
    payload: dict[str, Any] = {"success": True, "summary": summary, "data": data}
    if next_steps:
        payload["next_steps"] = next_steps
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _fail(context: str, e: Exception) -> str:
    return json.dumps({"success": False, "summary": f"{context}：{e}"}, ensure_ascii=False, indent=2)


def _parse_search_response(data: dict | list, limit: int = 5) -> list[dict]:
    if isinstance(data, dict):
        raw_items = data.get("results", data.get("hits", data))
    else:
        raw_items = data
    if not isinstance(raw_items, list):
        return []
    results = []
    for item in raw_items[:limit]:
        results.append({
            "accession": item.get("accession") or item.get("id"),
            "title": item.get("title"),
            "organism": item.get("organism"),
            "sample_count": item.get("samples_count") or item.get("n_samples"),
            "source_db": item.get("database"),
            "summary": (item.get("summary") or item.get("description") or "")[:200] + "...",
        })
    return results


def _parse_samples_response(data: dict | list, limit: int = 30) -> list[dict]:
    if isinstance(data, dict):
        samples_list = data.get("samples", data.get("data", []))
    else:
        samples_list = data
    if not isinstance(samples_list, list):
        return []
    manifest = []
    for s in samples_list[:limit]:
        manifest.append({
            "sample_accession": s.get("accession") or s.get("geo_accession"),
            "title": s.get("title"),
            "characteristics": s.get("characteristics_ch1") or s.get("attributes") or [],
            "source_name": s.get("source_name_ch1") or s.get("source_name"),
        })
    return manifest


# ==================== Search Tools ====================

@mcp.tool
async def seqout_search(query: str, limit: int = 5) -> str:
    """在 GEO/SRA/ENA/GSA 等公共数据库中搜索匹配的组学/转录组/单细胞项目。

    :param query: 检索关键词（如 'CD8 T cell exhaust'、'HCC single cell'、'GSE151530'）
    :param limit: 最多返回的项目数量，推荐 3-5 条，避免上下文膨胀
    """
    try:
        data = await _seqout_request("/search", params={"q": query})
        results = _parse_search_response(data, limit)
        if not results:
            return json.dumps(
                {"success": False, "summary": f"未找到与关键词 '{query}' 相关的项目数据集。"},
                ensure_ascii=False, indent=2,
            )
        return _ok(
            f"找到 {len(results)} 个项目", results,
            ["使用 seqout_get_project_detail 查看项目详情", "使用 seqout_get_sample_manifest 获取样本清单"],
        )
    except Exception as e:
        return _fail("检索公共数据集发生异常", e)


@mcp.tool
async def seqout_search_geo(query: str, limit: int = 5) -> str:
    """仅搜索 GEO 数据库中的微阵列和单细胞数据集。

    :param query: 检索关键词（如 'melanoma'、'single cell'）
    :param limit: 最多返回的项目数量，推荐 3-5 条
    """
    try:
        data = await _seqout_request("/search/geo", params={"q": query})
        results = _parse_search_response(data, limit)
        if not results:
            return json.dumps(
                {"success": False, "summary": f"未在 GEO 中找到与 '{query}' 相关的项目。"},
                ensure_ascii=False, indent=2,
            )
        return _ok(f"GEO 中找到 {len(results)} 个项目", results)
    except Exception as e:
        return _fail("GEO 搜索失败", e)


@mcp.tool
async def seqout_search_sra(query: str, limit: int = 5) -> str:
    """仅搜索 SRA 数据库中的测序运行记录。

    :param query: 检索关键词（如 'human peripheral blood'、'mouse brain'）
    :param limit: 最多返回的项目数量，推荐 3-5 条
    """
    try:
        data = await _seqout_request("/search/sra", params={"q": query})
        results = _parse_search_response(data, limit)
        if not results:
            return json.dumps(
                {"success": False, "summary": f"未在 SRA 中找到与 '{query}' 相关的记录。"},
                ensure_ascii=False, indent=2,
            )
        return _ok(f"SRA 中找到 {len(results)} 条记录", results)
    except Exception as e:
        return _fail("SRA 搜索失败", e)


@mcp.tool
async def seqout_search_structured(organism: str, assay: str, limit: int = 5) -> str:
    """使用元数据过滤器进行结构化搜索，精确匹配物种和实验类型。

    :param organism: 物种名称或 taxon_id（如 'Homo sapiens'、'Mus musculus'、9606）
    :param assay: 实验类型（如 'RNA-seq'、'ChIP-seq'、'ATAC-seq'）
    :param limit: 最多返回的项目数量，推荐 3-5 条
    """
    try:
        params: dict[str, Any] = {"organism": organism}
        if assay:
            params["assay"] = assay
        data = await _seqout_request("/search/structured", params=params)
        results = _parse_search_response(data, limit)
        if not results:
            return json.dumps(
                {"success": False, "summary": f"未找到匹配物种'{organism}'和实验类型'{assay}'的项目。"},
                ensure_ascii=False, indent=2,
            )
        return _ok(f"找到 {len(results)} 个项目", results)
    except Exception as e:
        return _fail("结构化搜索失败", e)


# ==================== Project Tools ====================

@mcp.tool
async def seqout_get_project_detail(accession: str) -> str:
    """获取指定项目（如 GSE151530、PRJNA12345）的详细实验设计、测序平台及文献引用。

    :param accession: 项目唯一编号（如 'GSE151530'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{accession}")
        return _ok(f"项目 {accession} 详情", data)
    except Exception as e:
        return _fail(f"获取项目 {accession} 详情失败", e)


@mcp.tool
async def seqout_get_project_metadata(accession: str) -> str:
    """获取项目的标题和描述信息。

    :param accession: 项目唯一编号（如 'GSE151530'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{accession}/metadata")
        return _ok(f"项目 {accession} 元数据", data)
    except Exception as e:
        return _fail("获取元数据失败", e)


@mcp.tool
async def seqout_get_project_citation(accession: str) -> str:
    """获取项目的 BibTeX 引用文献。

    :param accession: 项目唯一编号（如 'GSE151530'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{accession}/cite")
        return _ok(f"项目 {accession} 引用文献", data)
    except Exception as e:
        return _fail("获取引用失败", e)


@mcp.tool
async def seqout_get_project_enriched(accession: str) -> str:
    """获取 AI 增强的样本元数据（包含本体论注释）。

    :param accession: 项目唯一编号（如 'GSE151530'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{accession}/enriched")
        return _ok(f"项目 {accession} 增强元数据", data)
    except Exception as e:
        return _fail("获取增强元数据失败", e)


# ==================== Experiment & Sample Tools ====================

@mcp.tool
async def seqout_get_experiments(study_accession: str) -> str:
    """列出研究中的所有实验。

    :param study_accession: 研究项目编号（如 'GSE123456'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{study_accession}/experiments")
        return _ok(f"研究 {study_accession} 的实验列表", data)
    except Exception as e:
        return _fail("获取实验列表失败", e)


@mcp.tool
async def seqout_get_runs(study_accession: str) -> str:
    """列出 FASTQ 下载链接。

    :param study_accession: 研究项目编号（如 'GSE123456'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{study_accession}/runs")
        return _ok(f"研究 {study_accession} 的测序运行列表", data)
    except Exception as e:
        return _fail("获取运行列表失败", e)


@mcp.tool
async def seqout_get_run_download(run_accession: str) -> str:
    """获取单个运行的下载链接。

    :param run_accession: 运行编号（如 'SRR1234567'、'ERR1234567'）
    """
    try:
        data = await _seqout_request(f"/run/{run_accession}")
        return _ok(f"运行 {run_accession} 下载链接", data)
    except Exception as e:
        return _fail("获取下载链接失败", e)


@mcp.tool
async def seqout_get_sample_metadata(accession: str) -> str:
    """获取样本元数据。

    :param accession: 样本编号（如 'GSM1234567'、'SRR1234567'）
    """
    try:
        data = await _seqout_request(f"/sample/{accession}")
        return _ok(f"样本 {accession} 元数据", data)
    except Exception as e:
        return _fail("获取样本元数据失败", e)


@mcp.tool
async def seqout_get_sample_detail(accession: str) -> str:
    """获取完整的样本详细信息。

    :param accession: 样本编号（如 'GSM1234567'、'SRR1234567'）
    """
    try:
        data = await _seqout_request(f"/sample-detail/{accession}")
        return _ok(f"样本 {accession} 详细信息", data)
    except Exception as e:
        return _fail("获取样本详细信息失败", e)


@mcp.tool
async def seqout_get_sample_manifest(accession: str, max_samples: int = 30) -> str:
    """获取数据集的样本清单（Sample Manifest），包含样本组织来源、实验处理组与对照组标记。

    :param accession: GEO Series 编号（如 'GSE123456'）
    :param max_samples: 返回的最大样本数量预览，默认 30
    """
    try:
        data = await _seqout_request(f"/geo/series/{accession}/samples")
        samples = _parse_samples_response(data, max_samples)
        if not samples:
            return json.dumps(
                {"success": False, "summary": f"数据集 {accession} 未找到结构化样本信息。"},
                ensure_ascii=False, indent=2,
            )
        return _ok(f"共 {len(samples)} 个样本（已限制显示 {max_samples} 个）", samples)
    except Exception as e:
        return _fail("获取样本清单失败", e)


# ==================== Resolution Tools ====================

@mcp.tool
async def seqout_resolve_accession(accession: str) -> str:
    """当仅提供单个样本编号（GSM...）或测序 Run（SRR...）时，反查其归属的项目编号（GSE/PRJNA）。

    :param accession: 样本或 Run 编号（如 'GSM456789'、'SRR1234567'）
    """
    try:
        data = await _seqout_request(f"/accession/{accession}/project")
        return _ok(f"解析 {accession} 成功", data)
    except Exception as e:
        return _fail(f"解析编号 {accession} 失败", e)


@mcp.tool
async def seqout_resolve_prj(prj_accession: str) -> str:
    """将 BioProject 解析到研究级别。

    :param prj_accession: BioProject 编号（如 'PRJNA123456'、'PRJEB123456'）
    """
    try:
        data = await _seqout_request(f"/prj/{prj_accession}")
        return _ok(f"BioProject {prj_accession} 解析结果", data)
    except Exception as e:
        return _fail("解析失败", e)


# ==================== Ontology & Statistics Tools ====================

@mcp.tool
async def seqout_get_ontology_term(term: str) -> str:
    """查询本体论图中某个术语的所有相关信息。

    :param term: 本体论术语（如 'T cell'、'liver'、'RNA-seq'）
    """
    try:
        data = await _seqout_request(f"/ontology/term?term={term}")
        return _ok(f"本体论术语 '{term}' 信息", data)
    except Exception as e:
        return _fail("获取本体论信息失败", e)


@mcp.tool
async def seqout_get_organisms() -> str:
    """列出所有支持的生物物种。"""
    try:
        data = await _seqout_request("/organisms")
        return _ok("所有支持的物种列表", data)
    except Exception as e:
        return _fail("获取物种列表失败", e)


@mcp.tool
async def seqout_get_common_name(organism: str) -> str:
    """获取物种的常用名称。

    :param organism: 物种标识符（如 'Homo sapiens'、'Mus musculus'、9606）
    """
    try:
        data = await _seqout_request(f"/common-name?organism={organism}")
        return _ok(f"物种 '{organism}' 的常用名称", data)
    except Exception as e:
        return _fail("获取常用名称失败", e)


@mcp.tool
async def seqout_get_stats_growth() -> str:
    """获取数据库随时间的增长情况。"""
    try:
        data = await _seqout_request("/stats/growth")
        return _ok("数据库增长统计", data)
    except Exception as e:
        return _fail("获取统计失败", e)


@mcp.tool
async def seqout_get_organism_totals() -> str:
    """获取每个物种的实验总数。"""
    try:
        data = await _seqout_request("/stats/organism-totals")
        return _ok("物种实验总数统计", data)
    except Exception as e:
        return _fail("获取统计失败", e)


@mcp.tool
async def seqout_get_platform_totals(platform: str | None = None) -> str:
    """获取每个平台的实验总数，或特定平台的过滤选项。

    :param platform: 平台代码（如 'ILLUMINA'、'ION'，可选）
    """
    try:
        endpoint = "/stats/platform-filters" if platform else "/stats/platform-totals"
        params = {"platform": platform} if platform else None
        data = await _seqout_request(endpoint, params=params)
        summary = f"平台 '{platform}' 过滤选项" if platform else "平台实验总数统计"
        return _ok(summary, data)
    except Exception as e:
        return _fail("获取统计失败", e)


# ==================== Beacon Tools ====================

@mcp.tool
async def seqout_beacon_info() -> str:
    """获取 Beacon 身份和元数据（版本、实例信息、访问策略）。"""
    try:
        data = await _seqout_request("/beacon/info")
        return _ok("Beacon 元数据", data)
    except Exception as e:
        return _fail("获取 Beacon 信息失败", e)


@mcp.tool
async def seqout_beacon_runs(run_accession: str | None = None, skip: int = 0, limit: int = 10) -> str:
    """浏览或获取测序运行（Beacon 协议，自定义 seqoutRun schema）。

    :param run_accession: 单个运行编号（可选，如 'SRR1234567'）
    :param skip: 分页索引，默认 0
    :param limit: 页面大小，最大 100，默认 10
    """
    try:
        params: dict[str, Any] = {}
        if run_accession:
            params["id"] = run_accession
        if skip > 0:
            params["skip"] = skip
        if limit > 10:
            limit = 10
        if limit > 0:
            params["limit"] = limit
        data = await _seqout_request("/beacon/runs", params=params if params else None)
        return _ok(f"测序运行列表（skip={skip}, limit={limit}）", data)
    except Exception as e:
        return _fail("获取运行列表失败", e)


# ==================== Download Tools ====================

@mcp.tool
async def seqout_get_download_links(study_accession: str) -> str:
    """以 TSV 格式获取运行下载链接。

    :param study_accession: 研究项目编号（如 'GSE123456'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{study_accession}/runs/download")
        return _ok(f"研究 {study_accession} 的下载链接 TSV", data)
    except Exception as e:
        return _fail("获取下载链接失败", e)


@mcp.tool
async def seqout_get_metadata_csv(study_accession: str) -> str:
    """下载合并的元数据 CSV。

    :param study_accession: 研究项目编号（如 'GSE123456'、'PRJNA678901'）
    """
    try:
        data = await _seqout_request(f"/project/{study_accession}/metadata/download")
        return _ok(f"研究 {study_accession} 的元数据 CSV", data)
    except Exception as e:
        return _fail("获取元数据 CSV 失败", e)


if __name__ == "__main__":
    mcp.run(transport="stdio")
