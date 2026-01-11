# modules/deliver.py
import sys
import os
import yaml
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple
from loguru import logger
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

try:
    from RNAFlow_Deliver import data_deliver_rs
except ImportError:
    data_deliver_rs = None

# Configure Loguru to write to a file, and keep stderr clean
logger.remove() # Remove default handler
logger.add(sys.stderr, format="<level>{message}</level>", level="WARNING") # Only show warnings/errors in console

def load_config(config_path: str) -> Dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def run(args):
    if data_deliver_rs is None:
        console.print(Panel("[bold red]Rust extension not found! Please build it first.[/bold red]", border_style="red"))
        sys.exit(1)

    config = load_config(args.config)
    delivery_conf = config.get('data_delivery', {})
    cloud_conf = delivery_conf.get('cloud', {})
    
    data_dir = Path(args.data_dir)
    is_cloud_mode = args.cloud or cloud_conf.get('enabled', False)

    # Setup file logging for this run
    base_local_output = Path(args.output_dir) if args.output_dir else Path(delivery_conf.get('output_dir', './delivery'))
    base_local_output.mkdir(parents=True, exist_ok=True)
    log_file = base_local_output / "delivery_details.log"
    logger.add(log_file, rotation="10 MB", format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}", level="INFO")

    # Beautiful Console Output
    console.print(f"[bold blue]Source:[/bold blue] {data_dir.absolute()}")
    if not is_cloud_mode:
        console.print(f"[bold blue]Target:[/bold blue] {base_local_output.absolute()}")
    
    transfer_list: List[Tuple[str, str]] = []
    seen_sources = set()

    include_patterns = delivery_conf.get('include_patterns', [])
    exclude_patterns = delivery_conf.get('exclude_patterns', [])
    
    if not include_patterns:
        logger.warning("No include_patterns defined in config.")
        return

    cloud_global_prefix = cloud_conf.get('prefix', '')

    for item in include_patterns:
        pattern = ""
        target_dest = "" 
        explicit_type = None

        if isinstance(item, str):
            pattern = item
        elif isinstance(item, dict):
            pattern = item.get('pattern')
            target_dest = item.get('dest', "")
            explicit_type = item.get('type')
        
        if not pattern: continue

        matches = list(data_dir.glob(pattern))
        if not matches: 
            matches = list(Path('.').glob(pattern))
        
        if explicit_type in ['file', 'rename'] and len(matches) > 1:
            logger.error(f"Config Error: Pattern '{pattern}' matched {len(matches)} files, but type='{explicit_type}' (rename mode). Skipping.")
            continue
            
        if not explicit_type and len(matches) > 1 and target_dest and not target_dest.endswith('/'):
            logger.warning(f"Ambiguity Warning: Pattern '{pattern}' matched multiple files, but 'dest' ('{target_dest}') looks like a filename. Appending '/' automatically.")
            target_dest += "/"

        for p in matches:
            src_abs = str(p.absolute())
            if src_abs in seen_sources: continue
            if any(p.match(ex) for ex in exclude_patterns): continue
            seen_sources.add(src_abs)
            
            fname = p.name
            
            is_rename = False
            if explicit_type:
                if explicit_type in ['file', 'rename']:
                    if p.is_dir():
                        logger.warning(f"Skipping rename for directory '{fname}'.")
                        continue
                    is_rename = True
                elif explicit_type in ['dir', 'folder']:
                    is_rename = False
            else:
                if target_dest and not target_dest.endswith('/') and not p.is_dir():
                    is_rename = True
                else:
                    is_rename = False

            if is_cloud_mode:
                if is_rename:
                    key_parts = [cloud_global_prefix.strip('/'), target_dest.strip('/')]
                else:
                    key_parts = [cloud_global_prefix.strip('/'), target_dest.strip('/'), fname]
                key = "/".join([k for k in key_parts if k])
                transfer_list.append((src_abs, key))
            else:
                if is_rename:
                    dest_path = base_local_output / target_dest
                else:
                    dest_path = base_local_output / target_dest / fname
                transfer_list.append((src_abs, str(dest_path.absolute())))

    if not transfer_list:
        logger.warning("No files matched for delivery.")
        return

    # Log plan
    logger.info(f"Prepared {len(transfer_list)} transfers.")
    for src, dest in transfer_list:
        logger.info(f"PLAN: {src} -> {dest}")

    report_output_dir = base_local_output

    if is_cloud_mode:
        run_cloud_mode(transfer_list, cloud_conf, args, report_output_dir)
    else:
        run_local_mode(transfer_list, base_local_output, delivery_conf)

