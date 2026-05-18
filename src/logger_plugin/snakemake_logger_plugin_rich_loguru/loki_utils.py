import time
import json
import re
from typing import Dict, Any


def format_payload_for_loki(
    raw_log: Dict[str, Any],
    state: Dict[str, Any],
    estimated_total_jobs: int = 1000,
    project_name: str = "unknown_project"
) -> Dict[str, Any]:
    """
    Format a Snakemake log dictionary into a Loki-compatible JSON payload.

    Features:
    - Auto-detects total job count from Snakemake 'Job stats' or 'X of Y steps' logs.
    - Tracks completed jobs via 'Finished jobid' messages.
    - Calculates accurate progress percentage based on detected real totals.
    - Extracts Project ID from log messages.

    Args:
        raw_log: The raw log dictionary containing msg, level, etc.
        state: Mutable state dict with keys 'current', 'real_total', 'finished_ids'.
               Must be managed by the caller (e.g. LokiHandler instance).
        estimated_total_jobs: Fallback total if no real total is detected.
        project_name: Explicit project name to use in Loki labels.
    """
    msg = raw_log.get("msg", "")

    # --- 1. Progress Logic ---

    # Case A: Precise "X of Y steps" log (Gold Standard)
    match_progress = re.search(r"(\d+)\s+of\s+(\d+)\s+steps", msg)
    if match_progress:
        state["current"] = int(match_progress.group(1))
        state["real_total"] = int(match_progress.group(2))

    # Case B: "Finished jobid" event (Incremental)
    elif raw_log.get("Event_Type") == "JobFinished" or re.search(
        r"Finished jobid[:\s]\s*(\d+)", msg
    ):
        job_id_match = re.search(r"Finished jobid[:\s]\s*(\d+)", msg)
        if job_id_match:
            job_id = job_id_match.group(1)
            if job_id not in state["finished_ids"]:
                state["finished_ids"].add(job_id)
                state["current"] += 1
        else:
            state["current"] += 1

    # Case C: "Job stats" table (Total detection)
    # Stricter regex: total followed by digits, anchored to line boundaries
    match_total = re.search(r"^\s*total\s+(\d+)\s*$", msg, re.MULTILINE)
    if match_total:
        found_total = int(match_total.group(1))
        if found_total > 0:
            # Lock: once real_total is set, do not overwrite to prevent mis-matches
            if state["real_total"] == 0:
                state["real_total"] = found_total

    # Case D: Completion/Nothing to be done
    if "Complete log(s):" in msg or "Nothing to be done" in msg:
        if state["real_total"] > 0:
            state["current"] = state["real_total"]
        else:
            state["current"] = estimated_total_jobs
            state["real_total"] = estimated_total_jobs

    # Calculate Percentage
    denominator = (
        state["real_total"] if state["real_total"] > 0 else estimated_total_jobs
    )

    # Safety: ensure denominator is at least 1 to avoid div/0
    denominator = max(denominator, 1)

    progress = (state["current"] / denominator) * 100.0

    # Clamp to 100%
    if progress > 100.0:
        progress = 100.0

    # --- 2. Project ID Logic ---
    # Use provided project_name as priority, then fallback to parsing
    project_id = project_name
    if project_id == "unknown_project" and "|" in msg:
        parts = msg.split("|", 1)
        candidate = parts[0].strip()
        if candidate and len(candidate) < 50:
            project_id = candidate

    # --- 3. Payload Construction ---
    log_content = raw_log.copy()
    log_content["progress_percent"] = round(progress, 2)
    log_content["progress_details"] = (
        f"{state['current']}/{denominator} (RealTotal: {state['real_total']})"
    )

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
