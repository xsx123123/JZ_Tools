from snakemake_logger_plugin_rich_loguru.loki_utils import format_payload_for_loki
import json

def test_progress():
    # Test 1: Start sequence (Line by Line)
    logs = [
        "Job stats:",
        "job               count    min threads    max threads",
        "----------------  -------  -------------  -------------",
        "all                   1              1              1",
        "total                11              1              1",
    ]
    
    print("--- Test 1: Job Stats Table (Line by Line) ---")
    for log in logs:
        # We simulate the project name prefix added in LokiHandler
        full_msg = f"Project | {log}"
        payload = format_payload_for_loki({"msg": full_msg})
        res = json.loads(payload["streams"][0]["values"][0][1])
        print(f"Log: {log[:20]:<20} | Progress: {res['progress_percent']:>5} | Total: {res.get('_progress_debug', 'N/A')}")

    # Reset state for other tests if needed, but here we want to see persistence
    
    # Test 2: Job starting
    print("\n--- Test 2: Job Starting ---")
    payload = format_payload_for_loki({"msg": "Project | Rule: myrule, Jobid: 1"})
    res = json.loads(payload["streams"][0]["values"][0][1])
    print(f"Log: {'Rule: myrule...':<20} | Progress: {res['progress_percent']:>5}")

    # Test 3: Job finished (Old format)
    print("\n--- Test 3: Job Finished (Old format) ---")
    payload = format_payload_for_loki({"msg": "Project | Finished jobid: 1 (Rule: myrule)"})
    res = json.loads(payload["streams"][0]["values"][0][1])
    print(f"Log: {'Finished jobid: 1...':<20} | Progress: {res['progress_percent']:>5}")

    # Test 4: Job finished (New format)
    print("\n--- Test 4: Job Finished (New format) ---")
    payload = format_payload_for_loki({"msg": "Project | Finished jobid 2."})
    res = json.loads(payload["streams"][0]["values"][0][1])
    print(f"Log: {'Finished jobid 2.':<20} | Progress: {res['progress_percent']:>5}")

    # Test 5: X of Y steps
    print("\n--- Test 5: X of Y steps ---")
    payload = format_payload_for_loki({"msg": "Project | 5 of 11 steps (45%) done"})
    res = json.loads(payload["streams"][0]["values"][0][1])
    print(f"Log: {'5 of 11 steps...':<20} | Progress: {res['progress_percent']:>5}")

if __name__ == "__main__":
    # Add debug info to format_payload_for_loki to see internal state
    import snakemake_logger_plugin_rich_loguru.loki_utils as loki_utils
    original_format = loki_utils.format_payload_for_loki
    
    def wrapped_format(raw_log, total=1000):
        payload = original_format(raw_log, total)
        data = json.loads(payload["streams"][0]["values"][0][1])
        state = original_format.state
        data["_progress_debug"] = f"{state['current']}/{state['real_total']}"
        payload["streams"][0]["values"][0][1] = json.dumps(data)
        return payload
        
    loki_utils.format_payload_for_loki = wrapped_format
    
    test_progress()
