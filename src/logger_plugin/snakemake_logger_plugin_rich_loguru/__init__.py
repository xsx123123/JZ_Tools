from snakemake_interface_logger_plugins.base import LogHandlerBase
from snakemake_interface_logger_plugins.settings import LogHandlerSettingsBase

from dataclasses import dataclass, field
from typing import Optional
import sys
import os
import platform
from datetime import datetime
from pathlib import Path
import logging
import shutil
import getpass
import socket

# Import loguru and rich
from loguru import logger
from rich.logging import RichHandler

# Export utilities for external analysis scripts
from .utils import setup_analysis_logging, get_logger, initialize_analysis_logger, get_analysis_logger, get_analysis_log_file_path

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
