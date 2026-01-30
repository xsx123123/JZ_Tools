from snakemake_interface_logger_plugins.base import LogHandlerBase
from snakemake_interface_logger_plugins.settings import LogHandlerSettingsBase

from dataclasses import dataclass, field
from typing import Optional
import sys
import os
import yaml
import json
import re
import urllib.request
from urllib.error import URLError, HTTPError
import platform
from datetime import datetime
from pathlib import Path
import logging
import shutil
import getpass
import socket
import time

# Import loguru and rich
from loguru import logger
from rich.logging import RichHandler
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn
from rich.table import Table
from rich.align import Align
from rich import box
import pyfiglet

# Export utilities for external analysis scripts
from .utils import setup_analysis_logging, get_logger, initialize_analysis_logger, get_analysis_logger, get_analysis_log_file_path
from .loki_utils import format_payload_for_loki

class LokiHandler:
    """
    A Custom Loguru sink for Grafana Loki integration.
    """
    def __init__(self, loki_url, project_name=None):
        # Normalize URL to ensure it points to the push API
        if not loki_url.endswith("/loki/api/v1/push"):
            self.endpoint = f"{loki_url.rstrip('/')}/loki/api/v1/push"
        else:
            self.endpoint = loki_url
            
        self.project_name = project_name
        self.total_jobs = 1000 # Default estimate, can be updated if we parse job counts

    def _process_message(self, message):
        """
        Extract clean text and properties from a message.
        """
        # 1. Strip Markup
        try:
            plain_text = Text.from_markup(message).plain
        except Exception:
            plain_text = message
            
        properties = {}
        
        # 2. Extract Data (Simple Parsing)
        # Pattern 1: Rule: <name>, Jobid: <id>
        match1 = re.search(r"Rule:\s+(.+?),\s+Jobid:\s+(\d+)", plain_text)
        if match1:
            properties["Snakemake_Rule"] = match1.group(1)
            properties["Snakemake_JobId"] = int(match1.group(2))

        # Pattern 2: Finished jobid: <id> (Rule: <name>) or Finished jobid <id>
        # Improved regex to handle optional colon and optional rule part
        match2 = re.search(r"Finished jobid[:\s]\s*(\d+)(?:\s+\(Rule:\s+(.+?)\))?", plain_text)
        if match2:
            properties["Snakemake_JobId"] = int(match2.group(1))
            if match2.group(2):
                properties["Snakemake_Rule"] = match2.group(2)
            properties["Event_Type"] = "JobFinished"

        # Pattern 3: Shell command
        if plain_text.startswith("Shell command: "):
            properties["Shell_Command"] = plain_text.replace("Shell command: ", "").strip()
            properties["Event_Type"] = "ShellCommand"

        return plain_text, properties

    def write(self, message):
        """
        Loguru calls this method with the serialized JSON string (since serialize=True).
        We construct the Loki payload using the utility function and send it.
        """
        try:
            # message is a JSON string containing the full record
            data = json.loads(message)
            record = data["record"]
            
            # Process Message to get clean text and extracted Snakemake properties
            plain_text, extra_props = self._process_message(record["message"])

            # Construct the raw log dictionary expected by format_payload_for_loki
            # We prefix the message with the project name if available, to ensure 
            # the utility extracts the project_id correctly (Format: "Project | Msg")
            display_msg = plain_text
            if self.project_name:
                # Ensure the format matches what format_payload_for_loki expects for extraction
                display_msg = f"{self.project_name} | {plain_text}"

            raw_log = {
                "msg": display_msg,
                "caller": f"{record['name']}:{record['function']}:{record['line']}",
                "level": record["level"]["name"].lower()
            }
            if extra_props:
                raw_log.update(extra_props)

            # Use the utility to format the payload
            payload = format_payload_for_loki(raw_log, self.total_jobs)

            # Send Request
            json_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(self.endpoint, data=json_data, method="POST")
            req.add_header("Content-Type", "application/json")
            
            with urllib.request.urlopen(req) as response:
                pass
                
        except Exception:
            # Fail silently to avoid breaking the workflow
            pass

