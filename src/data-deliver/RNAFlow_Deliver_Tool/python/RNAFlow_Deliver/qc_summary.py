#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QC Summary Script for RNAFlow Pipeline (Hybrid Version)
Integrates Python parsing logic with Rust high-performance I/O engine.
"""

import os
import json
import pandas as pd
import zipfile
import yaml
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Any

# --- Third-party libraries ---
from loguru import logger
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn
from rich.panel import Panel
from rich.logging import RichHandler

# --- Rust Extension Import ---
try:
    import data_deliver_rs
except ImportError:
    data_deliver_rs = None

# Initialize Rich Console
console = Console()

# Configure Loguru
logger.remove()
logger.add(
    RichHandler(console=console, rich_tracebacks=True, markup=True),
    format="[bold green]{time:HH:mm:ss}[/bold green] | {level} | {message}",
    level="INFO"
)

# -----------------------------------------------------------------------------
# 1. Configuration & Utils
# -----------------------------------------------------------------------------

def load_config(config_path: str) -> Dict[str, Any]:
    """Load configuration YAML."""
    path = Path(config_path)
    if not path.exists():
        logger.warning(f"Config file not found at {path}. Creating default config...")
        default_config = {
            "qc_files": {
                "fastqc": [
                    "01.qc/short_read_qc_r1/*_R1_fastqc.zip",
                    "01.qc/short_read_qc_r2/*_R2_fastqc.zip",
                ],
                "fastp": [
                    "01.qc/short_read_trim/*.trimed.json",
                ],
            },
            "data_delivery": {
                "include_qc_summary": True,
                "output_dir": "./qc_delivery",
                "delivery_mode": "symlink",
                "threads": 4,
                "include_patterns": [
                    "qc_summary_table.csv",
                    "qc_summary_stats.json"
                ],
                "exclude_patterns": []
            }
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)
        return default_config

    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def extract_sample_name_from_path(file_path: str) -> str:
    """Extract sample name based on common bioinfo patterns."""
    filename = Path(file_path).name
    
    if "multiqc" in filename.lower():
        return "ignore_me"

    patterns = [
        ('.trimed.json', ''),
        ('_R1_fastqc.zip', ''),
        ('_R2_fastqc.zip', ''),
        ('.R1.trimed.fq.gz', ''),
        ('.R2.trimed.fq.gz', '')
    ]
    
    for suffix, replacement in patterns:
        if filename.endswith(suffix):
            return filename.replace(suffix, replacement)
    
    return "unknown"

# -----------------------------------------------------------------------------
# 2. Parsing Logic (FastQC & Fastp)
# -----------------------------------------------------------------------------

def parse_fastqc_data(fastqc_zip_path: str) -> Dict[str, Any]:
    metrics = {}
    try:
        if not zipfile.is_zipfile(fastqc_zip_path):
            return metrics 

        with zipfile.ZipFile(fastqc_zip_path, 'r') as zip_ref:
            data_file_name = next((n for n in zip_ref.namelist() if n.endswith('fastqc_data.txt')), None)
            if not data_file_name: return metrics

            with zip_ref.open(data_file_name) as data_file:
                content = data_file.read().decode('utf-8')

            for line in content.split('\n'):
                if line.startswith('>>'): continue
                parts = line.strip().split('\t')
                if len(parts) < 2: continue
                
                key, value = parts[0], parts[1]
                if key == 'Total Sequences':
                    metrics['total_sequences'] = int(value.replace(',', ''))
                elif key == 'Sequence length':
                    if '-' in value:
                        l_min, l_max = map(int, value.split('-'))
                        metrics['avg_sequence_length'] = (l_min + l_max) // 2
                    else:
                        metrics['avg_sequence_length'] = int(value)
                elif key == 'Q30 bases':
                    try: metrics['q30_bases'] = int(value.replace(',', ''))
                    except ValueError: pass
        
        if 'total_sequences' in metrics and 'avg_sequence_length' in metrics and 'q30_bases' in metrics:
            total_bases = metrics['total_sequences'] * metrics['avg_sequence_length']
            metrics['q30_percentage'] = round((metrics['q30_bases'] / total_bases) * 100, 2) if total_bases > 0 else 0.0

    except Exception as e:
        logger.warning(f"Skipping problematic file {Path(fastqc_zip_path).name}: {e}")
    return metrics

def parse_fastp_json(json_path: str) -> Dict[str, Any]:
    metrics = {}
    try:
        with open(json_path, 'r') as f:
            data = json.load(f)
        
        summary = data.get('summary', {})
        before = summary.get('before_filtering', {})
        metrics.update({
            'input_reads': before.get('total_reads', 0),
            'input_bases': before.get('total_bases', 0),
            'input_q30_rate': round(before.get('q30_rate', 0.0) * 100, 2),
            'input_avg_length': before.get('mean_length', 0),
            'input_data_size_mb': round(before.get('total_bases', 0) / (1024**2), 2)
        })

        after = summary.get('after_filtering', {})
        metrics.update({
            'output_reads': after.get('total_reads', 0),
            'output_bases': after.get('total_bases', 0),
            'output_q30_rate': round(after.get('q30_rate', 0.0) * 100, 2),
            'output_avg_length': after.get('mean_length', 0),
            'output_data_size_mb': round(after.get('total_bases', 0) / (1024**2), 2)
        })

    except Exception as e:
        logger.error(f"Error parsing fastp JSON {json_path}: {e}")
    return metrics

def process_qc_files(data_dir: Path, config: Dict) -> pd.DataFrame:
    # Strict Filtering Logic
    fastqc_files = []
    for pattern in config['qc_files'].get('fastqc', []):
        found = list(data_dir.glob(pattern))
        fastqc_files.extend([p for p in found if str(p).endswith('.zip')])
    
    fastp_files = []
    for pattern in config['qc_files'].get('fastp', []):
        target_pattern = pattern if pattern.endswith('.json') else pattern.rsplit('.', 1)[0] + '.json'
        fastp_files.extend(list(data_dir.glob(target_pattern)))
    fastp_files = list(set(str(p) for p in fastp_files if str(p).endswith('.json')))

    logger.info(f"Processing {len(fastqc_files)} FastQC zips and {len(fastp_files)} Fastp JSONs.")

    sample_data = {}
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), BarColumn(), TextColumn("[progress.percentage]{task.percentage:>3.0f}%"), console=console) as progress:
        
        task1 = progress.add_task("[cyan]Parsing FastQC...", total=len(fastqc_files))
        for f in fastqc_files:
            s_name = extract_sample_name_from_path(str(f))
            if s_name not in ["unknown", "ignore_me"]:
                if s_name not in sample_data: sample_data[s_name] = {}
                sample_data[s_name].update(parse_fastqc_data(str(f)))
            progress.advance(task1)

        task2 = progress.add_task("[magenta]Parsing Fastp...", total=len(fastp_files))
        for f in fastp_files:
            s_name = extract_sample_name_from_path(str(f))
            if s_name not in ["unknown", "ignore_me"]:
                if s_name not in sample_data: sample_data[s_name] = {}
                sample_data[s_name].update(parse_fastp_json(str(f)))
            progress.advance(task2)

    df_rows = []
    for s_name, data in sample_data.items():
        row = {
            'sample_name': s_name,
            'reads_raw': data.get('total_sequences', data.get('input_reads', 0)),
            'q30_raw': data.get('q30_percentage', data.get('input_q30_rate', 0.0)),
            'len_raw': data.get('avg_sequence_length', data.get('input_avg_length', 0)),
            'data_mb_raw': data.get('input_data_size_mb', 0.0),
            'data_mb_clean': data.get('output_data_size_mb', 0.0),
            'reads_clean': data.get('output_reads', 0),
            'q30_clean': data.get('output_q30_rate', 0.0)
        }
        if row['data_mb_raw'] == 0 and row['reads_raw'] > 0 and row['len_raw'] > 0:
            row['data_mb_raw'] = round((row['reads_raw'] * row['len_raw']) / (1024**2), 2)
        df_rows.append(row)

    return pd.DataFrame(df_rows)

def save_outputs(df: pd.DataFrame, output_dir: Path, prefix: str):
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / f"{prefix}_table.csv"
    df.to_csv(csv_path, index=False)
    
    stats = {
        "total_samples": len(df),
        "total_raw_data_gb": round(df['data_mb_raw'].sum() / 1024, 2),
        "total_clean_data_gb": round(df['data_mb_clean'].sum() / 1024, 2),
        "avg_q30_clean": round(df['q30_clean'].mean(), 2)
    }
    json_path = output_dir / f"{prefix}_stats.json"
    with open(json_path, 'w') as f:
        json.dump(stats, f, indent=2)
    
    logger.success(f"Saved Summary CSV: {csv_path}")
    logger.success(f"Saved Summary JSON: {json_path}")

def display_summary_table(df: pd.DataFrame):
    if df.empty: return
    table = Table(title="QC Summary Preview (Top 10)")
    table.add_column("Sample", style="cyan", no_wrap=True)
    table.add_column("Raw Reads", justify="right")
    table.add_column("Raw Q30(%)", justify="right")
    table.add_column("Clean Data(MB)", justify="right", style="green")
    
    for _, row in df.sort_values(by="sample_name").head(10).iterrows():
        table.add_row(str(row['sample_name']), f"{int(row['reads_raw']):,}", f"{row['q30_raw']}", f"{row['data_mb_clean']}")
    console.print(table)
    if len(df) > 10: console.print(f"[dim]... and {len(df)-10} more samples.[/dim]")

# -----------------------------------------------------------------------------
# 3. Data Delivery (Rust Integration)
# -----------------------------------------------------------------------------

def run_delivery_task(config: Dict, data_dir: Path, output_dir: Path):
    """
    Invokes the compiled Rust extension 'data_deliver_rs' for high-speed file handling.
    """
    if data_deliver_rs is None:
        logger.warning("[yellow]Rust extension 'data_deliver_rs' not found. Skipping delivery task.[/yellow]")
        logger.warning("Tip: Run 'maturin develop --release' to build the extension.")
        return

    delivery_conf = config.get('data_delivery', {})
    if not delivery_conf.get('include_qc_summary', False):
        logger.info("Skipping data delivery (disabled in config).")
        return

    logger.info("Collecting files for delivery...")

    files_to_deliver = set()
    patterns = delivery_conf.get('include_patterns', [])
    exclude_patterns = delivery_conf.get('exclude_patterns', [])
    
    # Resolve Include Patterns
    for pattern in patterns:
        if "qc_summary" in pattern:
            # Look in output_dir
            matches = list(output_dir.glob(pattern))
            if not matches: matches = list(Path('.').glob(pattern))
        else:
            # Look in data_dir
            matches = list(data_dir.glob(pattern))
        
        for p in matches:
            files_to_deliver.add(str(p.absolute()))

    # Resolve Exclude Patterns
    for pattern in exclude_patterns:
        matches = list(data_dir.glob(pattern))
        for p in matches:
            if str(p.absolute()) in files_to_deliver:
                files_to_deliver.remove(str(p.absolute()))
    
    file_list = list(files_to_deliver)
    if not file_list:
        logger.warning("No files matched the delivery patterns.")
        return

    # Call Rust Engine
    mode = delivery_conf.get('delivery_mode', 'symlink')
    threads = int(delivery_conf.get('threads', 4))
    
    logger.info(f"Invoking Rust engine to process {len(file_list)} files (Mode: {mode})...")
    
    try:
        # Calls: run_local_delivery(files, output_dir, mode, threads) -> (success, failed, size_gb)
        success, failed, size_gb = data_deliver_rs.run_local_delivery(
            file_list, 
            str(output_dir.absolute()), 
            mode, 
            threads
        )
        logger.success(f"Data delivery completed via Rust! Success: {success}, Failed: {failed}, Total: {size_gb:.2f} GB")
        
    except Exception as e:
        logger.error(f"Rust engine execution failed: {e}")

# -----------------------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="RNAFlow QC Summary & Delivery Tool")
    parser.add_argument("-d", "--data-dir", type=str, default=".", help="Base directory (01.qc)")
    parser.add_argument("-o", "--output-dir", type=str, default="qc_delivery", help="Output directory")
    parser.add_argument("-c", "--config", type=str, default="config/qc_summary_config.yaml", help="Config YAML")
    parser.add_argument("-p", "--prefix", type=str, default="qc_summary", help="Output prefix")
    
    args = parser.parse_args()
    
    console.print(Panel.fit(f"[bold blue]RNAFlow QC Summary[/bold blue]\nTarget: {args.data_dir}", border_style="blue"))

    config = load_config(args.config)
    data_path = Path(args.data_dir)
    output_path = Path(args.output_dir)

    try:
        # Step 1: Analyze & Parse
        df = process_qc_files(data_path, config)
        if df.empty:
            logger.error("No QC data extracted!")
            sys.exit(1)
            
        # Step 2: Save Summary Reports
        save_outputs(df, output_path, args.prefix)
        display_summary_table(df)
        
        # Step 3: Deliver Data (Rust)
        run_delivery_task(config, data_path, output_path)
        
    except KeyboardInterrupt:
        console.print("\n[red]Process interrupted.[/red]")
        sys.exit(1)
    except Exception:
        console.print_exception()
        sys.exit(1)

if __name__ == "__main__":
    main()