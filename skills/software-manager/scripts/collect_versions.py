#!/usr/bin/env python3
"""Create a software version inventory from Conda environment YAML files."""
import argparse, json, re
from pathlib import Path
VERSION = re.compile(r"[^0-9A-Za-z.+!-]")
def config_entries(path):
    category = name = package = None; result = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        text = raw.split("#", 1)[0].rstrip()
        if text and not text.startswith(" ") and text.endswith(":"): category = text[:-1]
        elif text.strip().startswith("- name:"):
            name = text.split(":", 1)[1].strip().strip('"\'')
        elif text.strip().startswith("package:") and category and name:
            package = text.split(":", 1)[1].strip().strip('"\''); result.append((category, name, package)); name = package = None
    return result
def environments(paths):
    found = []
    for item in paths:
        if item.is_file(): found.append(item)
        elif item.is_dir(): found.extend(sorted(item.glob("*.yaml"))); found.extend(sorted(item.glob("*.yml")))
    return sorted(set(found))
def extract(path):
    versions = {}
    in_pip = False
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        text = raw.split("#", 1)[0].strip()
        if text == "pip:": in_pip = True; continue
        if not text.startswith("-"): continue
        value = text[1:].strip()
        if value == "pip:": in_pip = True; continue
        if in_pip and "==" in value: package, version = value.split("==", 1)
        elif "=" in value: package, version = value.split("=", 1)
        else: continue
        if package and version: versions[package.strip().lower()] = version.strip()
    return versions
def sort_key(value):
    return [int(bit) if bit.isdigit() else bit.lower() for bit in re.split(r"(\d+)", VERSION.sub("", value))]
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, nargs="+", type=Path); parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("software_list.yaml"))
    args = parser.parse_args()
    if not args.config.is_file(): parser.error(f"config file not found: {args.config}")
    files = environments(args.input)
    if not files: parser.error("no YAML environment files found")
    merged = {}
    for file in files:
        for package, version in extract(file).items():
            if package not in merged or sort_key(version) > sort_key(merged[package]): merged[package] = version
    rows = []
    for category, name, package in config_entries(args.config):
        version = merged.get(package.lower()); rows.append({"Function":category,"Software Name":name,"Version":f"v{version}" if version else "Not Installed"})
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "software_versions.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    missing = sum(row["Version"] == "Not Installed" for row in rows)
    summary = {"tool":"software-manager","version":"0.9.0","status":"success","outputs":[{"path":"software_versions.json","type":"table"}],"stats":{"environment_files":len(files),"tracked_software":len(rows),"installed":len(rows)-missing,"not_installed":missing},"warnings":[]}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__": main()
