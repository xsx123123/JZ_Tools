import json
import re
from typing import Dict, Any

# Mock the stateful function for testing
def format_payload_for_loki(raw_log: Dict[str, Any], estimated_total_jobs: int = 1000) -> Dict[str, Any]:
    if not hasattr(format_payload_for_loki, "state"):
        format_payload_for_loki.state = {
            "current": 0,
            "real_total": 0,
            "finished_ids": set()
        }
    
    state = format_payload_for_loki.state
    msg = raw_log.get("msg", "")
    
    # Case A: Precise "X of Y steps" log
    match_progress = re.search(r"(\d+)\s+of\s+(\d+)\s+steps", msg)
    if match_progress:
        state["current"] = int(match_progress.group(1))
        state["real_total"] = int(match_progress.group(2))

    # Case B: "Finished jobid" event
    elif raw_log.get("Event_Type") == "JobFinished" or "Finished jobid:" in msg:
        job_id_match = re.search(r"Finished jobid:\s*(\d+)", msg)
        if job_id_match:
            job_id = job_id_match.group(1)
            if job_id not in state["finished_ids"]:
                state["finished_ids"].add(job_id)
                state["current"] += 1
        else:
            state["current"] += 1

    # Case C: "Job stats" table (Total detection)
    if "Job stats:" in msg or "count" in msg:
        match_total = re.search(r"total\s+(\d+)", msg)
        if match_total:
             state["real_total"] = int(match_total.group(1))

    # Case D: Completion
    if "Complete log(s):" in msg or "Nothing to be done" in msg:
        if state["real_total"] > 0:
            state["current"] = state["real_total"]
        else:
            state["current"] = estimated_total_jobs 
            state["real_total"] = estimated_total_jobs

    denominator = state["real_total"] if state["real_total"] > 0 else estimated_total_jobs
    denominator = max(denominator, 1)
    progress = (state["current"] / denominator) * 100.0
    if progress > 100.0: progress = 100.0

    return {
        "progress_percent": round(progress, 2),
        "current": state["current"],
        "real_total": state["real_total"],
        "msg": msg
    }

def test_progress():
    # Test 1: Start sequence
    logs = [
        "Job stats:",
        "job               count    min threads    max threads",
        "----------------  -------  -------------  -------------",
        "all                   1              1              1",
        "total                11              1              1",
    ]
    
    print("--- Test 1: Job Stats Table (Line by Line) ---")
    for log in logs:
        res = format_payload_for_loki({"msg": log})
        print(f"Log: {log[:20]:<20} | Progress: {res['progress_percent']:>5} | Current: {res['current']} | Total: {res['real_total']}")

    # Test 2: Job starting
    print("\n--- Test 2: Job Starting ---")
    res = format_payload_for_loki({"msg": "Rule: myrule, Jobid: 1"})
    print(f"Log: {'Rule: myrule...':<20} | Progress: {res['progress_percent']:>5} | Current: {res['current']} | Total: {res['real_total']}")

    # Test 3: Job finished
    print("\n--- Test 3: Job Finished ---")
    res = format_payload_for_loki({"msg": "Finished jobid: 1 (Rule: myrule)"})
    print(f"Log: {'Finished jobid: 1...':<20} | Progress: {res['progress_percent']:>5} | Current: {res['current']} | Total: {res['real_total']}")

    # Test 4: X of Y steps
    print("\n--- Test 4: X of Y steps ---")
    res = format_payload_for_loki({"msg": "1 of 11 steps (9%) done"})
    print(f"Log: {'1 of 11 steps...':<20} | Progress: {res['progress_percent']:>5} | Current: {res['current']} | Total: {res['real_total']}")

if __name__ == "__main__":
    test_progress()
