from __future__ import annotations

from typing import Any


def parse_search_response(data: Any, limit: int = 20) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    meta: dict[str, Any] = {}
    if isinstance(data, dict):
        raw = data.get("results", data.get("hits", []))
        meta = {key: data[key] for key in ("total", "took_ms", "next_cursor") if key in data}
    else:
        raw = data
    if not isinstance(raw, list):
        return [], meta
    output = []
    for item in raw[:max(0, min(limit, 20))]:
        if not isinstance(item, dict):
            continue
        summary = item.get("summary") or item.get("description") or ""
        output.append({
            "accession": item.get("accession") or item.get("id"),
            "title": item.get("title"),
            "organism": item.get("organism"),
            "sample_count": item.get("samples_count") or item.get("n_samples"),
            "source_db": item.get("database"),
            "summary": summary[:200] + ("..." if len(summary) > 200 else ""),
        })
    return output, meta


def parse_samples_response(data: Any, limit: int = 20) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    meta: dict[str, Any] = {}
    if isinstance(data, dict):
        raw = data.get("samples", data.get("data", []))
        meta = {key: data[key] for key in ("total", "took_ms", "next_cursor") if key in data}
    else:
        raw = data
    if not isinstance(raw, list):
        return [], meta
    samples = [{
        "sample_accession": sample.get("accession") or sample.get("geo_accession"),
        "title": sample.get("title"),
        "characteristics": sample.get("characteristics_ch1") or sample.get("attributes") or [],
        "source_name": sample.get("source_name_ch1") or sample.get("source_name"),
    } for sample in raw[:max(0, min(limit, 20))] if isinstance(sample, dict)]
    return samples, meta


def trim_collection(data: Any, limit: int = 20) -> tuple[Any, dict[str, Any]]:
    """Bound an unpaginated API collection while retaining its shape."""
    if isinstance(data, list):
        return data[:limit], {"total": len(data), "shown": limit} if len(data) > limit else {}
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, list) and len(value) > limit:
                bounded = dict(data)
                bounded[key] = value[:limit]
                return bounded, {"total": len(value), "shown": limit}
    return data, {}
