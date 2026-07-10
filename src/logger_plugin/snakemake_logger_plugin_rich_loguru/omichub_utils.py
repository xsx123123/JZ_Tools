"""
OmicHub native workflow monitor integration.

Pushes structured Snakemake events to an OmicHub-compatible endpoint.
"""

from __future__ import annotations

import atexit
import getpass
import json
import os
import queue
import socket
import ssl
import sys
import threading
import time
import urllib.request
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError

from .security_utils import (
    encrypt_payload,
    generate_nonce,
    generate_timestamp,
    sign_request,
)
from .utils import SnakemakeProgressTracker, extract_snakemake_event


class OmicHubMonitorHandler:
    """
    Asynchronous loguru sink that pushes structured events to OmicHub.

    Uses an internal bounded queue + worker thread so that network issues do
    not block the Snakemake workflow.
    """

    def __init__(
        self,
        monitor_url: str,
        token: Optional[str] = None,
        project_name: Optional[str] = None,
        task_id: Optional[str] = None,
        flow_id: Optional[str] = None,
        user_id: Optional[str] = None,
        sign_requests: bool = False,
        signing_key: Optional[str] = None,
        encrypt_payload: bool = False,
        encryption_key: Optional[str] = None,
        tls_verify: bool = True,
        timeout: float = 5.0,
        queue_size: int = 10000,
        retry_count: int = 3,
        retry_backoff: float = 0.5,
    ):
        self.monitor_url = monitor_url.rstrip("/")
        self.token = token
        self.project_name = project_name or task_id or "unknown_project"
        self.task_id = task_id or project_name or "unknown_task"
        self.flow_id = flow_id or "unknown_flow"
        self.user_id = user_id or "unknown_user"
        self.sign_requests = bool(sign_requests)
        self.signing_key = signing_key
        self.encrypt_payload = bool(encrypt_payload)
        self.encryption_key = encryption_key
        self.tls_verify = bool(tls_verify)
        self.timeout = float(timeout)
        self.retry_count = int(retry_count)
        self.retry_backoff = float(retry_backoff)

        self._tracker = SnakemakeProgressTracker()
        self._queue: queue.Queue = queue.Queue(maxsize=queue_size)
        self._closed = False
        self._worker = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker.start()
        self._ssl_context: Optional[ssl.SSLContext] = None

        if not self.tls_verify and self.monitor_url.startswith("https"):
            self._ssl_context = ssl.create_default_context()
            self._ssl_context.check_hostname = False
            self._ssl_context.verify_mode = ssl.CERT_NONE

        atexit.register(self.close)

    def _worker_loop(self) -> None:
        while True:
            try:
                item = self._queue.get()
                if item is None:
                    break
                self._send(item)
            except Exception as exc:  # pragma: no cover - last-resort guard
                self._safe_log(f"[OmicHubMonitor] Worker error: {exc}")
            finally:
                self._queue.task_done()

    def _safe_log(self, message: str) -> None:
        """Print a short message to stderr without leaking secrets."""
        print(message, file=sys.stderr)

    def _build_payload(self, message: str, record: Dict[str, Any]) -> Dict[str, Any]:
        """Construct the omichub.workflow_event.v1 payload."""
        plain_text, props = extract_snakemake_event(message)
        raw_log = {
            "msg": plain_text,
            "caller": f"{record.get('name', 'unknown')}:{record.get('function', 'unknown')}:{record.get('line', 0)}",
            "level": record.get("level", {}).get("name", "INFO").lower(),
        }
        raw_log.update(props)

        progress_info = self._tracker.update(raw_log)

        level = raw_log["level"]
        # Map loguru-style level names to a small canonical set
        if level not in {"debug", "info", "warning", "error", "critical"}:
            level = "info"

        return {
            "schema_version": "omichub.workflow_event.v1",
            "task_id": self.task_id,
            "flow_id": self.flow_id,
            "user_id": self.user_id,
            "project_name": self.project_name,
            "timestamp": generate_timestamp(),
            "timestamp_ns": str(time.time_ns()),
            "level": level,
            "source": "snakemake",
            "message": plain_text,
            "caller": raw_log["caller"],
            "snakemake": {
                "rule": props.get("rule"),
                "job_id": props.get("job_id"),
                "event_type": props.get("event_type"),
                "shell_command": props.get("shell_command"),
                "progress_percent": progress_info["progress_percent"],
                "progress_details": progress_info["progress_details"],
            },
            "runtime": {
                "host": socket.gethostname(),
                "pid": os.getpid(),
                "user": getpass.getuser(),
                "cwd": os.getcwd(),
                "command": " ".join(sys.argv),
            },
        }

    def _send(self, item: Dict[str, Any]) -> None:
        """Serialize and send one event to the OmicHub endpoint."""
        message = item["message"]
        record = item["record"]

        try:
            payload = self._build_payload(message, record)
            body_text = json.dumps(payload, ensure_ascii=False)
            body = body_text.encode("utf-8")

            headers = {
                "Content-Type": "application/json",
            }
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"

            timestamp = generate_timestamp()
            nonce = generate_nonce()

            if self.encrypt_payload and self.encryption_key:
                envelope = encrypt_payload(body, self.encryption_key, timestamp=timestamp)
                body = json.dumps(envelope, ensure_ascii=False).encode("utf-8")
                headers["X-OmicHub-Event-Schema"] = "omichub.monitor.envelope.v1"
                headers["X-OmicHub-Encrypted"] = "A256GCM"
            else:
                headers["X-OmicHub-Event-Schema"] = "omichub.workflow_event.v1"

            if self.sign_requests and self.signing_key:
                signature = sign_request(body, self.signing_key, timestamp, nonce)
                headers["X-OmicHub-Timestamp"] = timestamp
                headers["X-OmicHub-Nonce"] = nonce
                headers["X-OmicHub-Signature"] = signature

            last_exception: Optional[Exception] = None
            for attempt in range(self.retry_count):
                try:
                    req = urllib.request.Request(
                        self.monitor_url,
                        data=body,
                        headers=headers,
                        method="POST",
                    )
                    kwargs: Dict[str, Any] = {"timeout": self.timeout}
                    if self._ssl_context is not None:
                        kwargs["context"] = self._ssl_context
                    with urllib.request.urlopen(req, **kwargs) as response:
                        pass
                    return
                except HTTPError as exc:
                    last_exception = exc
                    # Do not retry 4xx errors (client/authentication errors)
                    if 400 <= exc.code < 500:
                        break
                    time.sleep(self.retry_backoff * (2 ** attempt))
                except (URLError, OSError, TimeoutError) as exc:
                    last_exception = exc
                    time.sleep(self.retry_backoff * (2 ** attempt))

            # All retries exhausted or non-retryable error
            self._safe_log(
                f"[OmicHubMonitor] Push failed after {self.retry_count} attempt(s): {last_exception}"
            )

        except Exception as exc:
            self._safe_log(f"[OmicHubMonitor] Unexpected send error: {exc}")

    def write(self, message: str) -> None:
        """
        loguru calls this method with the serialized JSON string.

        We put a parsed item into the queue for async processing.  If the queue
        is full, drop the event silently but emit a single short warning.
        """
        if self._closed:
            return

        try:
            data = json.loads(message)
            record = data.get("record", {})
            item = {"message": record.get("message", ""), "record": record}
        except Exception:
            item = {"message": message, "record": {}}

        try:
            self._queue.put(item, block=False)
        except queue.Full:
            self._safe_log("[OmicHubMonitor] Queue full, dropped event")

    def close(self) -> None:
        """Flush pending events and stop the worker thread."""
        if self._closed:
            return
        self._closed = True
        try:
            self._queue.put(None, timeout=1.0)
        except queue.Full:
            pass
        self._queue.join()
        self._worker.join(timeout=5.0)
        try:
            atexit.unregister(self.close)
        except Exception:
            pass

    def __del__(self) -> None:
        self.close()
