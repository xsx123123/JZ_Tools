from rich.text import Text
import re
import json

def process_message(message):
    # 1. Strip Markup
    plain_text = Text.from_markup(message).plain
    
    properties = {}
    
    # 2. Extract Data (Simple Parsing)
    # Pattern 1: Rule: <name>, Jobid: <id>
    # "Rule: short_read_qc_r1, Jobid: 208"
    match1 = re.search(r"Rule:\s+(.+?),\s+Jobid:\s+(\d+)", plain_text)
    if match1:
        properties["Snakemake_Rule"] = match1.group(1)
        properties["Snakemake_JobId"] = int(match1.group(2))

    # Pattern 2: Finished jobid: <id> (Rule: <name>)
    # "✔ Finished jobid: 200 (Rule: short_read_qc_r1)"
    match2 = re.search(r"Finished jobid:\s+(\d+)\s+\(Rule:\s+(.+?)\)", plain_text)
    if match2:
        properties["Snakemake_JobId"] = int(match2.group(1))
        properties["Snakemake_Rule"] = match2.group(2)
        properties["Event_Type"] = "JobFinished"

    # Pattern 3: Shell command
    if plain_text.startswith("Shell command: "):
        properties["Shell_Command"] = plain_text.replace("Shell command: ", "").strip()
        properties["Event_Type"] = "ShellCommand"

    return plain_text, properties

# Test Cases
logs = [
    "[bold cyan]Rule:[/bold cyan] short_read_qc_r1, [bold magenta]Jobid:[/bold magenta] 208",
    "[bold green]✔ Finished jobid:[/bold green] 200 ([bold cyan]Rule:[/bold cyan] short_read_qc_r1)",
    "Shell command: fastqc 00.raw_data/link_dir/L1MKK1806691-a90/L1MKK1806691-a90_R2.fq.gz ...",
    "[bold yellow]Select jobs to execute...[/bold yellow]"
]

for log in logs:
    plain, props = process_message(log)
    print(f"Original: {log}")
    print(f"Plain:    {plain}")
    print(f"Props:    {json.dumps(props)}")
    print("-" * 20)
