#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QC Summary Script for RNAFlow Pipeline (Hybrid Version)
Integrates Python parsing logic with Rust high-performance I/O engine.
Fixed: FastQ Screen parsing logic to prevent negative percentages.
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
from rich.tree import Tree
from rich import box
from rich.align import Align

# --- Rust Extension Import ---
try:
    import data_deliver_rs
except ImportError:
    data_deliver_rs = None

__version__ = "0.1.0"

# Initialize Rich Console
console = Console()

# Configure Loguru
logger.remove()
logger.add(
    RichHandler(console=console, rich_tracebacks=True, markup=True, show_path=False),
    format="[bold green]{time:HH:mm:ss}[/bold green] | {level} | {message}",
    level="INFO"
)

# -----------------------------------------------------------------------------
# 1. Configuration & Utils
# -----------------------------------------------------------------------------

def display_config_tree(args, config: Dict):
    """Display configuration and run parameters in a tree structure."""
    tree = Tree(f"[bold cyan]🚀 RNAFlow QC & Delivery[/bold cyan]")
    
    # Paths Branch
    paths = tree.add("[bold yellow]📂 Paths[/bold yellow]")
    paths.add(f"Input:  [blue]{args.data_dir}[/blue]")
    paths.add(f"Output: [blue]{args.output_dir}[/blue]")
    paths.add(f"Config: [dim]{args.config}[/dim]")
    
    # Settings Branch
    delivery_conf = config.get('data_delivery', {})
    settings = tree.add("[bold magenta]⚙️  Settings[/bold magenta]")
    
    mode = delivery_conf.get('delivery_mode', 'symlink')
    mode_color = "green" if mode == "symlink" else "yellow"
    settings.add(f"Delivery Mode: [{mode_color}]{mode}[/{mode_color}]")
    
    threads = delivery_conf.get('threads', 4)
    settings.add(f"Threads: [cyan]{threads}[/cyan]")
    
    qc_enabled = delivery_conf.get('include_qc_summary', False)
    qc_status = "[green]Enabled[/green]" if qc_enabled else "[red]Disabled[/red]"
    settings.add(f"Data Delivery: {qc_status}")

    console.print(tree)
    console.print("")

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
                "contamination": [
                    "01.qc/fastq_screen_r1/*_screen.txt",
                    "01.qc/fastq_screen_r2/*_screen.txt"
                ]
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
        ('.R2.trimed.fq.gz', ''),
        ('_screen.txt', ''),
        ('_R1_screen.txt', ''),
        ('_R2_screen.txt', '')
    ]
    
    for suffix, replacement in patterns:
        if filename.endswith(suffix):
            name = filename.replace(suffix, replacement)
            if name.endswith('_R1'): name = name[:-3]
            if name.endswith('_R2'): name = name[:-3]
            return name
    
    return "unknown"

# -----------------------------------------------------------------------------
# 2. Parsing Logic (FastQC, Fastp, FastQ Screen)
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
                elif key == '%GC':
                    metrics['gc_content'] = float(value)
                elif key == 'Q30 bases':
                    try: metrics['q30_bases'] = int(value.replace(',', ''))
                    except ValueError: pass
        
        if 'total_sequences' in metrics and 'avg_sequence_length' in metrics and 'q30_bases' in metrics:
            total_bases = metrics['total_sequences'] * metrics['avg_sequence_length']
            metrics['q30_percentage'] = round((metrics['q30_bases'] / total_bases) * 100, 2) if total_bases > 0 else 0.0

    except Exception as e:
        logger.warning(f"Skipping problematic FastQC file {Path(fastqc_zip_path).name}: {e}")
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

        dup = data.get('duplication', {})
        metrics['duplication_rate'] = round(dup.get('rate', 0.0) * 100, 2)

        ins = data.get('insert_size', {})
        metrics['insert_size_peak'] = ins.get('peak', 0)

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