def install(snakemake_config):
    """
    Install the monitor plugin configuration.
    
    It searches for 'monitor_config.yaml' to configure the Loki sink.
    """

    # Helper: Parse CLI args manually for config override
    def _get_cli_config_value(key_name):
        try:
            if "--config" in sys.argv:
                idx = sys.argv.index("--config")
                for arg in sys.argv[idx+1:]:
                    if arg.startswith("-"): break 
                    if "=" in arg:
                        k, v = arg.split("=", 1)
                        if k == key_name: return v
        except Exception:
            pass
        return None

    # 1. Determine config path candidates
    possible_paths = [
        _get_cli_config_value("analysisyaml"),
        snakemake_config.get("monitor_conf"),
        os.environ.get("SNAKEMAKE_MONITOR_CONF"),
        _get_cli_config_value("monitor_conf"),
        "monitor_config.yaml",
        "config/monitor_config.yaml",
    ]

    # 2. Find and Load Config
    config = {}
    loaded_path = None
    
    for path in possible_paths:
        if path and os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    loaded_config = yaml.safe_load(f) or {}
                    if "loki_url" in loaded_config:
                        config = loaded_config
                        loaded_path = path
                        break
            except Exception as e:
                logger.debug(f"Failed to load config from {path}: {e}")

    if loaded_path:
        logger.debug(f"Loaded monitor config from: {loaded_path}")

    # 3. Extract Settings
    loki_url = config.get("loki_url") or snakemake_config.get("loki_url")
    project_name = config.get("project_name") or snakemake_config.get("project_name")
    
    # 4. Configure Loki Sink
    if loki_url:
        try:
            handler = LokiHandler(loki_url, project_name)
            logger.add(
                handler.write,
                serialize=True, # Pass JSON string to handler
                enqueue=True,   # Async logging
                level="INFO"
            )
            logger.info(f"Analysis logs will be pushed to Loki server: [bold underline]{handler.endpoint}[/bold underline]")
        except Exception as e:
            logger.error(f"Failed to initialize Loki sink: {e}")

@dataclass
class LogHandlerSettings(LogHandlerSettingsBase):
    log_dir: Optional[str] = field(
        default="logs",
        metadata={
            "help": "Directory to store log files",
            "env_var": False,
            "required": False,
        },
    )
    log_file_prefix: Optional[str] = field(
        default="snakemake",
        metadata={
            "help": "Prefix for log file names",
            "env_var": False,
            "required": False,
        },
    )
    max_file_size: Optional[str] = field(
        default="100 MB",
        metadata={
            "help": "Maximum size before log rotation",
            "env_var": False,
            "required": False,
        },
    )

def show_splash_screen():
    """Display a startup animation."""
    if os.environ.get("SNAKEMAKE_RICH_LOGURU_SPLASH_SHOWN"):
        return

    try:
        if not sys.stderr.isatty():
            return
    except Exception:
        pass

    console = Console(file=sys.stderr)
    
    steps = [
        ("📡 Initializing Core Systems...", 0.8),
        ("🔌 Loading Logger Plugins...", 0.6),
        ("🛡️ Verifying Environment...", 0.7),
        ("🚀 Connecting to HPC Cluster...", 1.0),
        ("🧬 Scanning Workflow DAG...", 0.8),
    ]

    console.print()
    console.rule("[bold cyan]🚀 Snakemake Runtime Sequence[/bold cyan]", style="dim blue")
    console.print()

    with Progress(
        SpinnerColumn("dots12", style="bold magenta"),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(
            bar_width=40,
            style="dim cyan", 
            complete_style="bold green", 
            finished_style="bold green"
        ),
        TextColumn("[bold cyan]{task.percentage:>3.0f}%"),
        console=console,
        transient=True,
        expand=False
    ) as progress:
        task = progress.add_task("Booting...", total=100)
        
        for desc, delay in steps:
            progress.update(task, description=desc)
            chunk_size = 100 / len(steps)
            steps_in_chunk = 20
            for _ in range(steps_in_chunk):
                time.sleep(delay / steps_in_chunk)
                progress.advance(task, chunk_size / steps_in_chunk)
        
        progress.update(task, description="[bold green]System Ready[/bold green]", completed=100)
        time.sleep(0.5)

    f = pyfiglet.Figlet(font='slant')
    ascii_art = f.renderText('Snakemake')
    logo = Text(ascii_art, style="bold cyan")

    user = getpass.getuser()
    host = socket.gethostname()
    py_ver = platform.python_version()
    
    try:
        import snakemake
        sm_ver = snakemake.__version__
    except ImportError:
        sm_ver = "unknown"

    grid = Table(show_header=False, expand=True, box=None, padding=(0, 2))
    grid.add_column(justify="right", style="bold cyan")
    grid.add_column(justify="left", style="white")
    grid.add_column(justify="right", style="bold magenta")
    grid.add_column(justify="left", style="white")
    
    grid.add_row("User:", user, "Snakemake:", f"v{sm_ver}")
    grid.add_row("Host:", host, "Python:", f"v{py_ver}")
    grid.add_row("System:", platform.system(), "Time:", datetime.now().strftime("%H:%M:%S"))

    dashboard = Panel(
        grid,
        title="[bold green]✔ Workflow Engine Online[/bold green]",
        subtitle="[dim]Powered by Rich & Loguru[/dim]",
        border_style="blue",
        box=box.ROUNDED,
        padding=(1, 2),
        width=80,
    )
    
    console.print()
    console.print(Align.center(logo))
    console.print(Align.center(dashboard))
    console.print()
    console.rule("[bold dim blue]Initialized & Ready[/bold dim blue]", style="dim blue")
    console.print()
    
    os.environ["SNAKEMAKE_RICH_LOGURU_SPLASH_SHOWN"] = "1"

