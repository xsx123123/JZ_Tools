from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager

import httpx

os.environ.setdefault("FASTMCP_SHOW_SERVER_BANNER", "false")

from fastmcp import FastMCP

from .stdio_transport import threaded_stdio_server

from .client import SeqoutClient, read_timeout
from .tools import register_all

_logger = logging.getLogger("seqout_mcp")
_logger.setLevel(os.getenv("SEQOUT_LOG_LEVEL", "WARNING").upper())
_logger.propagate = False
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    _logger.addHandler(_handler)

_client: SeqoutClient | None = None


def get_client() -> SeqoutClient:
    if _client is None:
        raise RuntimeError("Seqout client is not initialized")
    return _client


@asynccontextmanager
async def lifespan(_server):
    global _client
    timeout = read_timeout()
    async with httpx.AsyncClient(timeout=timeout, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)) as http:
        _client = SeqoutClient(http)
        try:
            yield {"seqout_client": _client}
        finally:
            _client = None


mcp = FastMCP("seqout", lifespan=lifespan)
register_all(mcp, get_client)

# FastMCP keeps a reference to the SDK transport at import time.
import mcp.server.stdio as _mcp_stdio
_mcp_stdio.stdio_server = threaded_stdio_server
for _module_name in ("fastmcp.server.mixins.transport", "fastmcp.server.low_level"):
    _module = sys.modules.get(_module_name)
    if _module is not None:
        _module.stdio_server = threaded_stdio_server


def main() -> None:
    mcp.run(transport="stdio")
