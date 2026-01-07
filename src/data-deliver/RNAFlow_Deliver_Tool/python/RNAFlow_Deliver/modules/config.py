# modules/config.py
import getpass
from rich.console import Console
from rich.panel import Panel

console = Console()

try:
    from RNAFlow_Deliver import data_deliver_rs
except ImportError:
    data_deliver_rs = None

def run(args):
    if data_deliver_rs is None:
        console.print(Panel("[bold red]Rust extension not found![/bold red]", border_style="red"))
        return

    # If all args are None, we might want to be interactive?
    # For now, let's just take command line args.
    
    # Prompt for secrets if not provided but endpoint/region are?
    # Or just require args.
    
    endpoint = args.endpoint
    region = args.region
    ak = args.ak
    sk = args.sk
    
    # Simple interactive mode if no args provided
    if not (endpoint or region or ak or sk):
        console.print("[bold cyan]Interactive Config Mode[/bold cyan]")
        if not endpoint: endpoint = input("Endpoint (e.g. https://tos-cn-beijing.volces.com): ").strip()
        if not region: region = input("Region (e.g. cn-beijing): ").strip()
        if not ak: ak = getpass.getpass("Access Key ID: ").strip()
        if not sk: sk = getpass.getpass("Secret Access Key: ").strip()
        
        # If still empty, convert to None
        if not endpoint: endpoint = None
        if not region: region = None
        if not ak: ak = None
        if not sk: sk = None

    try:
        data_deliver_rs.config_update(endpoint, region, ak, sk)
        console.print(Panel("[bold green]Configuration Updated Successfully![/bold green]\nEncrypted and saved to ~/.data_deliver/config.yaml", border_style="green"))
    except Exception as e:
        console.print(Panel(f"Config Update Error: {e}", border_style="red"))
