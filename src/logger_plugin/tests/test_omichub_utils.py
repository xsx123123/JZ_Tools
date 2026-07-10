import base64
import json
import os
import queue
import time
from unittest.mock import MagicMock, patch

import pytest

from snakemake_logger_plugin_rich_loguru.omichub_utils import OmicHubMonitorHandler


def test_build_payload_job_finished():
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="test-token",
        task_id="task-123",
        flow_id="rna_seq",
        user_id="user-456",
    )
    record = {
        "name": "snakemake.logging",
        "function": "emit",
        "line": 42,
        "level": {"name": "INFO"},
    }
    payload = handler._build_payload("Finished jobid: 12 (Rule: trim_fastq)", record)

    assert payload["schema_version"] == "omichub.workflow_event.v1"
    assert payload["task_id"] == "task-123"
    assert payload["flow_id"] == "rna_seq"
    assert payload["user_id"] == "user-456"
    assert payload["level"] == "info"
    assert payload["snakemake"]["rule"] == "trim_fastq"
    assert payload["snakemake"]["job_id"] == 12
    assert payload["snakemake"]["event_type"] == "JobFinished"
    assert "progress_percent" in payload["snakemake"]
    assert "progress_details" in payload["snakemake"]
    assert "runtime" in payload
    handler.close()


def test_build_payload_shell_command():
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        task_id="task-123",
    )
    record = {
        "name": "snakemake.logging",
        "function": "emit",
        "line": 1,
        "level": {"name": "INFO"},
    }
    payload = handler._build_payload("Shell command: echo hello", record)
    assert payload["snakemake"]["event_type"] == "ShellCommand"
    assert payload["snakemake"]["shell_command"] == "echo hello"
    handler.close()


def test_payload_does_not_contain_token():
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="super-secret-token",
        task_id="task-123",
    )
    record = {
        "name": "snakemake.logging",
        "function": "emit",
        "line": 1,
        "level": {"name": "INFO"},
    }
    payload = handler._build_payload("Finished jobid: 1 (Rule: r)", record)
    payload_str = json.dumps(payload)
    assert "super-secret-token" not in payload_str
    handler.close()


def test_write_and_send():
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="test-token",
        task_id="task-123",
        retry_count=1,
    )

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        message = json.dumps({
            "record": {
                "message": "Finished jobid: 1 (Rule: r)",
                "name": "snakemake.logging",
                "function": "emit",
                "line": 1,
                "level": {"name": "INFO"},
            }
        })
        handler.write(message)
        handler.close()

        assert mock_urlopen.called
        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        assert req.get_header("Authorization") == "Bearer test-token"
        assert req.get_header("X-omichub-event-schema") == "omichub.workflow_event.v1"
        sent_body = json.loads(req.data)
        assert sent_body["schema_version"] == "omichub.workflow_event.v1"


def test_write_with_encryption():
    key = base64.b64encode(os.urandom(32)).decode("ascii")
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="test-token",
        task_id="task-123",
        encrypt_payload=True,
        encryption_key=key,
        retry_count=1,
    )

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        message = json.dumps({
            "record": {
                "message": "Finished jobid: 1 (Rule: r)",
                "name": "snakemake.logging",
                "function": "emit",
                "line": 1,
                "level": {"name": "INFO"},
            }
        })
        handler.write(message)
        handler.close()

        req = mock_urlopen.call_args[0][0]
        assert req.get_header("X-omichub-encrypted") == "A256GCM"
        assert req.get_header("X-omichub-event-schema") == "omichub.monitor.envelope.v1"
        envelope = json.loads(req.data)
        assert envelope["schema_version"] == "omichub.monitor.envelope.v1"


def test_write_with_signature():
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="test-token",
        task_id="task-123",
        sign_requests=True,
        signing_key="sign-key",
        retry_count=1,
    )

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        message = json.dumps({
            "record": {
                "message": "Finished jobid: 1 (Rule: r)",
                "name": "snakemake.logging",
                "function": "emit",
                "line": 1,
                "level": {"name": "INFO"},
            }
        })
        handler.write(message)
        handler.close()

        req = mock_urlopen.call_args[0][0]
        assert req.get_header("X-omichub-signature").startswith("v1=")
        assert req.get_header("X-omichub-timestamp")
        assert req.get_header("X-omichub-nonce")


def test_queue_full_does_not_block():
    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        task_id="task-123",
        queue_size=1,
        retry_count=1,
    )
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_response = MagicMock()
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        # Fill queue to capacity
        handler._queue.put({"message": "blocked", "record": {}}, block=False)
        # Third write should drop without raising
        message = json.dumps({"record": {"message": "x", "level": {"name": "INFO"}}})
        handler.write(message)
        handler.close()

        # Only one item should have been sent; the dropped write never reaches urlopen
        assert mock_urlopen.call_count == 1


def test_4xx_error_not_retried():
    from urllib.error import HTTPError

    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="bad-token",
        task_id="task-123",
        retry_count=3,
    )

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.side_effect = HTTPError(
            url="http://example.com/events",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=None,
        )

        handler._send({
            "message": "Finished jobid: 1 (Rule: r)",
            "record": {
                "message": "Finished jobid: 1 (Rule: r)",
                "name": "snakemake.logging",
                "function": "emit",
                "line": 1,
                "level": {"name": "INFO"},
            },
        })

        # 4xx should not retry
        assert mock_urlopen.call_count == 1
    handler.close()


def test_5xx_error_retried():
    from urllib.error import HTTPError

    handler = OmicHubMonitorHandler(
        monitor_url="http://example.com/events",
        token="test-token",
        task_id="task-123",
        retry_count=3,
        retry_backoff=0.01,
    )

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_urlopen.side_effect = [
            HTTPError(
                url="http://example.com/events",
                code=503,
                msg="Service Unavailable",
                hdrs={},
                fp=None,
            ),
            MagicMock(),
        ]

        handler._send({
            "message": "Finished jobid: 1 (Rule: r)",
            "record": {
                "message": "Finished jobid: 1 (Rule: r)",
                "name": "snakemake.logging",
                "function": "emit",
                "line": 1,
                "level": {"name": "INFO"},
            },
        })

        assert mock_urlopen.call_count == 2
    handler.close()
