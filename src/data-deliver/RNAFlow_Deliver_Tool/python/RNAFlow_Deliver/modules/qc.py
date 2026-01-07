# modules/qc.py
import sys
import json
import yaml
import pandas as pd
import zipfile
from pathlib import Path
from typing import Dict, Any
from loguru import logger
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn
from rich.panel import Panel
from rich.tree import Tree
from rich import box
from rich.align import Align

console = Console()

# --- Helpers ---
def load_config(config_path: str) -> Dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        logger.warning(f"Config file not found at {path}. Creating default QC config...")
        default_config = {
            "qc_files": {
                "fastqc": ["01.qc/short_read_qc_r1/*_R1_fastqc.zip", "01.qc/short_read_qc_r2/*_R2_fastqc.zip"],
                "fastp": ["01.qc/short_read_trim/*.trimed.json"],
                "contamination": ["01.qc/fastq_screen_r1/*_screen.txt", "01.qc/fastq_screen_r2/*_screen.txt"]
            }
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)
        return default_config

    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def extract_sample_name_from_path(file_path: str) -> str:
    filename = Path(file_path).name
    if "multiqc" in filename.lower(): return "ignore_me"
    patterns = [
        ('.trimed.json', ''), ('_R1_fastqc.zip', ''), ('_R2_fastqc.zip', ''),
        ('.R1.trimed.fq.gz', ''), ('.R2.trimed.fq.gz', ''),
        ('_screen.txt', ''), ('_R1_screen.txt', ''), ('_R2_screen.txt', '')
    ]
    for suffix, replacement in patterns:
        if filename.endswith(suffix):
            name = filename.replace(suffix, replacement)
            if name.endswith('_R1'): name = name[:-3]
            if name.endswith('_R2'): name = name[:-3]
            return name
    return "unknown"

# --- Parsers ---
def parse_fastqc_data(fastqc_zip_path: str) -> Dict[str, Any]:
    metrics = {}
    try:
        if not zipfile.is_zipfile(fastqc_zip_path): return metrics 
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
                if key == 'Total Sequences': metrics['total_sequences'] = int(value.replace(',', ''))
                elif key == 'Sequence length':
                    if '-' in value:
                        l_min, l_max = map(int, value.split('-'))
                        metrics['avg_sequence_length'] = (l_min + l_max) // 2
                    else: metrics['avg_sequence_length'] = int(value)
                elif key == '%GC': metrics['gc_content'] = float(value)
                elif key == 'Q30 bases':
                    try: metrics['q30_bases'] = int(value.replace(',', ''))
                    except ValueError: pass
        if 'total_sequences' in metrics and 'avg_sequence_length' in metrics and 'q30_bases' in metrics:
            total_bases = metrics['total_sequences'] * metrics['avg_sequence_length']
            metrics['q30_percentage'] = round((metrics['q30_bases'] / total_bases) * 100, 2) if total_bases > 0 else 0.0
    except Exception as e: logger.warning(f"FastQC Parse Error {Path(fastqc_zip_path).name}: {e}")
    return metrics

def parse_fastp_json(json_path: str) -> Dict[str, Any]:
    metrics = {}
    try:
        with open(json_path, 'r') as f: data = json.load(f)
        summary = data.get('summary', {})
        before = summary.get('before_filtering', {})
        metrics.update({
            'input_reads': before.get('total_reads', 0),
            'input_data_size_mb': round(before.get('total_bases', 0) / (1024**2), 2)
        })
        dup = data.get('duplication', {})
        metrics['duplication_rate'] = round(dup.get('rate', 0.0) * 100, 2)
        ins = data.get('insert_size', {})
        metrics['insert_size_peak'] = ins.get('peak', 0)
        after = summary.get('after_filtering', {})
        metrics.update({
            'output_reads': after.get('total_reads', 0),
            'output_data_size_mb': round(after.get('total_bases', 0) / (1024**2), 2),
            'output_q30_rate': round(after.get('q30_rate', 0.0) * 100, 2),
            'output_avg_length': after.get('mean_length', 0)
        })
    except Exception as e: logger.error(f"Fastp Parse Error {json_path}: {e}")
    return metrics

def parse_fastq_screen(txt_path: str) -> Dict[str, Any]:
    metrics = {}
    try:
        with open(txt_path, 'r') as f: lines = f.readlines()
        header_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('Genome') or line.startswith('Library'):
                header_idx = i; break
        if header_idx == -1: return metrics
        screen_data = {}
        for line in lines[header_idx+1:]:
            parts = line.strip().split()
            if len(parts) < 3 or line.startswith('%'): continue
            try:
                pct_unmapped = float(parts[2])
                screen_data[parts[0]] = 100.0 - pct_unmapped
            except ValueError: continue
        for sp, hit_pct in screen_data.items():
            metrics[f"screen_{sp.lower()}_pct"] = round(hit_pct, 2)
    except Exception as e: logger.warning(f"Screen Parse Error {Path(txt_path).name}: {e}")
    return metrics