class LogHandler(LogHandlerBase):
    def __post_init__(self) -> None:
        logging.Handler.__init__(self)

        self.log_dir = Path(self.settings.log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        self.log_file_path = self.log_dir / f"{self.settings.log_file_prefix}_{timestamp}.log"

        logger.remove()

        # 1. File Handler
        logger.add(
            self.log_file_path,
            rotation=self.settings.max_file_size,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
            level="DEBUG",
            backtrace=True,
            diagnose=True,
            enqueue=True
        )

        # 2. Console Handler (Rich)
        logger.add(
            RichHandler(
                show_time=True,
                omit_repeated_times=False,
                show_path=False,
                markup=True,
                rich_tracebacks=True,
                log_time_format="[%X]"
            ),
            format="{message}",
            level="INFO",
            enqueue=True
        )

        self._capture_startup_info()
        
        # Configure Loki
        install({})

    def _capture_startup_info(self):
        msg = f"{self.settings.log_file_prefix} Pipeline Initialized"
        logger.info(f"[bold green]{msg}[/bold green]")

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        system_info = f"{platform.system()} {platform.release()}"
        python_version = platform.python_version()

        try:
            import snakemake
            snakemake_version = snakemake.__version__
        except ImportError:
            snakemake_version = "unknown"

        user = getpass.getuser()
        host = socket.gethostname()
        cwd = os.getcwd()
        cmd_args = " ".join(sys.argv)

        logger.info(f"Start Time: {timestamp}")
        logger.info(f"System: {system_info}")
        logger.info(f"User: {user} | Host: {host}")
        logger.info(f"Python Version: {python_version}")
        logger.info(f"Snakemake Version: {snakemake_version}")
        logger.info(f"Log File: {self.log_file_path}")
        logger.info(f"Working Directory: {cwd}")
        logger.info(f"Command: {cmd_args}")
        logger.info("-" * 60)

    def emit(self, record):
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelname

        rec_opt = logger.opt(exception=record.exc_info, depth=6)

        if record.msg is None or record.msg == "":
            return

        msg = record.getMessage()

        if "Rule:" in msg:
            msg = msg.replace("Rule:", "[bold cyan]Rule:[/bold cyan]")
        if "Jobid:" in msg:
            msg = msg.replace("Jobid:", "[bold magenta]Jobid:[/bold magenta]")
        if "Finished jobid:" in msg:
            msg = msg.replace("Finished jobid:", "[bold green]✔ Finished jobid:[/bold green]")
        if "Select jobs to execute..." in msg:
            msg = "[bold yellow]Select jobs to execute...[/bold yellow]"
        if "Execute" in msg and "jobs..." in msg:
             msg = f"[bold yellow]{msg}[/bold yellow]"

        rec_opt.log(level, msg)

    @property
    def writes_to_stream(self) -> bool:
        return True

    @property
    def writes_to_file(self) -> bool:
        return False

    @property
    def base_filename(self) -> str:
        return str(self.log_file_path)

    @property
    def has_filter(self) -> bool:
        return False

    @property
    def has_formatter(self) -> bool:
        return True

    @property
    def needs_rulegraph(self) -> bool:
        return False

show_splash_screen()