def parse_fastq_screen(txt_path: str) -> Dict[str, Any]:
    """Parses FastQ Screen text output for contamination metrics."""
    metrics = {}
    try:
        with open(txt_path, 'r') as f:
            lines = f.readlines()

        header_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('Genome') or line.startswith('Library'):
                header_idx = i
                break

        if header_idx == -1: return metrics

        # Parse header to identify column positions
        header_line = lines[header_idx].strip()
        header_parts = header_line.split()

        # Look for common column names in fastq_screen output
        # Typical format: Genome/Taxonomy, #Reads, %Unmapped, %Mapped, %One_hit, %Multiple_hits
        pct_mapped_idx = -1
        pct_unmapped_idx = -1

        for i, col in enumerate(header_parts):
            if col == '%Mapped':
                pct_mapped_idx = i
            elif col == '%Unmapped':
                pct_unmapped_idx = i
            # Also check for other common mapped percentage columns
            elif col in ['%One_hit', '%Unique']:
                pct_mapped_idx = i  # Use these as alternatives to %Mapped

        screen_data = {}
        for line in lines[header_idx+1:]:
            line = line.strip()
            if not line or line.startswith('%'): continue

            parts = line.split()

            # Determine which percentage column to use
            pct_value = None
            species = None

            if pct_mapped_idx != -1 and len(parts) > pct_mapped_idx:
                # Use the %Mapped column directly (this is the percentage that mapped to this genome)
                try:
                    species = parts[0]  # First column is usually the species/genome name
                    pct_value = float(parts[pct_mapped_idx])
                except (ValueError, IndexError):
                    continue
            elif pct_unmapped_idx != -1 and len(parts) > pct_unmapped_idx:
                # If we only have %Unmapped, we should NOT calculate 100-%Unmapped
                # because that would be wrong for contamination detection
                # The %Unmapped column represents reads that did NOT map to this genome
                # So we should look for other columns or skip
                continue
            else:
                # Fallback: try to identify the species and percentage from the line structure
                # Usually it's [Species, Reads, Percentage, ...] where Percentage is %Mapped
                if len(parts) >= 3:
                    try:
                        species = parts[0]
                        # Try to parse the third column as percentage (after #Reads)
                        pct_value = float(parts[2])
                    except (ValueError, IndexError):
                        continue

            # Only add if it's a reasonable percentage value
            if pct_value is not None and species:
                # Only include values that are reasonable percentages
                # In some cases, very high values might indicate data format issues
                # but we'll be more permissive to handle various formats
                if 0 <= pct_value <= 100:
                    screen_data[species] = pct_value
                elif pct_value > 100:
                    # For values > 100, this might be due to specific data formats
                    # We'll include them since they might be valid in some contexts
                    # but log a warning
                    logger.warning(f"High percentage value ({pct_value}) for {species} in {Path(txt_path).name}")
                    screen_data[species] = pct_value

        metrics['screen_no_hit'] = 100.0
        for sp, hit_pct in screen_data.items():
            key = f"screen_{sp.lower().replace(' ', '_')}_pct"
            metrics[key] = round(hit_pct, 2)

    except Exception as e:
        logger.warning(f"Error parsing FastQ Screen {Path(txt_path).name}: {e}")
    return metrics

def process_qc_files(data_dir: Path, config: Dict) -> pd.DataFrame:
    # 1. FastQC
    fastqc_files = []
    for pattern in config['qc_files'].get('fastqc', []):
        found = list(data_dir.glob(pattern))
        fastqc_files.extend([p for p in found if str(p).endswith('.zip')])
    
    # 2. Fastp
    fastp_files = []
    for pattern in config['qc_files'].get('fastp', []):
        target_pattern = pattern if pattern.endswith('.json') else pattern.rsplit('.', 1)[0] + '.json'
        fastp_files.extend(list(data_dir.glob(target_pattern)))
    fastp_files = list(set(str(p) for p in fastp_files if str(p).endswith('.json')))

    # 3. Contamination (FastQ Screen)
    screen_files = []
    contamination_patterns = config['qc_files'].get('contamination', [])
    if contamination_patterns:  # Only process if contamination patterns are defined
        for pattern in contamination_patterns:
            found = list(data_dir.glob(pattern))
            screen_files.extend([p for p in found if str(p).endswith('.txt')])

    logger.info(f"Scanning directory: {data_dir.absolute()}")
    logger.info(f"Found [cyan]{len(fastqc_files)}[/cyan] FastQC, [cyan]{len(fastp_files)}[/cyan] Fastp, [cyan]{len(screen_files)}[/cyan] Screen files.")

    sample_data = {}
    with Progress(
        SpinnerColumn(), 
        TextColumn("[bold blue]{task.description}"), 
        BarColumn(bar_width=40, style="blue"), 
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"), 
        TextColumn("{task.completed}/{task.total}"),
        console=console
    ) as progress:
        
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
            
        task3 = progress.add_task("[yellow]Parsing Contamination...", total=len(screen_files))
        for f in screen_files:
            s_name = extract_sample_name_from_path(str(f))
            if s_name not in ["unknown", "ignore_me"]:
                if s_name not in sample_data: sample_data[s_name] = {}
                sample_data[s_name].update(parse_fastq_screen(str(f)))
            progress.advance(task3)

    df_rows = []
    for s_name, data in sample_data.items():
        row = {
            'sample_name': s_name,
            'reads_raw': data.get('total_sequences', data.get('input_reads', 0)),
            'len_raw': data.get('avg_sequence_length', data.get('input_avg_length', 0)),
            'data_mb_raw': data.get('input_data_size_mb', 0.0),
            'gc_content': data.get('gc_content', 0.0),
            
            'reads_clean': data.get('output_reads', 0),
            'data_mb_clean': data.get('output_data_size_mb', 0.0),
            'q30_clean': data.get('output_q30_rate', 0.0),
            'avg_len_clean': data.get('output_avg_length', 0),
            
            'duplication_rate': data.get('duplication_rate', 0.0),
            'insert_size': data.get('insert_size_peak', 0),
        }
        
        if row['data_mb_raw'] == 0 and row['reads_raw'] > 0 and row['len_raw'] > 0:
            row['data_mb_raw'] = round((row['reads_raw'] * row['len_raw']) / (1024**2), 2)
            
        # Add dynamic screen columns
        for k, v in data.items():
            if k.startswith('screen_'):
                row[k] = v

        df_rows.append(row)

    return pd.DataFrame(df_rows)

