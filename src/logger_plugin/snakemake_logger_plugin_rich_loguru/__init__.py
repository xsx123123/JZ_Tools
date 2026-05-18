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
import threading

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


class CompactRichHandler(RichHandler):
    """
    A thin wrapper around RichHandler that removes the default 8-char
    level-name padding, keeping the log output compact.
    """
    def get_level_text(self, record):
        level_name = record.levelname
        return Text.styled(level_name, f"logging.level.{level_name.lower()}")


# Export utilities for external analysis scripts
from .utils import (
    setup_analysis_logging,
    get_logger,
    initialize_analysis_logger,
    get_analysis_logger,
    get_analysis_log_file_path,
)
from .loki_utils import format_payload_for_loki
from .notification_utils import send_webhook_notification


import queue

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
        self.total_jobs = 1000  # Default estimate

        # P1: State lives on the instance to avoid cross-process contamination
        self._state = {
            "current": 0,
            "real_total": 0,
            "finished_ids": set(),
        }

        # Initialize queue and worker thread
        self.queue = queue.Queue()
        self.worker = threading.Thread(target=self._worker, daemon=True)
        self.worker.start()

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
        match2 = re.search(
            r"Finished jobid[:\s]\s*(\d+)(?:\s+\(Rule:\s+(.+?)\))?", plain_text
        )
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

    def _worker(self):
        """
        Background worker that processes the queue.
        """
        while True:
            try:
                message = self.queue.get()
                if message is None:
                    break
                self._send(message)
            except Exception as e:
                print(f"[Loki] Worker error: {e}", file=sys.stderr)
            finally:
                self.queue.task_done()

    def _send(self, message):
        """
        Actual network send logic.
        """
        try:
            # message is a JSON string containing the full record
            data = json.loads(message)
            record = data["record"]

            # Process Message to get clean text and extracted Snakemake properties
            plain_text, extra_props = self._process_message(record["message"])

            display_msg = plain_text
            if self.project_name:
                display_msg = f"{self.project_name} | {plain_text}"

            raw_log = {
                "msg": display_msg,
                "caller": f"{record['name']}:{record['function']}:{record['line']}",
                "level": record["level"]["name"].lower(),
            }
            if extra_props:
                raw_log.update(extra_props)

            # P1: Pass instance state to avoid cross-process contamination
            payload = format_payload_for_loki(
                raw_log, 
                self._state, 
                self.total_jobs, 
                project_name=self.project_name or "unknown_project"
            )

            # Send Request
            json_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(self.endpoint, data=json_data, method="POST")
            req.add_header("Content-Type", "application/json")

            # P1: Explicit timeout to prevent blocking
            with urllib.request.urlopen(req, timeout=5) as response:
                pass

        except Exception as e:
            # P1: Avoid completely silent failures
            print(f"[Loki] Push failed: {e}", file=sys.stderr)

    def write(self, message):
        """
        Loguru calls this method with the serialized JSON string.
        We put it into the queue for async processing.
        """
        self.queue.put(message)



def install(snakemake_config):
    """
    Install the monitor plugin configuration.

    It searches for 'monitor_config.yaml' to configure the Loki sink.
    """

    # 0. Check for Dry-run
    is_dry_run = False
    for arg in sys.argv:
        if arg in ["-n", "--dry-run", "--dryrun"]:
            is_dry_run = True
            break

    if is_dry_run:
        logger.info(
            "[bold yellow]Dry-run detected: Loki logging is disabled.[/bold yellow]"
        )
        return

    # Helper: Parse CLI args manually for config override
    def _get_cli_config_value(key_name):
        try:
            if "--config" in sys.argv:
                idx = sys.argv.index("--config")
                for arg in sys.argv[idx + 1 :]:
                    if arg.startswith("-"):
                        break
                    if "=" in arg:
                        k, v = arg.split("=", 1)
                        if k == key_name:
                            return v
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
                serialize=True,  # Pass JSON string to handler
                enqueue=True,  # Async logging
                level="INFO",
            )
            logger.info(
                f"Analysis logs will be pushed to Loki server: [bold underline]{handler.endpoint}[/bold underline]"
            )
        except Exception as e:
            logger.error(f"Failed to initialize Loki sink: {e}")
    
    return config


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
    style: Optional[str] = field(
        default="default",
        metadata={
            "help": "Logging style ('default', 'minimal', 'detailed', 'plain')",
            "env_var": False,
            "required": False,
        },
    )
    notification_url: Optional[str] = field(
        default=None,
        metadata={
            "help": "Webhook URL for notifications (DingTalk, Feishu, etc.)",
            "env_var": "SNAKEMAKE_NOTIFICATION_URL",
            "required": False,
        },
    )
    notification_platform: Optional[str] = field(
        default="dingtalk",
        metadata={
            "help": "Platform for notifications ('dingtalk', 'feishu')",
            "env_var": "SNAKEMAKE_NOTIFICATION_PLATFORM",
            "required": False,
        },
    )


