# modules/deliver.py
import sys
import os
import yaml
from pathlib import Path
from typing import Dict, Any
from loguru import logger
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

try:
    from RNAFlow_Deliver import data_deliver_rs
except ImportError:
    data_deliver_rs = None

def load_config(config_path: str) -> Dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        default_config = {
            "data_delivery": {
                "include_qc_summary": True,
                "output_dir": "./delivery",
                "delivery_mode": "symlink",
                "threads": 4,
                "include_patterns": ["*.bam", "*.bai", "*.vcf.gz"],
                "exclude_patterns": [],
                # Cloud Settings
                "cloud": {
                    "enabled": False,
                    "bucket": "my-bucket",
                    "prefix": "project_A/",
                    "endpoint": "https://tos-cn-beijing.volces.com",
                    "region": "cn-beijing",
                    "project_id": "test_project",
                    "part_size_mb": 20,
                    "task_num": 3
                }
            }
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True)
        return default_config
    
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def run(args):
    if data_deliver_rs is None:
        console.print(Panel("[bold red]Rust extension not found![/bold red]", border_style="red"))
        return

    config = load_config(args.config)
    delivery_conf = config.get('data_delivery', {})
    cloud_conf = delivery_conf.get('cloud', {})
    
    data_dir = Path(args.data_dir)
    
    # Decide Mode: CLI flag overrides config
    is_cloud_mode = args.cloud or cloud_conf.get('enabled', False)

    logger.info(f"Source: {data_dir.absolute()}")
    
    # Collect Files
    files_to_deliver = set()
    include_patterns = delivery_conf.get('include_patterns', [])
    exclude_patterns = delivery_conf.get('exclude_patterns', [])
    
    if not include_patterns:
        logger.warning("No include_patterns defined in config.")
        return

    for pattern in include_patterns:
        matches = list(data_dir.glob(pattern))
        if not matches: matches = list(Path('.').glob(pattern))
        for p in matches:
            files_to_deliver.add(str(p.absolute()))

    for pattern in exclude_patterns:
        matches = list(data_dir.glob(pattern))
        for p in matches:
            if str(p.absolute()) in files_to_deliver:
                files_to_deliver.remove(str(p.absolute()))
    
    file_list = list(files_to_deliver)
    if not file_list:
        logger.warning("No files matched for delivery.")
        return

    if is_cloud_mode:
        run_cloud_mode(file_list, cloud_conf, args)
    else:
        # Local Mode
        output_dir = Path(args.output_dir) if args.output_dir else Path(delivery_conf.get('output_dir', './delivery'))
        logger.info(f"Target (Local): {output_dir.absolute()}")
        run_local_mode(file_list, output_dir, delivery_conf)

def run_local_mode(file_list, output_dir, conf):
    mode = conf.get('delivery_mode', 'symlink')
    threads = int(conf.get('threads', 4))
    
    console.rule(f"[bold magenta]📦 Delivering {len(file_list)} files (Local Mode: {mode})[/bold magenta]")
    
    try:
        with console.status("[bold green]Rust Engine Running...[/bold green]", spinner="dots"):
            success, failed, size_gb = data_deliver_rs.run_local_delivery(
                file_list, 
                str(output_dir.absolute()), 
                mode, 
                threads
            )
        
        display_result(success, failed, size_gb)
    except Exception as e:
        console.print(Panel(f"Rust Local Error: {e}", border_style="red"))

def run_cloud_mode(file_list, conf, args):
    # 1. Try Args & Config & Env
    bucket = args.bucket or conf.get('bucket')
    endpoint = args.endpoint or conf.get('endpoint')
    region = args.region or conf.get('region')
    project_id = conf.get('project_id', 'unknown_project')
    prefix = conf.get('prefix', '')
    
    ak = os.getenv("TOS_ACCESS_KEY", "")
    sk = os.getenv("TOS_SECRET_KEY", "")

    # 2. If missing, try Rust Config Manager
    if not (endpoint and region and ak and sk):
        try:
            # Returns (endpoint, region, ak, sk) - all Option<String>
            c_ep, c_rg, c_ak, c_sk = data_deliver_rs.config_get()
            
            if not endpoint and c_ep: endpoint = c_ep
            if not region and c_rg: region = c_rg
            if not ak and c_ak: ak = c_ak
            if not sk and c_sk: sk = c_sk
            
            if c_ep or c_ak:
                logger.info("Loaded credentials from encrypted local config.")
        except Exception:
            pass # Ignore if config file doesn't exist or error

    if not (bucket and endpoint and region and ak and sk):
        console.print(Panel("[bold red]Missing Cloud Credentials/Config![/bold red]\nPlease use 'rnaflow-cli config' to set credentials, or provide via args/env.", border_style="red"))
        return

    task_num = int(conf.get('task_num', 3))
    part_size = int(conf.get('part_size_mb', 20)) * 1024 * 1024

    console.rule(f"[bold magenta]☁️  Uploading {len(file_list)} files to s3://{bucket}/{prefix}[/bold magenta]")
    logger.info(f"Endpoint: {endpoint} | Region: {region}")

    try:
        with console.status("[bold cyan]Rust Cloud Engine Running...[/bold cyan]", spinner="earth"):
            success, failed, size_gb = data_deliver_rs.run_cloud_delivery(
                file_list,
                bucket,
                prefix,
                endpoint,
                region,
                ak,
                sk,
                project_id,
                task_num,
                part_size
            )
        display_result(success, failed, size_gb)
    except Exception as e:
        console.print(Panel(f"Rust Cloud Error: {e}", border_style="red"))

def display_result(success, failed, size_gb):
    table = Table(show_header=False, box=None)
    table.add_row("✅ Success:", f"[green]{success}[/green]")
    table.add_row("❌ Failed:", f"[red]{failed}[/red]")
    table.add_row("💾 Size:", f"[blue]{size_gb:.2f} GB[/blue]")
    console.print(Panel(table, title="Delivery Complete", border_style="green"))