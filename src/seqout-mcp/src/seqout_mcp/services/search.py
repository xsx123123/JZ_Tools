"""搜索类业务：参数归一 + 结果精简（吃 client 返回的 dict，纯函数）。

tools/search.py 里的 ToolSpec 只描述路径与参数；
query 参数映射与结果 transform 逻辑统一收口在这里，供 MCP / REST 共用。
"""
from __future__ import annotations

from typing import Any

from ..parsers import parse_samples_response, parse_search_response, trim_collection


def build_search_query(
    path_values: dict[str, Any],
    query_map: dict[str, str],
) -> dict[str, str] | None:
    """把 tool 入参映射为 seqout API 查询参数；全空时返回 None。"""
    query = {
        api_name: str(values)
        for api_name, arg_name in query_map.items()
        if (values := path_values.get(arg_name)) is not None
    }
    return query or None


def apply_transform(
    transform: str | None,
    data: Any,
    *,
    limit: int = 20,
) -> tuple[Any, dict[str, Any]]:
    """按 ToolSpec.transform 归一化结果；未知 transform 原样返回。"""
    if transform == "search":
        return parse_search_response(data, limit)
    if transform == "samples":
        return parse_samples_response(data, limit)
    if transform == "bounded":
        return trim_collection(data)
    return data, {}


def summarize_pagination(summary: str, extra: dict[str, Any]) -> str:
    """total > shown 时在摘要后附分页提示（meta 里的 shown 在此消费）。"""
    shown = extra.pop("shown", None)
    total = extra.get("total")
    if shown is None or total is None or total <= shown:
        return summary
    return f"{summary}；共 {total} 条，当前展示 {shown} 条，可用 next_cursor 翻页"
