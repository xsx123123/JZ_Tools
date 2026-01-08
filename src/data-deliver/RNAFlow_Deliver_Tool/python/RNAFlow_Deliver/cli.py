import argparse
import sys
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.align import Align
from RNAFlow_Deliver.modules import deliver, config

__version__ = "0.2.0"
console = Console()

class RichArgumentParser(argparse.ArgumentParser):
    """Custom ArgumentParser that uses Rich for help output."""

    def format_help(self):
        formatter = self._get_formatter()
        formatter.add_usage(self.usage, self._actions, self._mutually_exclusive_groups)

        console.print("")
        console.print(Panel.fit(
            "[bold white]RNAFlow CLI[/bold white]\n[dim]High-Performance Bioinfo Data Delivery & QC[/dim]",
            style="bold blue",
            border_style="blue",
            padding=(1, 2)
        ))

        if self.description:
            console.print(f"\n{self.description}\n")

        # Subcommands
        subparsers_actions = [
            action for action in self._actions
            if isinstance(action, argparse._SubParsersAction)
        ]

        if subparsers_actions:
            console.print("[bold yellow]Available Commands:[/bold yellow]")
            for action in subparsers_actions:
                table = Table(box=None, padding=(0, 2), show_header=False)
                table.add_column("Command", style="bold cyan")
                table.add_column("Description")
                choices_help = {a.dest: a.help for a in action._choices_actions}
                for choice, subparser in action.choices.items():
                    help_text = choices_help.get(choice, "")
                    table.add_row(choice, subparser.description or help_text)
                console.print(table)
            console.print("")

        # Options
        options_table = Table(box=None, padding=(0, 2), show_header=False)
        options_table.add_column("Option", style="bold green")
        options_table.add_column("Help")

        console.print("[bold yellow]Global Options:[/bold yellow]")
        for action in self._actions:
            if isinstance(action, argparse._SubParsersAction): continue
            opts = ", ".join(action.option_strings)
            options_table.add_row(opts, action.help)
        console.print(options_table)

        console.print(f"\n[dim]Version: {__version__}[/dim]")
        console.print("[dim]Use 'rnaflow-cli <command> -h' for command-specific help.[/dim]\n")
        return ""

    def print_help(self, file=None):
        self.format_help()

def main():
    parser = RichArgumentParser(
        description="A unified tool for RNA-Seq QC summarization and high-speed data delivery."
    )
    parser.add_argument("-v", "--version", action="version", version=f"%(prog)s {__version__}", help="Show program's version number and exit")

    subparsers = parser.add_subparsers(dest="command", required=True, title="Available commands")

    # --- Command: deliver ---
    dl_parser = subparsers.add_parser("deliver", help="High-performance file delivery using Rust engine")
    dl_parser.add_argument("-d", "--data-dir", type=str, default=".", help="Base directory to search for files")
    dl_parser.add_argument("-o", "--output-dir", type=str, help="Destination directory (Local mode)")
    dl_parser.add_argument("-c", "--config", type=str, default="config/delivery_config.yaml", help="Config file defining patterns")

    # Cloud Args
    dl_group = dl_parser.add_argument_group("Cloud Delivery Options")
    dl_group.add_argument("--cloud", action="store_true", help="Enable cloud upload mode")
    dl_group.add_argument("--bucket", type=str, help="Target S3/TOS bucket name")
    dl_group.add_argument("--endpoint", type=str, help="S3/TOS endpoint URL")
    dl_group.add_argument("--region", type=str, help="Cloud region")

    # --- Command: config ---
    cfg_parser = subparsers.add_parser("config", help="Manage cloud credentials (encrypted)")
    cfg_parser.add_argument("--endpoint", type=str, help="Object Storage Endpoint")
    cfg_parser.add_argument("--region", type=str, help="Region")
    cfg_parser.add_argument("--ak", type=str, help="Access Key ID")
    cfg_parser.add_argument("--sk", type=str, help="Secret Access Key")

    # Parse
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)

    args = parser.parse_args()

    if args.command == "deliver":
        deliver.run(args)
    elif args.command == "config":
        config.run(args)

if __name__ == "__main__":
    main()