from snakemake_interface_logger_plugins.base import LogHandlerBase
from snakemake_interface_logger_plugins.settings import LogHandlerSettingsBase

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
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
import getpass
import socket
import time
import threading
import queue
import atexit

# Import loguru and rich
from loguru import logger
from rich.logging import RichHandler
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
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


# -----------------------------------------------------------------------------
# Shared configuration keys and environment mapping
# -----------------------------------------------------------------------------

MONITOR_CONFIG_KEYS = {
    "loki_url",
    "project_name",
    "omichub_monitor_url",
    "omichub_monitor_token",
    "omichub_task_id",
    "omichub_flow_id",
    "omichub_user_id",
    "omichub_monitor_sign_requests",
    "omichub_monitor_signing_key",
    "omichub_monitor_encrypt_payload",
    "omichub_monitor_encryption_key",
    "omichub_monitor_tls_verify",
    "omichub_monitor_timeout",
    "omichub_monitor_queue_size",
    "omichub_monitor_retry_count",
    "omichub_monitor_retry_backoff",
    "notification_url",
    "notification_platform",
}

SENSITIVE_KEYS = {
    "omichub_monitor_token",
    "omichub_monitor_signing_key",
    "omichub_monitor_encryption_key",
    "notification_url",
}

ENV_VAR_MAP = {
    "loki_url": "SNAKEMAKE_LOKI_URL",
    "project_name": "SNAKEMAKE_PROJECT_NAME",
    "omichub_monitor_url": "SNAKEMAKE_OMICHUB_MONITOR_URL",
    "omichub_monitor_token": "SNAKEMAKE_OMICHUB_MONITOR_TOKEN",
    "omichub_task_id": "SNAKEMAKE_OMICHUB_TASK_ID",
    "omichub_flow_id": "SNAKEMAKE_OMICHUB_FLOW_ID",
    "omichub_user_id": "SNAKEMAKE_OMICHUB_USER_ID",
    "omichub_monitor_sign_requests": "SNAKEMAKE_OMICHUB_MONITOR_SIGN_REQUESTS",
    "omichub_monitor_signing_key": "SNAKEMAKE_OMICHUB_MONITOR_SIGNING_KEY",
    "omichub_monitor_encrypt_payload": "SNAKEMAKE_OMICHUB_MONITOR_ENCRYPT_PAYLOAD",
    "omichub_monitor_encryption_key": "SNAKEMAKE_OMICHUB_MONITOR_ENCRYPTION_KEY",
    "omichub_monitor_tls_verify": "SNAKEMAKE_OMICHUB_MONITOR_TLS_VERIFY",
    "omichub_monitor_timeout": "SNAKEMAKE_OMICHUB_MONITOR_TIMEOUT",
    "omichub_monitor_queue_size": "SNAKEMAKE_OMICHUB_MONITOR_QUEUE_SIZE",
    "omichub_monitor_retry_count": "SNAKEMAKE_OMICHUB_MONITOR_RETRY_COUNT",
    "omichub_monitor_retry_backoff": "SNAKEMAKE_OMICHUB_MONITOR_RETRY_BACKOFF",
    "notification_url": "SNAKEMAKE_NOTIFICATION_URL",
    "notification_platform": "SNAKEMAKE_NOTIFICATION_PLATFORM",
}


