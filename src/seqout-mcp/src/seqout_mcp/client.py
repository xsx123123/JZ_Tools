from __future__ import annotations

import asyncio
import json
import os
import re
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from .accessions import GSE_PATTERN, SAMPLE_PATTERN, STUDY_PATTERN, find_study_accession

class SeqoutClient:
    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self.base_url = os.getenv("SEQOUT_BASE_URL", "https://seqout.org/api").rstrip("/")
        self.timeout = read_timeout()
        self.api_key = os.getenv("SEQOUT_API_KEY")

    async def request(self, path: str, params: dict[str, Any] | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else None
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await self.http.get(
                    f"{self.base_url}{path}", params=params, headers=headers, timeout=self.timeout
                )
                content_type = response.headers.get("content-type", "").lower()
                if "json" not in content_type and response.text.lstrip().startswith(("<", "<!DOCTYPE")):
                    raise ValueError(f"non_json:{content_type}: {response.text[:400]}")
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < 2:
                        await asyncio.sleep(self._retry_delay(response, attempt))
                        continue
                response.raise_for_status()
                try:
                    return response.json()
                except (json.JSONDecodeError, ValueError) as exc:
                    kind = "empty_response" if not response.text.strip() else "non_json"
                    raise ValueError(f"{kind}:{response.headers.get('content-type', '')}: {response.text[:400]}") from exc
            except httpx.TimeoutException as exc:
                raise TimeoutError("服务端响应超时") from exc
            except httpx.HTTPStatusError:
                raise
            except httpx.RequestError as exc:
                last_error = exc
                if attempt == 2:
                    raise ConnectionError("无法连接 Seqout API，请检查网络或 SEQOUT_BASE_URL") from exc
                await asyncio.sleep(1 << attempt)
        assert last_error is not None
        raise last_error

    @staticmethod
    def _retry_delay(response: httpx.Response, attempt: int) -> float:
        value = response.headers.get("retry-after")
        if value:
            try:
                return min(5.0, max(0.0, float(value)))
            except ValueError:
                try:
                    when = parsedate_to_datetime(value).astimezone(timezone.utc)
                    return min(5.0, max(0.0, (when - datetime.now(timezone.utc)).total_seconds()))
                except (TypeError, ValueError, OverflowError):
                    pass
        return float(1 << attempt)

    async def resolve_study(self, accession: str) -> str:
        accession = accession.upper()
        if GSE_PATTERN.fullmatch(accession):
            original = accession
            project = await self.request(f"/project/{quote(accession, safe='')}")
            accession = find_study_accession(project) or ""
            if not accession:
                raise ValueError(f"{original} 未找到对应 SRA 编号")
        accession = accession.upper()
        if not re.fullmatch(STUDY_PATTERN, accession):
            raise ValueError(f"accession_pattern:{STUDY_PATTERN}")
        return accession

    @staticmethod
    def validate_sample(accession: str) -> str:
        accession = accession.upper()
        if not re.fullmatch(SAMPLE_PATTERN, accession):
            raise ValueError(f"accession_pattern:{SAMPLE_PATTERN}")
        return accession


def read_timeout() -> float:
    try:
        value = float(os.getenv("SEQOUT_TIMEOUT", "30"))
    except (TypeError, ValueError):
        value = 30.0
    return max(0.1, min(value, 30.0))