def run_local_mode(transfer_list, output_dir, conf):
    mode = conf.get('delivery_mode', 'symlink')
    threads = int(conf.get('threads', 4))
    console.rule(f"[bold magenta]📦 Delivering {len(transfer_list)} files (Local Mode: {mode})[/bold magenta]")
    
    try:
        with console.status("[bold green]Rust Engine Running...[/bold green]", spinner="dots"):
            success, failed, size_gb = data_deliver_rs.run_local_delivery(
                transfer_list, 
                str(output_dir.absolute()), 
                mode, 
                threads
            )
        display_result(success, failed, size_gb)
        write_json_report(transfer_list, output_dir, success, failed, size_gb, is_cloud=False)
        logger.info(f"Delivery Finished. Success: {success}, Failed: {failed}")
    except Exception as e:
        console.print(Panel(f"Rust Local Error: {e}", border_style="red"))
        logger.error(f"Rust Error: {e}")

def run_cloud_mode(transfer_list, conf, args, report_dir):
    bucket = args.bucket or conf.get('bucket')
    endpoint = args.endpoint or conf.get('endpoint')
    region = args.region or conf.get('region')
    project_id = conf.get('project_id', 'unknown_project')
    ak = os.getenv("TOS_ACCESS_KEY", "")
    sk = os.getenv("TOS_SECRET_KEY", "")

    if not (endpoint and region and ak and sk):
        try:
            c_ep, c_rg, c_ak, c_sk = data_deliver_rs.config_get()
            if not endpoint and c_ep: endpoint = c_ep
            if not region and c_rg: region = c_rg
            if not ak and c_ak: ak = c_ak
            if not sk and c_sk: sk = c_sk
        except Exception: pass

    if not (bucket and endpoint and region and ak and sk):
        console.print(Panel("[bold red]Missing Cloud Credentials![/bold red]", border_style="red"))
        return

    task_num = int(conf.get('task_num', 3))
    part_size = int(conf.get('part_size_mb', 20)) * 1024 * 1024
    console.rule(f"[bold magenta]☁️  Uploading {len(transfer_list)} files to s3://{bucket}[/bold magenta]")

    try:
        with console.status("[bold cyan]Rust Cloud Engine Running...[/bold cyan]", spinner="earth"):
            success, failed, size_gb = data_deliver_rs.run_cloud_delivery(
                transfer_list, bucket, "", endpoint, region, ak, sk, project_id, task_num, part_size
            )
        display_result(success, failed, size_gb)
        cloud_base_path = f"s3://{bucket}"
        write_json_report(transfer_list, report_dir, success, failed, size_gb, is_cloud=True, cloud_base_path=cloud_base_path)
        logger.info(f"Cloud Upload Finished. Success: {success}, Failed: {failed}")
    except Exception as e:
        console.print(Panel(f"Rust Cloud Error: {e}", border_style="red"))
        logger.error(f"Rust Cloud Error: {e}")

def display_result(success, failed, size_gb):
    table = Table(show_header=False, box=None)
    table.add_row("✅ Success:", f"[green]{success}[/green]")
    table.add_row("❌ Failed:", f"[red]{failed}[/red]")
    table.add_row("💾 Size:", f"[blue]{size_gb:.2f} GB[/blue]")
    console.print(Panel(table, title="Delivery Complete", border_style="green"))

def write_json_report(transfer_list, output_dir, success, failed, size_gb, is_cloud=False, cloud_base_path=""):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "delivery_manifest.json"
    deliverables = {}
    for src, dest in transfer_list:
        final_name = Path(dest).name
        if is_cloud:
            final_path = f"{cloud_base_path.rstrip('/')}/{dest}"
        else:
            final_path = dest
        deliverables[final_name] = final_path
    data = {
        "meta": {
            "timestamp": datetime.now().isoformat(),
            "success": success,
            "failed": failed,
            "size_gb": size_gb,
            "mode": "cloud" if is_cloud else "local",
            "output_location": cloud_base_path if is_cloud else str(output_dir.absolute())
        },
        "files": deliverables
    }
    try:
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        # Log to file, but not to console (removed console print)
        logger.info(f"JSON Report written to: {report_path}") 
    except Exception as e:
        logger.error(f"Failed to write JSON report: {e}")