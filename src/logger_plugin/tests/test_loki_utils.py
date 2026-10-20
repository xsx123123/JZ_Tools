import pytest
from snakemake_logger_plugin_rich_loguru.loki_utils import format_payload_for_loki
from snakemake_logger_plugin_rich_loguru.utils import SnakemakeProgressTracker
import json


def test_format_payload_progress_steps():
    tracker = SnakemakeProgressTracker()
    raw_log = {"msg": "10 of 100 steps (10%) done", "level": "INFO"}
    
    payload = format_payload_for_loki(raw_log, tracker=tracker, project_name="test_proj")
    
    progress = tracker.update({"msg": "", "level": "INFO"})
    assert progress["current"] == 10
    assert progress["real_total"] == 100
    
    data = json.loads(payload["streams"][0]["values"][0][1])
    assert data["progress_percent"] == 10.0
    assert data["progress_details"] == "10/100"


def test_format_payload_job_stats():
    tracker = SnakemakeProgressTracker()
    raw_log = {"msg": "job             count\n--------------  -----\nrule1           10\ntotal           10", "level": "INFO"}
    
    format_payload_for_loki(raw_log, tracker=tracker)
    progress = tracker.update({"msg": "", "level": "INFO"})
    assert progress["real_total"] == 10
    
    # Second log with finished job
    raw_log2 = {"msg": "Finished jobid 1.", "Event_Type": "JobFinished", "level": "INFO"}
    payload2 = format_payload_for_loki(raw_log2, tracker=tracker)
    
    progress2 = tracker.update({"msg": "", "level": "INFO"})
    assert progress2["current"] == 1
    data2 = json.loads(payload2["streams"][0]["values"][0][1])
    assert data2["progress_percent"] == 10.0


def test_project_id_logic():
    tracker = SnakemakeProgressTracker()
    raw_log = {"msg": "MyProject | Some message", "level": "INFO"}
    
    # Case 1: Explicit project name
    payload1 = format_payload_for_loki(raw_log, tracker=tracker, project_name="ExplicitName")
    assert payload1["streams"][0]["stream"]["project_id"] == "ExplicitName"
    
    # Case 2: Fallback to parsing
    payload2 = format_payload_for_loki(raw_log, tracker=tracker, project_name="unknown_project")
    assert payload2["streams"][0]["stream"]["project_id"] == "MyProject"
