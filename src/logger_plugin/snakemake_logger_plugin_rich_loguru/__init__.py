from snakemake_interface_logger_plugins.base import LogHandlerBase
from snakemake_interface_logger_plugins.settings import LogHandlerSettingsBase

from dataclasses import dataclass, field
from typing import Optional
import sys
import os
import yaml
import json
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

class SeqHandler:
    """
    A custom Loguru sink for Seq integration.
    """
    def __init__(self, server_url, api_key=None, project_name=None):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        self.project_name = project_name
        self.endpoint = f"{self.server_url}/api/events/raw?clef"

    def write(self, message):
        """
        Loguru calls this method with the formatted message (if not serialized)
        or the serialized JSON string (if serialize=True).
        We use serialize=True for Seq.
        """
        try:
            data = json.loads(message)
            record = data["record"]
            
            # Map Loguru record to CLEF (Compact Log Event Format)
            # https://docs.datalust.co/docs/posting-raw-events#compact-log-event-format
            clef_event = {
                "@t": datetime.fromtimestamp(record["time"]["timestamp"]).isoformat(),
                "@m": record["message"],
                "@l": record["level"]["name"],
                "Validation": True
            }
            
            # Add exception if present
            if record.get("exception"):
                clef_event["@x"] = record["exception"]["text"]

            # Add extra fields
            if self.project_name:
                clef_event["Project"] = self.project_name
            
            # Add all extra fields from loguru
            for k, v in record.get("extra", {}).items():
                clef_event[k] = v

            # Send to Seq
            data = json.dumps(clef_event).encode("utf-8")
            req = urllib.request.Request(self.endpoint, data=data, method="POST")
            req.add_header("Content-Type", "application/vnd.serilog.clef")
            
            if self.api_key:
                req.add_header("X-Seq-ApiKey", self.api_key)
            
            with urllib.request.urlopen(req) as response:
                pass
                
        except Exception as e:
            # Fail silently to avoid breaking the workflow, 
            # or print to stderr if critical.
            # We assume Loguru handles sink exceptions (it prints them to stderr by default).
            sys.stderr.write(f"Seq logging error: {e}\n")
            if isinstance(e, HTTPError) and e.code == 400:
                 sys.stderr.write(f"Payload was: {json.dumps(clef_event, indent=2)}\n")

