# modules/merge.py
import sys
import json
import yaml
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List
from loguru import logger
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn
from rich.panel import Panel
from rich.tree import Tree
from rich import box
import glob

console = Console()

# --- Helpers ---
def load_config(config_path: str) -> Dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        logger.error(f"Config file not found at {path}")
        return None

    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def extract_sample_name_from_path(file_path: str) -> str:
    """Extract sample name from file path"""
    filename = Path(file_path).name
    # Remove common suffixes and extensions
    patterns = [
        ('.trimed.json', ''), ('_R1_fastqc.zip', ''), ('_R2_fastqc.zip', ''),
        ('.R1.trimed.fq.gz', ''), ('.R2.trimed.fq.gz', ''),
        ('_screen.txt', ''), ('_R1_screen.txt', ''), ('_R2_screen.txt', ''),
        ('.Aligned.sortedByCoord.out.bam', ''), ('.Aligned.toTranscriptome.out.bam', ''),
        ('.Log.final.out', ''), ('.sort.bam', ''), ('.sort.bam.bai', ''),
        ('.genes.results', ''), ('.isoforms.results', ''), ('.final.pass.vcf', ''),
        ('.raw_variants.vcf', ''), ('.fusions.tsv', ''), ('.fusions.discarded.tsv', ''),
        ('.fusions.pdf', ''), ('.summary.txt', ''), ('.SE.MATS.JC.txt', ''),
        ('.MXE.MATS.JC.txt', ''), ('.cnt', ''), ('.model', ''), ('.theta', ''),
        ('.stats', ''), ('.tpm', ''), ('.counts', ''), ('.fpkm', '')
    ]
    for suffix, replacement in patterns:
        if filename.endswith(suffix):
            name = filename.replace(suffix, replacement)
            if name.endswith('_R1'): name = name[:-3]
            if name.endswith('_R2'): name = name[:-3]
            return name
    # If no specific pattern matched, try to extract from path
    parts = filename.split('.')
    if len(parts) > 0:
        return parts[0]
    return "unknown"

def merge_configs_to_dataframe(config_files: List[str], output_format: str = "tsv") -> pd.DataFrame:
    """Merge multiple config files into a single DataFrame"""
    all_data = []
    
    with Progress(SpinnerColumn(), TextColumn("[bold blue]{task.description}"), 
                  BarColumn(), TextColumn("[progress.percentage]{task.percentage:>3.0f}%"), 
                  console=console) as progress:
        task = progress.add_task("[cyan]Processing config files...", total=len(config_files))
        
        for config_file in config_files:
            progress.console.log(f"Processing {config_file}")
            config_data = load_config(config_file)
            if config_data is None:
                progress.advance(task)
                continue
                
            # Determine the module type from the config filename
            module_type = Path(config_file).stem.replace('_config', '').replace('summary', '')
            
            # Extract relevant information based on config structure
            if 'data_delivery' in config_data:
                data_delivery = config_data['data_delivery']
                include_patterns = data_delivery.get('include_patterns', [])
                
                for pattern in include_patterns:
                    # Try to extract sample name from pattern if it contains sample-specific paths
                    sample_name = extract_sample_name_from_path(pattern)
                    if sample_name == "unknown":
                        # Use the config file name as a general identifier
                        sample_name = module_type
                    
                    row = {
                        'module': module_type,
                        'sample_name': sample_name,
                        'file_pattern': pattern,
                        'delivery_mode': data_delivery.get('delivery_mode', ''),
                        'output_dir': data_delivery.get('output_dir', ''),
                        'include_qc_summary': data_delivery.get('include_qc_summary', False),
                        'config_file': config_file
                    }
                    
                    # Add metrics if available
                    if 'metrics' in config_data:
                        for metric, value in config_data['metrics'].items():
                            row[f'metric_{metric}'] = value
                    
                    # Add summary columns if available
                    if f'{module_type}_summary_columns' in config_data:
                        summary_cols = config_data[f'{module_type}_summary_columns']
                        row['summary_columns'] = ', '.join(summary_cols)
                    elif 'qc_summary_columns' in config_data:
                        summary_cols = config_data['qc_summary_columns']
                        row['summary_columns'] = ', '.join(summary_cols)
                    
                    all_data.append(row)
            
            progress.advance(task)
    
    if not all_data:
        return pd.DataFrame()
    
    df = pd.DataFrame(all_data)
    
    # Reorder columns to have important ones first
    preferred_order = ['module', 'sample_name', 'file_pattern', 'delivery_mode', 
                      'output_dir', 'include_qc_summary', 'summary_columns', 'config_file']
    
    # Add any metric columns
    metric_cols = [col for col in df.columns if col.startswith('metric_')]
    other_cols = [col for col in df.columns if col not in preferred_order and col not in metric_cols]
    
    final_order = preferred_order + metric_cols + other_cols
    df = df[final_order]
    
    return df

