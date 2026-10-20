"""stdio bridge for Python 3.13 pipes where anyio.wrap_file can stall."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from functools import partial
from queue import Empty, Queue
from threading import Event
from typing import Any

import anyio
import mcp.types as types
from mcp.shared.message import SessionMessage
from mcp.server.stdio import stdio_server as _sdk_stdio_server


def _parse(line: str) -> SessionMessage | Exception:
    try:
        adapter = getattr(types, "jsonrpc_message_adapter", None)
        message = (adapter.validate_json(line, by_name=False) if adapter is not None
                   else types.JSONRPCMessage.model_validate_json(line))
        return SessionMessage(message)
    except Exception as exc:  # malformed JSON-RPC is reported through the MCP stream
        return exc


def _encode(message: SessionMessage) -> str:
    try:
        return message.message.model_dump_json(by_alias=True, exclude_none=True)
    except TypeError:
        return message.message.model_dump_json(by_alias=True, exclude_unset=True)


@asynccontextmanager
async def threaded_stdio_server(stdin: Any = None, stdout: Any = None):
    """Serve stdio without AnyIO's file-wrapper reader.

    Explicit streams are delegated to the SDK transport; the bridge is only
    used for the process standard streams that trigger the Python 3.13 issue.
    """
    if stdin is not None or stdout is not None:
        async with _sdk_stdio_server(stdin=stdin, stdout=stdout) as streams:
            yield streams
        return

    # A small buffer lets the reader publish the first request before the
    # FastMCP task group begins consuming the stream.
    read_send, read_recv = anyio.create_memory_object_stream(16)
    write_send, write_recv = anyio.create_memory_object_stream(16)
    stopped = Event()
    pending: Queue[SessionMessage | Exception | None] = Queue()

    def read_blocking() -> None:
        try:
            while not stopped.is_set():
                raw = sys.stdin.buffer.readline()
                if not raw:
                    break
                pending.put(_parse(raw.decode("utf-8", "replace")))
        finally:
            pending.put(None)

    async def dispatch_async() -> None:
        while True:
            try:
                message = pending.get_nowait()
            except Empty:
                await anyio.sleep(0.001)
                continue
            if message is None:
                await read_send.aclose()
                return
            await read_send.send(message)

    async def write_async() -> None:
        async with write_recv:
            async for message in write_recv:
                sys.stdout.write(_encode(message) + "\n")
                sys.stdout.flush()

    async with anyio.create_task_group() as tg:
        tg.start_soon(write_async)
        tg.start_soon(dispatch_async)
        tg.start_soon(partial(anyio.to_thread.run_sync, read_blocking, abandon_on_cancel=True))
        try:
            yield read_recv, write_send
        finally:
            stopped.set()
            await write_send.aclose()