# --- Main Logic ---
def process_qc_files(data_dir: Path, config: Dict) -> pd.DataFrame:
    fastqc_files = []
    for pattern in config['qc_files'].get('fastqc', []): fastqc_files.extend([p for p in list(data_dir.glob(pattern)) if str(p).endswith('.zip')])
    fastp_files = []
    for pattern in config['qc_files'].get('fastp', []): 
        target = pattern if pattern.endswith('.json') else pattern.rsplit('.', 1)[0] + '.json'
        fastp_files.extend(list(data_dir.glob(target)))
    fastp_files = list(set(str(p) for p in fastp_files))
    screen_files = []
    for pattern in config['qc_files'].get('contamination', []): screen_files.extend([p for p in list(data_dir.glob(pattern)) if str(p).endswith('.txt')])

    logger.info(f"Found {len(fastqc_files)} FastQC, {len(fastp_files)} Fastp, {len(screen_files)} Screen files.")
    sample_data = {}
    
    with Progress(SpinnerColumn(), TextColumn("[bold blue]{task.description}"), BarColumn(), TextColumn("[progress.percentage]{task.percentage:>3.0f}%"), console=console) as progress:
        t1 = progress.add_task("[cyan]Parsing FastQC...", total=len(fastqc_files))
        for f in fastqc_files:
            s = extract_sample_name_from_path(str(f))
            if s != "ignore_me": sample_data.setdefault(s, {}).update(parse_fastqc_data(str(f)))
            progress.advance(t1)
        t2 = progress.add_task("[magenta]Parsing Fastp...", total=len(fastp_files))
        for f in fastp_files:
            s = extract_sample_name_from_path(str(f))
            if s != "ignore_me": sample_data.setdefault(s, {}).update(parse_fastp_json(str(f)))
            progress.advance(t2)
        t3 = progress.add_task("[yellow]Parsing Screen...", total=len(screen_files))
        for f in screen_files:
            s = extract_sample_name_from_path(str(f))
            if s != "ignore_me": sample_data.setdefault(s, {}).update(parse_fastq_screen(str(f)))
            progress.advance(t3)

    rows = []
    for s, d in sample_data.items():
        row = {
            'sample_name': s,
            'reads_raw': d.get('total_sequences', d.get('input_reads', 0)),
            'data_mb_raw': d.get('input_data_size_mb', 0.0),
            'gc_content': d.get('gc_content', 0.0),
            'reads_clean': d.get('output_reads', 0),
            'data_mb_clean': d.get('output_data_size_mb', 0.0),
            'q30_clean': d.get('output_q30_rate', 0.0),
            'avg_len_clean': d.get('output_avg_length', 0),
            'duplication_rate': d.get('duplication_rate', 0.0),
            'insert_size': d.get('insert_size_peak', 0),
        }
        if row['data_mb_raw'] == 0 and row['reads_raw'] > 0:
            row['data_mb_raw'] = round((row['reads_raw'] * d.get('avg_sequence_length', 150)) / (1024**2), 2)
        for k, v in d.items():
            if k.startswith('screen_'): row[k] = v
        rows.append(row)
    return pd.DataFrame(rows)

def save_and_display(df: pd.DataFrame, output_dir: Path, prefix: str):
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / f"{prefix}_table.csv"
    
    base_cols = ['sample_name', 'reads_raw', 'data_mb_raw', 'gc_content', 'duplication_rate', 
            'reads_clean', 'data_mb_clean', 'q30_clean', 'avg_len_clean', 'insert_size']
    existing = df.columns.tolist()
    screen_cols = sorted([c for c in existing if c.startswith('screen_')])
    final_cols = [c for c in base_cols if c in existing] + screen_cols
    df[final_cols].to_csv(csv_path, index=False)
    
    stats = {
        "total_samples": len(df),
        "total_clean_data_gb": round(df['data_mb_clean'].sum() / 1024, 2),
        "avg_q30": round(df['q30_clean'].mean(), 2)
    }
    with open(output_dir / f"{prefix}_stats.json", 'w') as f: json.dump(stats, f, indent=2)
    
    logger.success(f"Saved: {csv_path}")
    
    # Display Table
    table = Table(title="QC Summary", box=box.ROUNDED, header_style="bold white on blue")
    table.add_column("Sample", style="cyan")
    table.add_column("Clean(MB)", justify="right")
    table.add_column("Q30(%)", justify="right")
    table.add_column("GC(%)", justify="right")
    table.add_column("Dup(%)", justify="right")
    
    for _, row in df.sort_values("sample_name").head(10).iterrows():
        q30_s = "green" if row.get('q30_clean',0) >= 85 else "red"
        dup_s = "green" if row.get('duplication_rate',0) < 50 else "yellow"
        table.add_row(
            str(row['sample_name']), 
            f"{row.get('data_mb_clean',0):.1f}", 
            f"[{q30_s}]{row.get('q30_clean',0)}[/{q30_s}]",
            f"{row.get('gc_content',0)}",
            f"[{dup_s}]{row.get('duplication_rate',0)}[/{dup_s}]"
        )
    console.print(table)

def run(args):
    config = load_config(args.config)
    df = process_qc_files(Path(args.data_dir), config)
    if df.empty:
        logger.error("No QC data found.")
        return
    save_and_display(df, Path(args.output_dir), args.prefix)