def show_splash_screen():
    """
    Display a startup splash screen.

    Disabled by default to avoid blocking the workflow.
    Set environment variable SNAKEMAKE_RICH_LOGURU_SPLASH=1 to enable.
    """
    env = os.environ.get("SNAKEMAKE_RICH_LOGURU_SPLASH", "0").lower()
    if env not in ("1", "true", "yes"):
        return

    # Prevent repeated display within the same process tree
    if os.environ.get("SNAKEMAKE_RICH_LOGURU_SPLASH_SHOWN"):
        return

    try:
        if not sys.stderr.isatty():
            return
    except Exception:
        pass

    console = Console(file=sys.stderr)

    steps = [
        "📡 Initializing Core Systems...",
        "🔌 Loading Logger Plugins...",
        "🛡️ Verifying Environment...",
        "🚀 Connecting to HPC Cluster...",
        "🧬 Scanning Workflow DAG...",
    ]

    console.print()
    console.rule(
        "[bold cyan]🚀 Snakemake Runtime Sequence[/bold cyan]", style="dim blue"
    )
    console.print()

    for desc in steps:
        console.print(f"[bold green]✔[/bold green] {desc}")

    f = pyfiglet.Figlet(font="slant")
    ascii_art = f.renderText("Snakemake")
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

        # P0: Track handler IDs we add so we can manage them precisely
        self._loguru_handler_ids = []

        self.log_dir = Path(self.settings.log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.log_file_path = self.log_dir / f"{self.settings.log_file_prefix}_{timestamp}.log"

        # P0: Only remove loguru's default stderr handler (ID 0), not *all* handlers
        try:
            logger.remove(0)
        except ValueError:
            pass

        # Define a dynamic icon function for loguru
        def get_status_icon(record):
            msg = record["message"]
            level = record["level"].name
            
            if level == "INFO":
                if any(x in msg for x in ["Finished jobid:", "Nothing to be done"]):
                    return " [bold green]●[/bold green]"
            elif level == "WARNING":
                return " [bold yellow]●[/bold yellow]"
            elif level == "ERROR" or level == "CRITICAL":
                return " [bold red]●[/bold red]"
            return ""

        # Define common format parts
        # We use a lambda for format to evaluate get_status_icon dynamically
        def dynamic_format(record):
            icon = get_status_icon(record)
            # Loguru automatically handles level coloring if we use <level> tags
            return f"<green>{{time:HH:mm:ss}}</green> | <level>{{level: <8}}</level>{icon} | {{message}}\n"

        # 1. File Handler
        hid = logger.add(
            self.log_file_path,
            rotation=self.settings.max_file_size,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
            level="DEBUG",
            backtrace=True,
            diagnose=True,
            enqueue=True,
        )
        self._loguru_handler_ids.append(hid)

        # 2. Console Handler (Rich)
        style = getattr(self.settings, "style", "default")
        
        if style == "minimal":
            rich_handler = RichHandler(
                show_time=False,
                show_path=False,
                markup=True,
                rich_tracebacks=True,
            )
            # Use internal attribute to set level width to 0 for tighter spacing
            rich_handler._level_width = 0
            
            hid = logger.add(
                rich_handler,
                format=lambda r: f"{get_status_icon(r)} {{message}}",
                level="INFO",
                enqueue=True,
            )
        elif style == "detailed":
            rich_handler = RichHandler(
                show_time=True,
                omit_repeated_times=False,
                show_path=True,
                markup=True,
                rich_tracebacks=True,
                log_time_format="[%X]",
            )
            rich_handler._level_width = 0

            hid = logger.add(
                rich_handler,
                format=lambda r: f"{get_status_icon(r)} {{message}}",
                level="INFO",
                enqueue=True,
            )
        elif style == "plain":
            hid = logger.add(
                sys.stderr,
                format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
                level="INFO",
                enqueue=True,
                colorize=True
            )
        else:  # default style
            rich_handler = RichHandler(
                show_time=True,
                omit_repeated_times=False,
                show_path=False,
                markup=True,
                rich_tracebacks=True,
                log_time_format="[%X]",
            )
            rich_handler._level_width = 0

            hid = logger.add(
                rich_handler,
                # Note: RichHandler handles the [TIME] LEVEL part. 
                # We inject the icon into the message prefix in emit to keep it inside the Rich formatting
                format="{message}",
                level="INFO",
                enqueue=True,
            )
        
        self._loguru_handler_ids.append(hid)

        self._capture_startup_info()

        # P0: Notification state
        self._notified = False

        # Configure Loki and get extra config
        extra_config = install({})
        
        # Override notification settings from config file if not set via CLI/ENV
        if not self.settings.notification_url and "notification_url" in extra_config:
            self.settings.notification_url = extra_config["notification_url"]
        if self.settings.notification_platform == "dingtalk" and "notification_platform" in extra_config:
            self.settings.notification_platform = extra_config["notification_platform"]

    def _capture_startup_info(self):
        msg = f"{self.settings.log_file_prefix} Pipeline Initialized"
        style = getattr(self.settings, "style", "default")
        logger.info(f"[bold green]{msg}[/bold green] [dim](Style: {style})[/dim]")

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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

        if record.msg is None:
            return

        msg = record.getMessage()
        if not msg or msg == "None":
            return
        
        # Determine status icon to inject after level in the final display
        status_icon = ""
        if level == "INFO":
            status_icon = "[bold green]●[/bold green] "
        elif level == "WARNING":
            status_icon = "[bold yellow]●[/bold yellow] "
        elif level == "ERROR" or level == "CRITICAL":
            status_icon = "[bold red]●[/bold red] "
        elif level == "DEBUG":
            status_icon = "[dim]○[/dim] "

        # Custom Highlighting for the message body
        if "Rule:" in msg:
            msg = msg.replace("Rule:", "[bold cyan]Rule:[/bold cyan]")
        if "Jobid:" in msg:
            msg = msg.replace("Jobid:", "[bold magenta]Jobid:[/bold magenta]")
        if "Finished jobid:" in msg:
            msg = msg.replace(
                "Finished jobid:", "[bold green]✔ Finished jobid:[/bold green]"
            )
        
        # New highlights
        if "Building DAG of jobs..." in msg:
            msg = f"[bold blue]⚙ {msg}[/bold blue]"
        if "Nothing to be done" in msg:
            msg = f"[bold green]✨ {msg}[/bold green]"
        if "Select jobs to execute..." in msg:
            msg = "[bold yellow]🔍 Select jobs to execute...[/bold yellow]"
        if "Execute" in msg and "jobs..." in msg:
            msg = f"[bold yellow]🚀 {msg}[/bold yellow]"
        if "Provided cores:" in msg:
            msg = f"[bold white on blue] {msg} [/bold white on blue]"
        if "wildcards:" in msg:
            msg = msg.replace("wildcards:", "[italic yellow]wildcards:[/italic yellow]")
        if "output:" in msg:
            msg = msg.replace("output:", "[bold green]output:[/bold green]")
        if "input:" in msg:
            msg = msg.replace("input:", "[bold blue]input:[/bold blue]")

        # --- Notification Logic ---
        if self.settings.notification_url and not self._notified:
            title = f"Snakemake: {self.settings.log_file_prefix}"
            if "Complete log(s):" in msg or "Nothing to be done" in msg:
                send_webhook_notification(
                    self.settings.notification_url,
                    f"✅ **Workflow Success**\n\nProject: {self.settings.log_file_prefix}\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n{msg}",
                    title=title,
                    platform=self.settings.notification_platform
                )
                self._notified = True
            elif "WorkflowError" in msg or (level in ["ERROR", "CRITICAL"] and "Finished jobid:" not in msg):
                # Avoid notifying for every minor error if possible, but major ones should trigger it
                # Snakemake often logs WorkflowError for fatal issues
                send_webhook_notification(
                    self.settings.notification_url,
                    f"❌ **Workflow Failed**\n\nProject: {self.settings.log_file_prefix}\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n{msg}",
                    title=title,
                    platform=self.settings.notification_platform
                )
                self._notified = True

        # Combine icon and message
        # Since RichHandler already prints the Level, we just prepend the icon to the message
        final_msg = f"{status_icon}{msg}"

        rec_opt.log(level, final_msg)

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