def save_outputs(df: pd.DataFrame, output_dir: Path, prefix: str):
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / f"{prefix}_table.csv"
    
    cols = ['sample_name', 'reads_raw', 'data_mb_raw', 'gc_content', 'duplication_rate', 
            'reads_clean', 'data_mb_clean', 'q30_clean', 'avg_len_clean', 'insert_size']
    existing_cols = df.columns.tolist()
    screen_cols = [c for c in existing_cols if c.startswith('screen_')]
    final_cols = [c for c in cols if c in existing_cols] + sorted(screen_cols)
    
    df[final_cols].to_csv(csv_path, index=False)
    
    stats = {
        "total_samples": len(df),
        "total_raw_data_gb": round(df['data_mb_raw'].sum() / 1024, 2),
        "total_clean_data_gb": round(df['data_mb_clean'].sum() / 1024, 2),
        "avg_q30_clean": round(df['q30_clean'].mean(), 2),
        "avg_gc": round(df['gc_content'].mean(), 2) if 'gc_content' in df else 0
    }
    json_path = output_dir / f"{prefix}_stats.json"
    with open(json_path, 'w') as f:
        json.dump(stats, f, indent=2)
    
    logger.info(f"Saved Summary CSV: [underline]{csv_path}[/underline]")
    logger.info(f"Saved Summary JSON: [underline]{json_path}[/underline]")

def display_summary_table(df: pd.DataFrame):
    if df.empty: return
    
    table = Table(
        title="📊 Detailed QC Summary Preview (Top 10)", 
        box=box.ROUNDED,
        header_style="bold white on blue",
        border_style="blue",
        title_style="bold cyan"
    )
    
    table.add_column("Sample", style="bold cyan", no_wrap=True)
    table.add_column("Clean Data\n(MB)", justify="right")
    table.add_column("Q30\n(%)", justify="right")
    table.add_column("GC\n(%)", justify="right")
    table.add_column("Dup\n(%)", justify="right")
    
    screen_keys = [c for c in df.columns if c.startswith('screen_') and 'no_hit' not in c]
    display_screen = screen_keys[:2] 
    for sk in display_screen:
        header = sk.replace('screen_', '').replace('_pct', '').replace('_', ' ').title()
        table.add_column(f"{header}\n(%)", justify="right", style="magenta")

    top_df = df.sort_values(by="sample_name").head(10)
    
    for _, row in top_df.iterrows():
        q30 = row.get('q30_clean', 0)
        q30_style = "green" if q30 >= 85 else ("yellow" if q30 >= 80 else "red")
        
        dup = row.get('duplication_rate', 0)
        dup_style = "green" if dup < 50 else "yellow"

        gc = row.get('gc_content', 0)
        gc_style = "white"
        if gc < 30 or gc > 70: gc_style = "yellow"

        row_data = [
            str(row['sample_name']), 
            f"{row.get('data_mb_clean',0):.1f}", 
            f"[{q30_style}]{q30}[/{q30_style}]",
            f"[{gc_style}]{gc}[/{gc_style}]",
            f"[{dup_style}]{dup}[/{dup_style}]"
        ]
        
        for sk in display_screen:
            val = row.get(sk, 0)
            style = "red" if val > 10 else "dim white" 
            row_data.append(f"[{style}]{val}[/{style}]")

        table.add_row(*row_data)
        
    console.print(table)
    if len(df) > 10: 
        console.print(Align.center(f"[dim]... and {len(df)-10} more samples hidden ...[/dim]"))
    console.print("")

