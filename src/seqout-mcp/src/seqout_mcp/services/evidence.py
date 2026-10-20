"""文献证据链业务（T2 的 service 层落点）。

与 Treasure-Seeking_Mouse Edge Function 里的 fetchLiterature 保持同一检索策略：
① GEO 条目自带 PMID（精确）→ ② NCBI esearch 标题精确匹配 → ③ Europe PMC 兜底。
not_found 是正常业务状态（status 走 data，不进 error），MCP 化时同样遵守。

HTTP 调用统一走注入的 httpx.AsyncClient（传输层），本层不创建连接、不 import 框架。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
STRATEGY_VERSION = "v1"


@dataclass(frozen=True)
class EvidenceConfig:
    """NCBI 联系信息（NCBI 要求带 tool/email；api_key 提升到 10 req/s）。"""
    tool: str = "go_xunbaoshu"
    email: str = ""
    api_key: str = ""


def esearch_url(term: str, retmax: int = 5, config: EvidenceConfig | None = None) -> str:
    config = config or EvidenceConfig()
    import urllib.parse

    params: dict[str, str] = {"db": "pubmed", "term": term, "retmode": "json", "retmax": str(retmax), "tool": config.tool}
    if config.email:
        params["email"] = config.email
    if config.api_key:
        params["api_key"] = config.api_key
    return f"{EUTILS}/esearch.fcgi?{urllib.parse.urlencode(params)}"


def esummary_url(pmids: list[str], config: EvidenceConfig | None = None) -> str:
    config = config or EvidenceConfig()
    import urllib.parse

    params: dict[str, str] = {"db": "pubmed", "id": ",".join(pmids), "retmode": "json", "tool": config.tool}
    if config.email:
        params["email"] = config.email
    if config.api_key:
        params["api_key"] = config.api_key
    return f"{EUTILS}/esummary.fcgi?{urllib.parse.urlencode(params)}"


def epmc_url(query: str) -> str:
    import urllib.parse

    return f"{EPMC}?{urllib.parse.urlencode({'query': query, 'format': 'json', 'resultType': 'core'})}"


def parse_esearch(data: dict[str, Any]) -> list[str]:
    ids = (data.get("esearchresult") or {}).get("idlist")
    return [str(i) for i in ids] if isinstance(ids, list) else []


def parse_esummary(data: dict[str, Any], pmids: list[str]) -> dict[str, dict[str, Any]]:
    result = data.get("result") or {}
    out: dict[str, dict[str, Any]] = {}
    for pmid in pmids:
        item = result.get(pmid)
        if not isinstance(item, dict):
            continue
        doi = next((a.get("value") for a in item.get("articleids", []) if a.get("type") == "doi"), None)
        out[pmid] = {
            "title": item.get("title"),
            "journal": item.get("fulljournalname"),
            "pubdate": item.get("pubdate"),
            "doi": doi,
        }
    return out


def parse_efetch_outline(xml: str) -> list[dict[str, str]]:
    """结构化摘要分段；无 Label 的整段摘要降级为 section='Abstract'（不算失败）。"""
    import re

    sections: list[dict[str, str]] = []
    for attrs, body in re.findall(r"<AbstractText([^>]*)>([\s\S]*?)</AbstractText>", xml):
        label_match = re.search(r'Label="([^"]*)"', attrs)
        text = re.sub(r"<[^>]+>", "", body)
        text = " ".join(text.split())
        if text:
            sections.append({"section": label_match.group(1) if label_match else "Abstract", "text": text})
    return sections


def parse_epmc(data: dict[str, Any]) -> dict[str, Any] | None:
    """Europe PMC 兜底结果 → 文献卡片（OA 全文地址优先 pdf / Open access）。"""
    first = ((data.get("resultList") or {}).get("result") or [None])[0]
    if not isinstance(first, dict) or not str(first.get("title") or "").strip():
        return None
    journal_info = first.get("journalInfo") or {}
    journal = journal_info.get("journal") or {}
    full_text_urls = (first.get("fullTextUrlList") or {}).get("fullTextUrl") or []
    oa = next(
        (u for u in full_text_urls if u.get("documentStyle") == "pdf" or u.get("availability") == "Open access"),
        None,
    )
    abstract = str(first.get("abstractText") or "").strip()
    pmid = str(first.get("pmid") or "")
    doi = str(first.get("doi") or "")
    return {
        "status": "ok",
        "pmid": pmid or None,
        "title": str(first.get("title") or "").strip(),
        "journal": journal.get("title"),
        "year": str(journal_info.get("yearOfPublication") or "") or None,
        "doi": doi or None,
        "outline": [{"section": "Abstract", "text": abstract}] if abstract else [],
        "urls": {
            "pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else None,
            "doi": f"https://doi.org/{doi}" if doi else None,
            "full_text": oa.get("url") if oa else None,
        },
    }


def build_search_terms(kind: str, id_or_name: str) -> list[str]:
    """三级检索策略的候选词（与 Edge Function 同版本；升级后 bump STRATEGY_VERSION 使缓存失效）。"""
    if kind == "pubmed":
        return []
    if kind == "go_term":
        return [f'"{id_or_name}"[Title] AND "Gene Ontology"[Title]', f"{id_or_name} gene ontology consortium"]
    # geo 条目：编号必须出现在标题里，避免匹配正文顺带提及 GEO 的无关文献
    return [f"{id_or_name}[Title]"]


def not_found_card(suggested: list[str]) -> dict[str, Any]:
    """not_found 是正常业务状态：status 走 data，不进 error。"""
    return {"status": "not_found", "suggested_queries": suggested or []}