def install(snakemake_config):
    """
    Install the monitor plugin configuration.
    
    Loads configuration from:
    1. snakemake_config['monitor_conf']
    2. env var SNAKEMAKE_MONITOR_CONF
    3. ./monitor_config.yaml
    
    Configures Loguru to send logs to Seq if seq_url is found.
    """
    # 1. Determine config path
    monitor_conf_path = snakemake_config.get("monitor_conf")
    
    if not monitor_conf_path:
        monitor_conf_path = os.environ.get("SNAKEMAKE_MONITOR_CONF")
    
    if not monitor_conf_path:
        monitor_conf_path = "monitor_config.yaml"
        
    # 2. Load Configuration
    config = {}
    if os.path.exists(monitor_conf_path):
        try:
            with open(monitor_conf_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}
            logger.info(f"Loaded monitor config from {monitor_conf_path}")
        except Exception as e:
            logger.warning(f"Failed to load monitor config from {monitor_conf_path}: {e}")
    else:
        if monitor_conf_path != "monitor_config.yaml":
             logger.warning(f"Monitor config file specified but not found: {monitor_conf_path}")

    # 3. Extract Settings (File > Snakemake Config)
    seq_url = config.get("seq_url") or config.get("seq_server_url") or snakemake_config.get("seq_url") or snakemake_config.get("seq_server_url")
    api_key = config.get("api_key") or snakemake_config.get("api_key")
    
    base_project_name = config.get("project_name") or snakemake_config.get("project_name") or "SnakemakeWorkflow"
    timestamp_suffix = datetime.now().strftime("%Y-%m-%d_%H-%M")
    project_name = f"{base_project_name}_{timestamp_suffix}"

    # 4. Bind to Loguru (Seq Sink)
    if seq_url:
        try:
            handler = SeqHandler(seq_url, api_key, project_name)
            logger.add(
                handler.write,
                serialize=True, # Pass JSON string to handler
                enqueue=True,   # Async logging
                level="INFO",   # Adjust level as needed
                format="{message}" # Format doesn't matter much for serialize=True, but strictly generic
            )
            logger.success(f"Seq logging enabled: {seq_url} (Project: {project_name})")
        except Exception as e:
            logger.error(f"Failed to initialize Seq sink: {e}")
    else:
        logger.debug("Seq URL not found. Remote logging disabled.")

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
    # Check if splash screen has already been shown in this process tree
    if os.environ.get("SNAKEMAKE_RICH_LOGURU_SPLASH_SHOWN"):
        return

    # Only show animation if outputting to terminal
    try:
        if not sys.stderr.isatty():
            return
    except Exception:
        pass

    console = Console(file=sys.stderr)
    
    # Animation: Simulated System Boot with more flair
    steps = [
        ("📡 Initializing Core Systems...", 0.8),
        ("🔌 Loading Logger Plugins...", 0.6),
        ("🛡️ Verifying Environment...", 0.7),
        ("🚀 Connecting to HPC Cluster...", 1.0),
        ("🧬 Scanning Workflow DAG...", 0.8),
    ]

    # Use a more colorful and slower progress bar
    from rich.progress import SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
    
    console.print()
    console.rule("[bold cyan]🚀 Snakemake Runtime Sequence[/bold cyan]", style="dim blue")
    console.print()

    with Progress(
        SpinnerColumn("dots12", style="bold magenta"),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(
            bar_width=40, # Fixed width for a more compact look
            style="dim cyan", 
            complete_style="bold green", 
            finished_style="bold green"
        ),
        TextColumn("[bold cyan]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
        transient=True,
        expand=False # Disable full width expansion
    ) as progress:
        task = progress.add_task("Booting...", total=100)
        
        # Simulate boot steps with slower, more variable timing
        for desc, delay in steps:
            progress.update(task, description=desc)
            # Animate the bar filling up for this step
            chunk_size = 100 / len(steps)
            steps_in_chunk = 20
            for _ in range(steps_in_chunk):
                time.sleep(delay / steps_in_chunk)
                progress.advance(task, chunk_size / steps_in_chunk)
        
        progress.update(task, description="[bold green]System Ready[/bold green]", completed=100)
        time.sleep(0.5)

    # --- ASCII Art Banner ---
    # Using 'slant' font for a dynamic look
    f = pyfiglet.Figlet(font='slant')
    ascii_art = f.renderText('Snakemake')
    logo = Text(ascii_art, style="bold cyan")

    # --- System Info Grid ---
    # Fetch Info
    user = getpass.getuser()
    host = socket.gethostname()
    py_ver = platform.python_version()
    
    try:
        import snakemake
        sm_ver = snakemake.__version__
    except ImportError:
        sm_ver = "unknown"

    # Create a grid for the info
    grid = Table(show_header=False, expand=True, box=None, padding=(0, 2))
    grid.add_column(justify="right", style="bold cyan")  # Labels Left
    grid.add_column(justify="left", style="white")       # Values Left
    grid.add_column(justify="right", style="bold magenta") # Labels Right
    grid.add_column(justify="left", style="white")       # Values Right
    
    grid.add_row("User:", user, "Snakemake:", f"v{sm_ver}")
    grid.add_row("Host:", host, "Python:", f"v{py_ver}")
    grid.add_row("System:", platform.system(), "Time:", datetime.now().strftime("%H:%M:%S"))

    # --- Main Dashboard Panel ---
    dashboard = Panel(
        grid,
        title="[bold green]✔ Workflow Engine Online[/bold green]",
        subtitle="[dim]Powered by Rich & Loguru[/dim]",
        border_style="blue",
        box=box.ROUNDED,
        padding=(1, 2),
        width=80,  # Fixed width for a grand appearance
    )
    
    # Print Centered
    console.print()
    console.print(Align.center(logo))
    console.print(Align.center(dashboard))
    console.print()
    console.rule("[bold dim blue]Initialized & Ready[/bold dim blue]", style="dim blue")
    console.print()
    
    # Mark as shown in environment variables so child processes don't show it again
    os.environ["SNAKEMAKE_RICH_LOGURU_SPLASH_SHOWN"] = "1"

class LogHandler(LogHandlerBase):
    def __post_init__(self) -> None:
        # Ensure logging.Handler is initialized (fixes missing 'filters' attribute)
        logging.Handler.__init__(self)

        # Initialize log directory
        self.log_dir = Path(self.settings.log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Generate log file path
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        self.log_file_path = self.log_dir / f"{self.settings.log_file_prefix}_{timestamp}.log"

        # Reset loguru configuration
        logger.remove()

        # 1. Add File Handler (Loguru) - Detailed structural logs
        logger.add(
            self.log_file_path,
            rotation=self.settings.max_file_size,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
            level="DEBUG",
            backtrace=True,
            diagnose=True,
            enqueue=True  # Thread-safe
        )

        # 2. Add Console Handler (Rich) - Beautiful output
        # We use a custom format for RichHandler to let it handle the styling
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
        
        # Auto-configure Seq if monitor_config.yaml exists
        # passing empty dict since we can't access snakemake config here directly
        install({})

    def _capture_startup_info(self):
        """Capture environment info at startup."""
        try:
            width = shutil.get_terminal_size().columns
        except Exception:
            width = 80

        # Estimate prefix length (Time + Level + spacing) ~ 25 chars for RichHandler
        # Adjusting the message to be centered in the remaining space
        msg = f"{self.settings.log_file_prefix} Pipeline Initialized"
        # prefix_len = 25
        # padding = max(0, (width - prefix_len - len(msg)) // 2)
        # centered_msg = " " * padding + msg

        logger.info(f"[bold green]{msg}[/bold green]")

        # Collect detailed info
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

        # Log details (Plain text for clean file logs)
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
        """
        Hook for Snakemake's logging.
        Snakemake passes a standard logging.LogRecord object here.
        """
        # Get the corresponding loguru level
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelname

        # Find caller info to pass to loguru so it looks like it came from the original source
        # Note: 'opt(depth=...)' allows us to adjust the stack depth if needed,
        # but since we are emitting a pre-made record, we mostly care about the message.

        # We use the 'opt' method to force the exception traceback if present
        rec_opt = logger.opt(exception=record.exc_info, depth=6)

        # Skip records with None message (common in some Snakemake internal logging)
        if record.msg is None or record.msg == "":
            return

        # Construct the message.
        # Snakemake sometimes sends already formatted messages, or raw args.
        msg = record.getMessage()

        # --- Beautification Logic ---
        # Add rich markup to common Snakemake messages for better visibility
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
        # ----------------------------

        # Log it!
        rec_opt.log(level, msg)

    @property
    def writes_to_stream(self) -> bool:
        # We handle stream output via Rich (stdout/stderr)
        return True

    @property
    def writes_to_file(self) -> bool:
        # We handle file output via Loguru internally, but Snakemake forbids a plugin
        # from declaring itself as BOTH stream and file handler.
        # We declare as stream (to handle console), and handle file writing as a side effect.
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

# Trigger splash screen on module import (earliest possible time)
show_splash_screen()