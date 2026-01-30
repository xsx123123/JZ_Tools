import time
import json
import re
from typing import Dict, Any

def format_payload_for_loki(raw_log: Dict[str, Any], estimated_total_jobs: int = 1000) -> Dict[str, Any]:
    """
    Format a Snakemake log dictionary into a Loki-compatible JSON payload.
    
    Features:
    - Auto-detects total job count from Snakemake 'Job stats' or 'X of Y steps' logs.
    - Tracks completed jobs via 'Finished jobid' messages.
    - Calculates accurate progress percentage based on detected real totals.
    - Extracts Project ID from log messages.
    """
    # Initialize state dictionary on the function object
    if not hasattr(format_payload_for_loki, "state"):
        format_payload_for_loki.state = {
            "current": 0,
            "real_total": 0,  # Detected from logs
            "finished_ids": set() # Track unique job IDs to avoid double counting
        }
    
    state = format_payload_for_loki.state
    msg = raw_log.get("msg", "")
    
    # --- 1. Progress Logic ---
    
    # Case A: Precise "X of Y steps" log (Gold Standard)
    # Example: "5 of 10 steps (50%) done"
    match_progress = re.search(r"(\d+)\s+of\s+(\d+)\s+steps", msg)
    if match_progress:
        state["current"] = int(match_progress.group(1))
        state["real_total"] = int(match_progress.group(2))

    # Case B: "Finished jobid" event (Incremental)
    # Use explicit Event_Type from handler or regex scan
    elif raw_log.get("Event_Type") == "JobFinished" or "Finished jobid:" in msg:
        # Try to extract Job ID to avoid double counting same job
        job_id_match = re.search(r"Finished jobid:\s*(\d+)", msg)
        if job_id_match:
            job_id = job_id_match.group(1)
            if job_id not in state["finished_ids"]:
                state["finished_ids"].add(job_id)
                state["current"] += 1
        else:
            # Fallback if ID parsing fails but we know it's a finish event
            state["current"] += 1

    # Case C: "Job stats" table (Total detection)
    # Snakemake prints a table with a 'total' row at the start
    if "Job stats:" in msg or "count" in msg:
        # Look for the 'total' row in the table, e.g., "total     14"
        match_total = re.search(r"total\s+(\d+)", msg)
        if match_total:
             state["real_total"] = int(match_total.group(1))

    # Case D: Completion/Nothing to be done
    if "Complete log(s):" in msg or "Nothing to be done" in msg:
        # Force completion state
        if state["real_total"] > 0:
            state["current"] = state["real_total"]
        else:
            # If we never saw a total, just make it 100% arbitrarily
            state["current"] = estimated_total_jobs 
            state["real_total"] = estimated_total_jobs

    # Calculate Percentage
    # Use real_total if we found it, otherwise fallback to estimated
    denominator = state["real_total"] if state["real_total"] > 0 else estimated_total_jobs
    
    # Safety: ensure denominator is at least 1 to avoid div/0
    denominator = max(denominator, 1)
    
    progress = (state["current"] / denominator) * 100.0
    
    # Clamp to 100%
    if progress > 100.0: 
        progress = 100.0

    # --- 2. Project ID Logic ---
    project_id = "unknown_project"
    if "|" in msg:
        parts = msg.split("|", 1)
        candidate = parts[0].strip()
        if candidate and len(candidate) < 50:
            project_id = candidate

    # --- 3. Payload Construction ---
    log_content = raw_log.copy()
    log_content["progress_percent"] = round(progress, 2)
    # Add debug info about how we calculated it (Optional, useful for verifying)
    # log_content["_progress_debug"] = f"{state['current']}/{denominator} (RealTotal: {state['real_total']})"
    
    if "msg" not in log_content:
        log_content["msg"] = msg

    ts_ns = str(time.time_ns())
    
    payload = {
        "streams": [
            {
                "stream": {
                    "project_id": project_id,
                    "job": "snakemake",
                    "level": raw_log.get("level", "INFO").upper()
                },
                "values": [
                    [ts_ns, json.dumps(log_content, ensure_ascii=False)]
                ]
            }
        ]
    }
    return payload