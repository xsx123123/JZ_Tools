import asyncio
import json
import logging
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from seqout_mcp.accessions import find_study_accession
from seqout_mcp.client import SeqoutClient
from seqout_mcp.errors import encode_result, make_error
from seqout_mcp.parsers import parse_samples_response, parse_search_response, trim_collection
from seqout_mcp.tools import ALL_SPECS
from seqout_mcp.tools.registry import ALL_SPECS as REGISTRY_SPECS, make_tool


class MCPCoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_logging_isolated_to_stderr(self):
        import seqout_mcp.server  # noqa: F401

        logger = logging.getLogger("seqout_mcp")
        self.assertFalse(logger.propagate)
        self.assertTrue(logger.handlers)
        # 测试装置（unittest/caplog）会注入 stream=StringIO 的 LogCaptureHandler，
        # 且捕获模式下 sys.stderr 本身会被替换成临时文件流——同一性/名称断言都不稳。
        # 回归本意是"日志不得写入 stdout（stdio MCP 通道）"：断言自建 handler 的 fileno != 1
        capture_streams = [h.stream for h in logger.handlers
                           if type(h).__name__ == "LogCaptureHandler"]
        native = [h for h in logger.handlers
                  if getattr(h, "stream", None) is not None
                  and h.stream not in capture_streams]
        self.assertTrue(native)
        for handler in native:
            try:
                self.assertNotEqual(handler.stream.fileno(), 1)
            except (OSError, ValueError, AttributeError):
                pass  # 非文件流（如 StringIO）无法取 fileno，跳过该检查

    async def test_invalid_timeout_uses_default(self):
        with patch.dict("os.environ", {"SEQOUT_TIMEOUT": "not-a-number"}):
            async with httpx.AsyncClient() as http:
                self.assertEqual(SeqoutClient(http).timeout, 30.0)

    async def test_tool_registry_has_26_unique_tools_and_no_beacon_paging(self):
        self.assertEqual(len(ALL_SPECS), 26)
        self.assertEqual(REGISTRY_SPECS, ALL_SPECS)
        self.assertEqual(len({item.name for item in ALL_SPECS}), 26)
        beacon = next(item for item in ALL_SPECS if item.name == "seqout_beacon_runs")
        self.assertEqual(beacon.params, ())
        growth = next(item for item in ALL_SPECS if item.name == "seqout_get_stats_growth")
        self.assertEqual(growth.params[0].annotation.__args__, ("projects", "experiments", "bases"))

    async def test_fastmcp_in_process_client_lists_all_tools(self):
        from fastmcp import Client
        from seqout_mcp.server import mcp

        async with Client(mcp) as client:
            self.assertEqual(len(await client.list_tools()), 26)

    async def test_stdio_subprocess_initializes_and_lists_tools(self):
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        env = os.environ.copy()
        env["PYTHONPATH"] = str(Path(__file__).parents[1] / "src")
        params = StdioServerParameters(command=sys.executable, args=["-m", "seqout_mcp"], env=env)
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=5)
                result = await asyncio.wait_for(session.list_tools(), timeout=5)
        self.assertEqual(len(result.tools), 26)

    async def test_retry_after_429_then_success(self):
        calls = 0

        async def handler(_request):
            nonlocal calls
            calls += 1
            if calls < 3:
                return httpx.Response(429, headers={"Retry-After": "0"}, json={"detail": "busy"})
            return httpx.Response(200, json={"ok": True})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = SeqoutClient(http)
            with patch("seqout_mcp.client.asyncio.sleep", new=AsyncMock()):
                result = await client.request("/test")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(calls, 3)

    async def test_connect_error_retries_then_returns_human_error(self):
        calls = 0

        async def handler(_request):
            nonlocal calls
            calls += 1
            raise httpx.ConnectError("offline")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = SeqoutClient(http)
            with patch("seqout_mcp.client.asyncio.sleep", new=AsyncMock()) as sleep:
                with self.assertRaisesRegex(ConnectionError, "无法连接"):
                    await client.request("/offline")
        self.assertEqual(calls, 3)
        self.assertEqual(sleep.await_count, 2)

    async def test_rate_limit_error_is_classified_after_retries(self):
        async def handler(_request):
            return httpx.Response(429, json={"detail": "busy"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = SeqoutClient(http)
            with patch("seqout_mcp.client.asyncio.sleep", new=AsyncMock()):
                with self.assertRaises(httpx.HTTPStatusError) as caught:
                    await client.request("/limited")
        error = make_error(caught.exception.response.status_code, {"detail": "busy"})
        self.assertEqual(error["error_type"], "rate_limited")

    async def test_422_error_preserves_server_pattern(self):
        async def handler(request):
            self.assertEqual(request.url.params["scientific_name"], "Homo sapiens")
            return httpx.Response(422, json={"detail": "pattern: ^SRP\\d+$"})

        spec = next(item for item in ALL_SPECS if item.name == "seqout_get_common_name")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://seqout.org/api") as http:
            result = json.loads(await make_tool(spec, lambda: SeqoutClient(http))(scientific_name="Homo sapiens"))
        self.assertEqual(result["error"]["error_type"], "invalid_parameters")
        self.assertIn("SRP", result["error"]["server_detail"]["detail"])
        self.assertTrue(result["error"]["next_steps"])

    async def test_non_json_error_explains_api_prefix(self):
        async def handler(_request):
            return httpx.Response(404, text="<html>not found</html>", headers={"content-type": "text/html"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://seqout.org") as http:
            with self.assertRaisesRegex(ValueError, "non_json:"):
                await SeqoutClient(http).request("/project/GSE1")
        error = make_error(None, "<html>not found</html>", non_json=True)
        self.assertIn("/api", error["message"])

    async def test_empty_json_response_is_distinguished_from_html(self):
        async def handler(_request):
            return httpx.Response(200, content=b"", headers={"content-type": "application/json"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            with self.assertRaisesRegex(ValueError, "empty_response:"):
                await SeqoutClient(http).request("/stats/growth")
        error = make_error(None, "empty_response:application/json:")
        self.assertEqual(error["error_type"], "empty_response")

    async def test_search_parser_preserves_cursor_and_empty_summary(self):
        results, meta = parse_search_response({"results": [{"summary": ""}], "total": 40, "took_ms": 3, "next_cursor": "abc"})
        self.assertEqual(results[0]["summary"], "")
        self.assertEqual(meta["next_cursor"], "abc")
        payload = json.loads(encode_result(summary="search", data=results, **meta))
        self.assertEqual(payload["next_cursor"], "abc")

    async def test_sample_parser_preserves_pagination_metadata(self):
        samples, meta = parse_samples_response({"samples": [{"accession": "GSM1"}], "total": 31, "next_cursor": "next"})
        self.assertEqual(samples[0]["sample_accession"], "GSM1")
        self.assertEqual(meta["total"], 31)
        self.assertEqual(meta["next_cursor"], "next")

    async def test_unpaginated_collections_are_bounded(self):
        bounded, meta = trim_collection({"organisms": list(range(30)), "other": "kept"})
        self.assertEqual(len(bounded["organisms"]), 20)
        self.assertEqual(meta["total"], 30)

    async def test_gse_resolution_and_gsm_route(self):
        observed = []

        class FakeClient:
            async def resolve_study(self, accession):
                observed.append(("resolve", accession))
                return "SRP000123"

            async def request(self, path, params=None):
                observed.append((path, params))
                return {"results": []}

            def validate_sample(self, accession):
                return accession

        study = next(item for item in ALL_SPECS if item.name == "seqout_get_experiments")
        await make_tool(study, FakeClient)(study_accession="GSE123")
        sample = next(item for item in ALL_SPECS if item.name == "seqout_get_sample_metadata")
        await make_tool(sample, FakeClient)(accession="GSM123")
        self.assertIn(("/project/SRP000123/experiments", None), observed)
        self.assertIn(("/sample-detail/GSM123", None), observed)

    async def test_gse_resolution_reads_project_xrefs(self):
        seen = []

        async def handler(request):
            seen.append(request.url.path)
            return httpx.Response(200, json={"accession": "GSE123", "xref": ["SRP000123"]})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://seqout.org/api") as http:
            client = SeqoutClient(http)
            self.assertEqual(await client.resolve_study("GSE123"), "SRP000123")
        self.assertEqual(seen, ["/api/project/GSE123"])

    async def test_study_xref_parser(self):
        self.assertEqual(find_study_accession({"xref": ["https://example/SRP12345"]}), "SRP12345")

    async def test_accession_patterns_reject_invalid_values(self):
        async with httpx.AsyncClient() as http:
            client = SeqoutClient(http)
            with self.assertRaisesRegex(ValueError, "accession_pattern"):
                await client.resolve_study("not-a-study")
            with self.assertRaisesRegex(ValueError, "accession_pattern"):
                client.validate_sample("not-a-sample")

    async def test_large_result_stays_valid_json_below_limit(self):
        result = encode_result(summary="big", data={"rows": ["样本" * 5000]})
        self.assertLessEqual(len(result.encode("utf-8")), 10_000)
        self.assertTrue(json.loads(result)["data_truncated"])

if __name__ == "__main__":
    unittest.main()