# Export utilities for external analysis scripts
from .utils import (
    setup_analysis_logging,
    get_logger,
    initialize_analysis_logger,
    get_analysis_logger,
    get_analysis_log_file_path,
    extract_snakemake_event,
    SnakemakeProgressTracker,
)
from .loki_utils import format_payload_for_loki
from .notification_utils import send_webhook_notification
from .omichub_utils import OmicHubMonitorHandler


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
        self._tracker = SnakemakeProgressTracker(estimated_total_jobs=self.total_jobs)

        # Initialize queue and worker thread
        self.queue = queue.Queue()
        self.worker = threading.Thread(target=self._worker, daemon=True)
        self.worker.start()
        self._closed = False
        atexit.register(self.close)

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
            plain_text, extra_props = extract_snakemake_event(record["message"])

            display_msg = plain_text
            if self.project_name:
                display_msg = f"{self.project_name} | {plain_text}"

            raw_log = {
                "msg": display_msg,
                "caller": f"{record['name']}:{record['function']}:{record['line']}",
                "level": record["level"]["name"].lower(),
            }
            if extra_props:
                # Loki labels already use Snakemake_* keys; keep backward-compatible mapping
                for key, value in extra_props.items():
                    if key == "rule":
                        raw_log["Snakemake_Rule"] = value
                    elif key == "job_id":
                        raw_log["Snakemake_JobId"] = value
                    elif key == "event_type":
                        raw_log["Event_Type"] = value
                    elif key == "shell_command":
                        raw_log["Shell_Command"] = value

            # P1: Pass instance tracker to avoid cross-process contamination
            payload = format_payload_for_loki(
                raw_log,
                tracker=self._tracker,
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
        if self._closed:
            return
        self.queue.put(message)

    def close(self):
        """Flush pending logs and stop the worker thread."""
        if self._closed:
            return
        self._closed = True
        try:
            self.queue.put(None, timeout=1.0)
        except queue.Full:
            pass
        self.queue.join()
        self.worker.join(timeout=5.0)
        try:
            atexit.unregister(self.close)
        except Exception:
            pass

    def __del__(self):
        self.close()


# -----------------------------------------------------------------------------
# Configuration loading helpers
# -----------------------------------------------------------------------------

def _is_dry_run() -> bool:
    for arg in sys.argv:
        if arg in ("-n", "--dry-run", "dry-run", "--dryrun"):
            return True
    return False


def _get_cli_config_value(key_name: str) -> Optional[str]:
    """Parse --config key=value style CLI arguments."""
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


def _load_yaml_config(path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        logger.debug(f"Failed to load config from {path}: {e}")
    return None


def load_monitor_config(snakemake_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Locate and load the monitor configuration file.

    Priority:
      1. --config monitor_conf=...
      2. --config analysisyaml=...
      3. Snakemake config dict (monitor_conf / loki_url / omichub_*)
      4. Environment variable SNAKEMAKE_MONITOR_CONF
      5. Current directory monitor_config.yaml
      6. Current directory config/monitor_config.yaml
    """
    possible_paths = [
        _get_cli_config_value("monitor_conf"),
        _get_cli_config_value("analysisyaml"),
        snakemake_config.get("monitor_conf"),
        os.environ.get("SNAKEMAKE_MONITOR_CONF"),
        snakemake_config.get("analysisyaml"),
        "monitor_config.yaml",
        "config/monitor_config.yaml",
    ]

    config: Dict[str, Any] = {}
    loaded_path = None

    for path in possible_paths:
        if path and os.path.exists(path):
            loaded_config = _load_yaml_config(path)
            if loaded_config is not None and MONITOR_CONFIG_KEYS.intersection(loaded_config):
                config = loaded_config
                loaded_path = path
                break

    if loaded_path:
        logger.debug(f"Loaded monitor config from: {loaded_path}")

    # Merge explicit snakemake config values as overrides
    for key in MONITOR_CONFIG_KEYS:
        if key in snakemake_config:
            config[key] = snakemake_config[key]

    return config


def merge_env_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """Overlay environment variable fallbacks for monitor settings."""
    merged = dict(config)
    for key, env_name in ENV_VAR_MAP.items():
        value = os.environ.get(env_name)
        if value is not None and key not in merged:
            # Try to coerce booleans/numbers for known fields
            lower = value.lower()
            if lower in ("true", "1", "yes"):
                merged[key] = True
            elif lower in ("false", "0", "no"):
                merged[key] = False
            else:
                try:
                    if key in {
                        "omichub_monitor_timeout",
                        "omichub_monitor_queue_size",
                        "omichub_monitor_retry_count",
                        "omichub_monitor_retry_backoff",
                    }:
                        if "." in value:
                            merged[key] = float(value)
                        else:
                            merged[key] = int(value)
                    else:
                        merged[key] = value
                except ValueError:
                    merged[key] = value
    return merged


def resolve_env_placeholders(config: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve ${ENV_NAME} placeholders inside config values."""
    resolved = dict(config)
    pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")

    for key, value in resolved.items():
        if not isinstance(value, str):
            continue
        match = pattern.fullmatch(value)
        if match:
            env_name = match.group(1)
            env_value = os.environ.get(env_name)
            if env_value is not None:
                resolved[key] = env_value
            elif key in SENSITIVE_KEYS:
                # Do not send raw placeholder as a secret
                logger.warning(
                    f"Environment variable {env_name} for {key} is not set; "
                    "leaving config value empty."
                )
                resolved[key] = ""
            else:
                resolved[key] = value
    return resolved


def mask_sensitive_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of config with sensitive values masked for safe logging."""
    safe = {}
    for key, value in config.items():
        if key in SENSITIVE_KEYS and value:
            safe[key] = "***"
        else:
            safe[key] = value
    return safe


def setup_loki_if_enabled(config: Dict[str, Any]):
    """Add the Loki sink if loki_url is configured."""
    loki_url = config.get("loki_url")
    project_name = config.get("project_name")
    if not loki_url:
        return None

    try:
        handler = LokiHandler(loki_url, project_name)
        logger.add(
            handler.write,
            serialize=True,
            enqueue=True,
            level="INFO",
        )
        logger.info(
            f"Analysis logs will be pushed to Loki server: [bold underline]{handler.endpoint}[/bold underline]"
        )
        return handler
    except Exception as e:
        logger.error(f"Failed to initialize Loki sink: {e}")
    return None


def setup_omichub_monitor_if_enabled(config: Dict[str, Any]):
    """Add the OmicHub native monitor sink if omichub_monitor_url is configured."""
    monitor_url = config.get("omichub_monitor_url")
    if not monitor_url:
        return None

    token = config.get("omichub_monitor_token") or None
    if not token:
        logger.warning(
            "OmicHub monitor URL is configured but no token was provided. "
            "Requests may be rejected by the server."
        )

    project_name = config.get("project_name")
    task_id = config.get("omichub_task_id")
    flow_id = config.get("omichub_flow_id")
    user_id = config.get("omichub_user_id")

    sign_requests = config.get("omichub_monitor_sign_requests", False)
    signing_key = config.get("omichub_monitor_signing_key") or None
    if sign_requests and not signing_key and token:
        # First phase fallback: use token as signing key
        signing_key = token

    encrypt_payload = config.get("omichub_monitor_encrypt_payload", False)
    encryption_key = config.get("omichub_monitor_encryption_key") or None

    tls_verify = config.get("omichub_monitor_tls_verify", True)
    timeout = config.get("omichub_monitor_timeout", 5.0)
    queue_size = config.get("omichub_monitor_queue_size", 10000)
    retry_count = config.get("omichub_monitor_retry_count", 3)
    retry_backoff = config.get("omichub_monitor_retry_backoff", 0.5)

    if not tls_verify and monitor_url.startswith("https"):
        logger.warning(
            "OmicHub monitor TLS verification is disabled. "
            "This should only be used in local development."
        )

    try:
        handler = OmicHubMonitorHandler(
            monitor_url=monitor_url,
            token=token,
            project_name=project_name,
            task_id=task_id,
            flow_id=flow_id,
            user_id=user_id,
            sign_requests=sign_requests,
            signing_key=signing_key,
            encrypt_payload=encrypt_payload,
            encryption_key=encryption_key,
            tls_verify=tls_verify,
            timeout=timeout,
            queue_size=queue_size,
            retry_count=retry_count,
            retry_backoff=retry_backoff,
        )
        logger.add(
            handler.write,
            serialize=True,
            enqueue=True,
            level="INFO",
        )
        logger.info(
            f"Workflow events will be pushed to OmicHub monitor: [bold underline]{monitor_url}[/bold underline]"
        )
        return handler
    except Exception as e:
        logger.error(f"Failed to initialize OmicHub monitor sink: {e}")
    return None


def install(snakemake_config):
    """
    Install the monitor plugin configuration.

    It searches for 'monitor_config.yaml' to configure the Loki and/or OmicHub sinks.
    """
    if _is_dry_run():
        logger.info(
            "[bold yellow]Dry-run detected: remote monitoring is disabled.[/bold yellow]"
        )
        return {}

    config = load_monitor_config(snakemake_config or {})
    config = merge_env_config(config)
    config = resolve_env_placeholders(config)

    if config:
        safe_config = mask_sensitive_config(config)
        logger.debug(f"Active monitor config: {safe_config}")

    setup_loki_if_enabled(config)
    setup_omichub_monitor_if_enabled(config)

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
            rich_handler = CompactRichHandler(
                show_time=False,
                show_path=False,
                markup=True,
                rich_tracebacks=True,
            )
            
            hid = logger.add(
                rich_handler,
                format=lambda r: f"{get_status_icon(r)} {{message}}",
                level="INFO",
                enqueue=True,
            )
        elif style == "detailed":
            rich_handler = CompactRichHandler(
                show_time=True,
                omit_repeated_times=False,
                show_path=True,
                markup=True,
                rich_tracebacks=True,
                log_time_format="[%X]",
            )

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
            rich_handler = CompactRichHandler(
                show_time=True,
                omit_repeated_times=False,
                show_path=False,
                markup=True,
                rich_tracebacks=True,
                log_time_format="[%X]",
            )

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

        # Configure Loki / OmicHub and get extra config
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
