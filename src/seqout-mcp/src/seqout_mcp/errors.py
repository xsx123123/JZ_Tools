from __future__ import annotations

from typing import Any


def make_error(status: int | None, detail: Any, *, non_json: bool = False) -> dict[str, Any]:
    if non_json:
        return {
            "error_type": "invalid_response",
            "message": "服务端返回非 JSON，请检查 SEQOUT_BASE_URL 是否带 /api 前缀",
            "server_detail": str(detail)[:500],
            "next_steps": ["将 SEQOUT_BASE_URL 设置为 https://seqout.org/api"],
        }
    if isinstance(detail, str) and detail.startswith("empty_response:"):
        return {
            "error_type": "empty_response",
            "message": "Seqout API 返回空响应，请稍后重试",
            "server_detail": detail,
            "next_steps": ["稍后重试；若持续出现请检查 seqout.org 服务状态"],
        }
    if status == 422:
        return {
            "error_type": "invalid_parameters",
            "message": "请求参数不符合服务端要求",
            "server_detail": detail,
            "next_steps": ["根据 server_detail 中的必填字段、合法 pattern 或枚举值修正参数"],
        }
    if status == 404:
        return {
            "error_type": "not_found",
            "message": "编号不存在或类型不对（GSE 请确认已自动解析）",
            "server_detail": detail,
            "next_steps": ["检查 accession 拼写及编号类型"],
        }
    if status == 429:
        return {
            "error_type": "rate_limited",
            "message": "请求过于频繁，服务端仍在限流，请稍后重试",
            "server_detail": detail,
            "next_steps": ["降低调用频率，稍后重试"],
        }
    if status is not None and status >= 500:
        return {
            "error_type": "server_error",
            "message": "服务端故障，可稍后重试",
            "server_detail": detail,
            "next_steps": ["稍后重试；若持续失败请检查 seqout.org 服务状态"],
        }
    if isinstance(detail, str) and detail.startswith("无法连接 Seqout API"):
        return {
            "error_type": "network_error",
            "message": detail,
            "server_detail": None,
            "next_steps": ["检查网络连接和 SEQOUT_BASE_URL 后重试"],
        }
    return {
        "error_type": "request_error",
        "message": "Seqout API 请求失败",
        "server_detail": detail,
        "next_steps": [],
    }


def encode_result(*, summary: str, data: Any = None, error: dict[str, Any] | None = None,
                  next_cursor: Any = None, total: Any = None, took_ms: Any = None) -> str:
    import json

    payload: dict[str, Any] = {"success": error is None, "summary": summary}
    if error is not None:
        payload["error"] = error
    else:
        payload["data"] = data
    if total is not None:
        payload["total"] = total
    if took_ms is not None:
        payload["took_ms"] = took_ms
    if next_cursor:
        payload["next_cursor"] = next_cursor
    result = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(result.encode("utf-8")) <= 10_000:
        return result
    preview = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    compact = {"success": error is None, "summary": summary, "data_truncated": True}
    if error is not None:
        compact["error"] = error
    if total is not None:
        compact["total"] = total
    if took_ms is not None:
        compact["took_ms"] = took_ms
    if next_cursor:
        compact["next_cursor"] = next_cursor
    for size in (6_000, 3_000, 1_000, 100):
        compact["data_preview"] = preview[:size]
        result = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
        if len(result.encode("utf-8")) <= 10_000:
            return result
    return json.dumps({"success": False, "summary": "结果过大，已省略，请使用分页参数获取", "data_truncated": True}, ensure_ascii=False)