# -----------------------------------------------------------------------------
# 3. Data Delivery (Rust Integration)
# -----------------------------------------------------------------------------

def run_delivery_task(config: Dict, data_dir: Path, output_dir: Path):
    if data_deliver_rs is None:
        console.print(Panel("[bold red]❌ Rust extension 'data_deliver_rs' not found![/bold red]\n\nSkipping delivery task.\nTip: Run 'maturin develop --release' to build.", border_style="red"))
        return

    delivery_conf = config.get('data_delivery', {})
    if not delivery_conf.get('include_qc_summary', False):
        logger.info("Skipping data delivery (disabled in config).")
        return

    files_to_deliver = set()
    patterns = delivery_conf.get('include_patterns', [])
    exclude_patterns = delivery_conf.get('exclude_patterns', [])
    
    for pattern in patterns:
        if "qc_summary" in pattern:
            matches = list(output_dir.glob(pattern))
            if not matches: matches = list(Path('.').glob(pattern))
        else:
            matches = list(data_dir.glob(pattern))
        
        for p in matches:
            files_to_deliver.add(str(p.absolute()))

    for pattern in exclude_patterns:
        matches = list(data_dir.glob(pattern))
        for p in matches:
            if str(p.absolute()) in files_to_deliver:
                files_to_deliver.remove(str(p.absolute()))
    
    file_list = list(files_to_deliver)
    if not file_list:
        logger.warning("No files matched the delivery patterns.")
        return

    mode = delivery_conf.get('delivery_mode', 'symlink')
    threads = int(delivery_conf.get('threads', 4))
    
    console.rule(f"[bold magenta]📦 Starting Data Delivery (Mode: {mode})[/bold magenta]")
    logger.info(f"Invoking Rust engine for {len(file_list)} files...")
    
    try:
        with console.status("[bold green]Rust Engine Running...[/bold green]", spinner="dots"):
            success, failed, size_gb = data_deliver_rs.run_local_delivery(
                file_list, 
                str(output_dir.absolute()), 
                mode, 
                threads
            )
        
        stats_table = Table(show_header=False, box=None)
        stats_table.add_row("✅ Success:", f"[green]{success}[/green]")
        stats_table.add_row("❌ Failed:", f"[red]{failed}[/red]")
        stats_table.add_row("💾 Total Size:", f"[blue]{size_gb:.2f} GB[/blue]")
        
        panel = Panel(
            stats_table, 
            title="[bold green]Delivery Complete[/bold green]", 
            border_style="green",
            expand=False
        )
        console.print(panel)
        
    except Exception as e:
        console.print(Panel(f"[bold red]Rust execution failed[/bold red]\n{e}", border_style="red"))

# -----------------------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="RNAFlow QC Summary & Delivery Tool")
    parser.add_argument("-v", "--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("-d", "--data-dir", type=str, default=".", help="Base directory (01.qc)")
    parser.add_argument("-o", "--output-dir", type=str, default="qc_delivery", help="Output directory")
    parser.add_argument("-c", "--config", type=str, default="config/qc_summary_config.yaml", help="Config YAML")
    parser.add_argument("-p", "--prefix", type=str, default="qc_summary", help="Output prefix")
    
    args = parser.parse_args()
    
    console.print("")
    console.print(Panel.fit(
        "[bold white]RNAFlow QC Summary Tool[/bold white]\n[dim]High-Performance Rust Accelerated[/dim]", 
        style="bold blue", 
        border_style="blue"
    ))
    console.print("")

    config = load_config(args.config)
    display_config_tree(args, config)

    data_path = Path(args.data_dir)
    output_path = Path(args.output_dir)

    try:
        df = process_qc_files(data_path, config)
        if df.empty:
            console.print(Panel("[bold red]No QC data found![/bold red]\nPlease check your input directory.", border_style="red"))
            sys.exit(1)
            
        console.rule("[bold cyan]💾 Saving Reports[/bold cyan]")
        save_outputs(df, output_path, args.prefix)
        display_summary_table(df)
        
        run_delivery_task(config, data_path, output_path)
        
        console.print("")
        console.print("[bold green]✨ All tasks completed successfully! ✨[/bold green]")
        console.print("")
        
    except KeyboardInterrupt:
        console.print("\n[bold red]⚠️ Process interrupted by user.[/bold red]")
        sys.exit(1)
    except Exception:
        console.print_exception()
        sys.exit(1)

if __name__ == "__main__":
    main()