import pytest
from snakemake_logger_plugin_rich_loguru.loki_utils import format_payload_for_loki
import json

def test_format_payload_progress_steps():
    state = {"current": 0, "real_total": 0, "finished_ids": set()}
    raw_log = {"msg": "10 of 100 steps (10%) done", "level": "INFO"}
    
    payload = format_payload_for_loki(raw_log, state, project_name="test_proj")
    
    assert state["current"] == 10
    assert state["real_total"] == 100
    
    data = json.loads(payload["streams"][0]["values"][0][1])
    assert data["progress_percent"] == 10.0
    assert data["progress_details"] == "10/100 (RealTotal: 100)"

def test_format_payload_job_stats():
    state = {"current": 0, "real_total": 0, "finished_ids": set()}
    raw_log = {"msg": "job             count\n--------------  -----\nrule1           10\ntotal           10", "level": "INFO"}
    
    format_payload_for_loki(raw_log, state)
    assert state["real_total"] == 10
    
    # Second log with finished job
    raw_log2 = {"msg": "Finished jobid 1.", "Event_Type": "JobFinished", "level": "INFO"}
    payload2 = format_payload_for_loki(raw_log2, state)
    
    assert state["current"] == 1
    data2 = json.loads(payload2["streams"][0]["values"][0][1])
    assert data2["progress_percent"] == 10.0

def test_project_id_logic():
    state = {"current": 0, "real_total": 0, "finished_ids": set()}
    raw_log = {"msg": "MyProject | Some message", "level": "INFO"}
    
    # Case 1: Explicit project name
    payload1 = format_payload_for_loki(raw_log, state, project_name="ExplicitName")
    assert payload1["streams"][0]["stream"]["project_id"] == "ExplicitName"
    
    # Case 2: Fallback to parsing
    payload2 = format_payload_for_loki(raw_log, state, project_name="unknown_project")
    assert payload2["streams"][0]["stream"]["project_id"] == "MyProject"
