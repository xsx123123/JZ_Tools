from __future__ import annotations

import inspect
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import quote

import httpx

from ..accessions import GSM_PATTERN
from ..errors import encode_result, make_error
from ..parsers import parse_samples_response, parse_search_response, trim_collection

logger = logging.getLogger("seqout_mcp")


def __getattr__(name: str) -> Any:
    if name == "ALL_SPECS":
        from . import ALL_SPECS

        return ALL_SPECS
    raise AttributeError(name)


@dataclass(frozen=True)
class Param:
    name: str
    annotation: type = str
    default: Any = inspect.Parameter.empty


@dataclass(frozen=True)
class ToolSpec:
    name: str
    path: str
    doc: str
    params: tuple[Param, ...] = ()
    query: dict[str, str] = field(default_factory=dict)
    resolver: str | None = None
    transform: str | None = None
    summary: str | Callable[[dict[str, Any]], str] = "Seqout 查询完成"


def _summary(spec: ToolSpec, values: dict[str, Any]) -> str:
    if callable(spec.summary):
        return spec.summary(values)
    return spec.summary.format(**values)


def make_tool(spec: ToolSpec, client_getter: Callable[[], Any]) -> Callable[..., Any]:
    async def tool_impl(**values: Any) -> str:
        client = client_getter()
        started = time.monotonic()
        path = spec.path
        try:
            if spec.resolver == "study":
                key = "study_accession"
                resolved = await client.resolve_study(values[key])
                path = path.replace("{study_accession}", quote(resolved, safe=""))
            elif spec.resolver == "sample":
                accession = client.validate_sample(values["accession"])
                path = ("/sample-detail/" if GSM_PATTERN.fullmatch(accession) else "/sample/") + quote(accession, safe="")
            elif spec.resolver == "sample_detail":
                accession = client.validate_sample(values["accession"])
                path = spec.path.replace("{accession}", quote(accession, safe=""))
            elif spec.resolver == "platform" and values.get("platform"):
                path = "/stats/platform-filters"
            else:
                for param in spec.params:
                    if param.name in path:
                        path = path.replace("{" + param.name + "}", quote(str(values[param.name]), safe=""))
            query = {api_name: values[arg_name] for api_name, arg_name in spec.query.items()
                     if values.get(arg_name) is not None}
            data = await client.request(path, query or None)
            extra: dict[str, Any] = {}
            if spec.transform == "search":
                data, extra = parse_search_response(data, values.get("limit", 20))
                if not data:
                    return encode_result(summary="没有找到匹配的数据", data=[],
                                         total=extra.get("total"), took_ms=extra.get("took_ms"),
                                         next_cursor=extra.get("next_cursor"))
            elif spec.transform == "samples":
                data, extra = parse_samples_response(data, values.get("max_samples", 20))
            elif spec.transform == "bounded":
                data, extra = trim_collection(data)
            summary = _summary(spec, values)
            shown = extra.pop("shown", len(data))
            if extra.get("total") is not None and extra["total"] > shown:
                summary += f"；共 {extra['total']} 条，当前展示 {shown} 条，可用 next_cursor 翻页"
            logger.info("tool=%s method=GET path=%s status=200 elapsed_ms=%d",
                        spec.name, path, (time.monotonic() - started) * 1000)
            return encode_result(summary=summary, data=data, **extra)
        except Exception as exc:
            status = None
            detail: Any = str(exc)
            non_json = isinstance(exc, ValueError) and str(exc).startswith("non_json:")
            if isinstance(exc, httpx.HTTPStatusError):
                status = exc.response.status_code
                detail = str(exc)
                try:
                    detail = exc.response.json()
                except ValueError:
                    detail = exc.response.text[:500]
                logger.info("tool=%s method=GET path=%s status=%d elapsed_ms=%d",
                            spec.name, path, status, (time.monotonic() - started) * 1000)
            else:
                logger.warning("tool=%s method=GET path=%s failed=%s elapsed_ms=%d",
                               spec.name, path, type(exc).__name__, (time.monotonic() - started) * 1000)
            if isinstance(exc, ValueError) and str(exc).startswith("accession_pattern:"):
                status, detail = 422, str(exc).partition(":")[2]
            error = make_error(status, detail, non_json=non_json)
            if isinstance(exc, TimeoutError):
                error = {"error_type": "timeout", "message": str(exc), "server_detail": None,
                         "next_steps": ["检查网络连接后重试"]}
            return encode_result(summary=error["message"], error=error)

    tool_impl.__name__ = spec.name
    tool_impl.__doc__ = spec.doc
    parameters = [inspect.Parameter(p.name, inspect.Parameter.POSITIONAL_OR_KEYWORD,
                                    default=p.default, annotation=p.annotation) for p in spec.params]
    tool_impl.__signature__ = inspect.Signature(parameters)  # type: ignore[attr-defined]
    tool_impl.__annotations__ = {p.name: p.annotation for p in spec.params} | {"return": str}
    return tool_impl


def p(name: str, annotation: type = str, default: Any = inspect.Parameter.empty) -> Param:
    if default is None and annotation is str:
        annotation = str | None
    return Param(name, annotation, default)
