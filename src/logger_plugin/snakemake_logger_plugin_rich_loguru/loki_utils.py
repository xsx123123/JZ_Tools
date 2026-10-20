import time
import json
import re
from typing import Dict, Any, Optional

from .utils import SnakemakeProgressTracker


def format_payload_for_loki(
    raw_log: Dict[str, Any],
    tracker: Optional[SnakemakeProgressTracker] = None,
    project_name: str = "unknown_project"
) -> Dict[str, Any]:
    """
    Format a Snakemake log dictionary into a Loki-compatible JSON payload.

    Features:
    - Auto-detects total job count from Snakemake 'Job stats' or 'X of Y steps' logs.
    - Tracks completed jobs via 'Finished jobid' messages.
    - Calculates accurate progress percentage based on detected real totals.

    Args:
        raw_log: The raw log dictionary containing msg, level, etc.
        tracker: A SnakemakeProgressTracker instance. If None, a disposable tracker
                 is used (progress state will not be persisted across calls).
        project_name: Explicit project name to use in Loki labels.
    """
    msg = raw_log.get("msg", "")

    if tracker is None:
        tracker = SnakemakeProgressTracker()
    progress_info = tracker.update(raw_log)

    # Project ID logic: use provided project_name as priority, then fallback to parsing
    project_id = project_name
    if project_id == "unknown_project" and "|" in msg:
        parts = msg.split("|", 1)
        candidate = parts[0].strip()
        if candidate and len(candidate) < 50:
            project_id = candidate

    log_content = raw_log.copy()
    log_content["progress_percent"] = progress_info["progress_percent"]
    log_content["progress_details"] = progress_info["progress_details"]

    if "msg" not in log_content:
        log_content["msg"] = msg

    ts_ns = str(time.time_ns())

    payload = {
        "streams": [
            {
                "stream": {
                    "project_id": project_id,
                    "job": "snakemake",
                    "level": raw_log.get("level", "INFO").upper(),
                },
                "values": [
                    [ts_ns, json.dumps(log_content, ensure_ascii=False)]
                ],
            }
        ]
    }
    return payload
