import re

def test_regex():
    patterns = [
        r"Rule:\s+(.+?),\s+Jobid:\s+(\d+)",
        r"Finished jobid:\s+(\d+)\s+\(Rule:\s+(.+?)\)"
    ]
    
    test_msgs = [
        "Rule: Report, Jobid: 148",
        "Finished jobid: 148 (Rule: Report)",
        "Finished jobid 148.",
        "Finished jobid 148 (Rule: Report).",
    ]
    
    for msg in test_msgs:
        print(f"Testing message: {msg}")
        for i, p in enumerate(patterns):
            match = re.search(p, msg)
            if match:
                print(f"  Pattern {i+1} matched: {match.groups()}")
            else:
                print(f"  Pattern {i+1} did NOT match")

if __name__ == "__main__":
    test_regex()