def save_merged_output(df: pd.DataFrame, output_dir: Path, prefix: str, output_format: str = "tsv"):
    """Save merged data to specified format"""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if output_format.lower() == "json":
        json_path = output_dir / f"{prefix}_merged.json"
        # Convert DataFrame to records for JSON serialization
        records = df.to_dict('records')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        logger.success(f"Saved JSON: {json_path}")
    else:  # Default to TSV
        tsv_path = output_dir / f"{prefix}_merged.tsv"
        df.to_csv(tsv_path, sep='\t', index=False)
        logger.success(f"Saved TSV: {tsv_path}")
    
    # Also save a summary CSV
    summary_path = output_dir / f"{prefix}_summary.csv"
    summary_df = df.groupby(['module', 'delivery_mode']).agg({
        'sample_name': 'count',
        'include_qc_summary': 'sum'
    }).reset_index()
    summary_df.rename(columns={'sample_name': 'file_count', 'include_qc_summary': 'qc_summary_count'}, inplace=True)
    summary_df.to_csv(summary_path, index=False)
    logger.success(f"Saved Summary: {summary_path}")

def display_merged_summary(df: pd.DataFrame):
    """Display a summary of merged configurations"""
    if df.empty:
        console.print("[red]No data to display[/red]")
        return
    
    # Create a summary table
    table = Table(title="Merged Config Summary", box=box.ROUNDED, header_style="bold white on blue")
    table.add_column("Module", style="cyan")
    table.add_column("File Patterns", justify="right")
    table.add_column("Delivery Mode", style="magenta")
    table.add_column("QC Included", justify="center")
    
    summary = df.groupby(['module', 'delivery_mode']).agg({
        'file_pattern': 'count',
        'include_qc_summary': 'sum'
    }).reset_index()
    
    for _, row in summary.iterrows():
        qc_status = "✓" if row['include_qc_summary'] > 0 else "✗"
        table.add_row(
            str(row['module']),
            str(row['file_pattern']),
            str(row['delivery_mode']),
            qc_status
        )
    
    console.print(table)
    
    # Show sample distribution
    sample_table = Table(title="Sample Distribution by Module", box=box.ROUNDED, header_style="bold white on blue")
    sample_table.add_column("Module", style="cyan")
    sample_table.add_column("Sample Count", justify="right")
    
    sample_counts = df.groupby('module')['sample_name'].nunique().reset_index()
    sample_counts.columns = ['module', 'sample_count']
    
    for _, row in sample_counts.iterrows():
        sample_table.add_row(
            str(row['module']),
            str(row['sample_count'])
        )
    
    console.print(sample_table)

def run(args):
    """Main function to run the merge command"""
    # Find all config files based on the pattern provided
    config_pattern = args.config_pattern
    if not config_pattern:
        # Default to looking for all config files in the config directory
        config_pattern = "config/*_config.yaml"
    
    config_files = glob.glob(config_pattern)
    
    if not config_files:
        logger.error(f"No config files found matching pattern: {config_pattern}")
        return
    
    logger.info(f"Found {len(config_files)} config files to merge")
    
    # Merge all config files
    df = merge_configs_to_dataframe(config_files, args.format)
    
    if df.empty:
        logger.error("No data was extracted from config files")
        return
    
    # Display summary
    display_merged_summary(df)
    
    # Save output
    save_merged_output(df, Path(args.output_dir), args.prefix, args.format)
    
    console.print(f"\n[green]Successfully merged {len(config_files)} config files![/green]")