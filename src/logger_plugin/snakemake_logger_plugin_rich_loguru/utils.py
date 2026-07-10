"""
Utility module to provide consistent logging for analysis scripts
within Snakemake workflows using the rich-loguru logger plugin.
"""

from loguru import logger
import logging
from rich.logging import RichHandler
from pathlib import Path
from datetime import datetime
import re
import sys
from typing import Dict, Any, Optional, Tuple


# -----------------------------------------------------------------------------
# Snakemake event parsing and progress tracking (shared by Loki and OmicHub)
# -----------------------------------------------------------------------------

class SnakemakeProgressTracker:
    """
    Track workflow progress across log messages.

    State is intentionally isolated per instance so that multiple handlers
    do not accidentally share mutable state across threads/processes.
    """

    def __init__(self, estimated_total_jobs: int = 1000):
        self.estimated_total_jobs = estimated_total_jobs
        self._state = {
            "current": 0,
            "real_total": 0,
            "finished_ids": set(),
        }

    def update(self, raw_log: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update progress state based on a raw log dict and return progress info.

        Returns a dict with keys:
            progress_percent, progress_details, current, total
        """
        msg = raw_log.get("msg", "")
        state = self._state

        # Case A: Precise "X of Y steps" log
        match_progress = re.search(r"(\d+)\s+of\s+(\d+)\s+steps", msg)
        if match_progress:
            state["current"] = int(match_progress.group(1))
            state["real_total"] = int(match_progress.group(2))

        # Case B: "Finished jobid" event
        elif raw_log.get("Event_Type") == "JobFinished" or re.search(
            r"Finished jobid[:\s]\s*(\d+)", msg
        ):
            job_id_match = re.search(r"Finished jobid[:\s]\s*(\d+)", msg)
            if job_id_match:
                job_id = job_id_match.group(1)
                if job_id not in state["finished_ids"]:
                    state["finished_ids"].add(job_id)
                    state["current"] += 1
            else:
                state["current"] += 1

        # Case C: "Job stats" table total detection
        match_total = re.search(r"^\s*total\s+(\d+)\s*$", msg, re.MULTILINE)
        if match_total:
            found_total = int(match_total.group(1))
            if found_total > 0 and state["real_total"] == 0:
                state["real_total"] = found_total

        # Case D: Completion / Nothing to be done
        if "Complete log(s):" in msg or "Nothing to be done" in msg:
            if state["real_total"] > 0:
                state["current"] = state["real_total"]
            else:
                state["current"] = self.estimated_total_jobs
                state["real_total"] = self.estimated_total_jobs

        denominator = state["real_total"] if state["real_total"] > 0 else self.estimated_total_jobs
        denominator = max(denominator, 1)
        progress = (state["current"] / denominator) * 100.0
        progress = min(progress, 100.0)

        return {
            "progress_percent": round(progress, 2),
            "progress_details": f"{state['current']}/{denominator}",
            "current": state["current"],
            "total": denominator,
            "real_total": state["real_total"],
        }


def extract_snakemake_event(message: str) -> Tuple[str, Dict[str, Any]]:
    """
    Extract clean text and Snakemake properties from a log message.

    Returns a tuple of (plain_text, properties) where properties may contain:
        rule, job_id, event_type, shell_command
    """
    from rich.text import Text

    try:
        plain_text = Text.from_markup(message).plain
    except Exception:
        plain_text = message

    properties: Dict[str, Any] = {}

    # Pattern 1: Rule: <name>, Jobid: <id>
    match1 = re.search(r"Rule:\s+(.+?),\s+Jobid:\s+(\d+)", plain_text)
    if match1:
        properties["rule"] = match1.group(1)
        properties["job_id"] = int(match1.group(2))

    # Pattern 2: Finished jobid: <id> (Rule: <name>)
    match2 = re.search(
        r"Finished jobid[:\s]\s*(\d+)(?:\s+\(Rule:\s+(.+?)\))?", plain_text
    )
    if match2:
        properties["job_id"] = int(match2.group(1))
        if match2.group(2):
            properties["rule"] = match2.group(2)
        properties["event_type"] = "JobFinished"

    # Pattern 3: Shell command
    if plain_text.startswith("Shell command: "):
        properties["shell_command"] = plain_text.replace("Shell command: ", "").strip()
        properties["event_type"] = "ShellCommand"

    return plain_text, properties


def setup_analysis_logging(
    log_dir="logs",
    log_file_prefix="analysis",
    max_file_size="100 MB",
    console_level="INFO",
    file_level="DEBUG",
    style="default"
):
    """
    Setup logging for analysis scripts to match the Snakemake rich-loguru plugin style.
    
    Args:
        log_dir: Directory to store log files
        log_file_prefix: Prefix for log file names
        max_file_size: Maximum size before log rotation
        console_level: Logging level for console output
        file_level: Logging level for file output
        style: Logging style ('default', 'minimal', 'detailed', 'plain')
    """
    # Initialize log directory
    log_dir_path = Path(log_dir)
    log_dir_path.mkdir(parents=True, exist_ok=True)

    # Generate log file path
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    log_file_path = log_dir_path / f"{log_file_prefix}_{timestamp}.log"

    # Reset loguru configuration to avoid duplicate logs
    handlers = logger._core.handlers.copy()
    if len(handlers) > 0:
        for handler_id in list(logger._core.handlers.keys()):
            logger.remove(handler_id)

    # Add File Handler - Detailed structural logs
    logger.add(
        log_file_path,
        rotation=max_file_size,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} | {message}",
        level=file_level,
        backtrace=True,
        diagnose=True,
        enqueue=True  # Thread-safe
    )

    # Configure Console Handler based on style
    if style == "minimal":
        logger.add(
            RichHandler(
                show_time=False,
                show_path=False,
                markup=True,
                rich_tracebacks=True,
            ),
            format="{message}",
            level=console_level,
            enqueue=True
        )
    elif style == "detailed":
        logger.add(
            RichHandler(
                show_time=True,
                omit_repeated_times=False,
                show_path=True,
                markup=True,
                rich_tracebacks=True,
                log_time_format="[%X]"
            ),
            format="{name}:{function}:{line} - {message}",
            level=console_level,
            enqueue=True
        )
    elif style == "plain":
        logger.add(
            sys.stderr,
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
            level=console_level,
            enqueue=True,
            colorize=True
        )
    else:  # default style
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
            level=console_level,
            enqueue=True
        )

    logger.info(f"[bold green]{log_file_prefix.capitalize()} Script Initialized[/bold green] (Style: {style})")
    logger.info(f"Log file: {log_file_path}")

    return logger, log_file_path


# --- Helper Functions for Beautiful Logging ---

def log_header(title: str):
    """Log a prominent header."""
    logger.info("")
    logger.info(f"[bold cyan]{'='*10} {title.upper()} {'='*10}[/bold cyan]")


def log_section(title: str):
    """Log a section divider."""
    logger.info(f"\n[bold blue]─── {title} ───[/bold blue]")


def log_success(msg: str):
    """Log a success message with a checkmark."""
    logger.info(f"[bold green]✔ {msg}[/bold green]")


def log_warning(msg: str):
    """Log a warning message with an icon."""
    logger.warning(f"[bold yellow]⚠ {msg}[/bold yellow]")


def log_error(msg: str):
    """Log an error message with an icon."""
    logger.error(f"[bold red]✘ {msg}[/bold red]")


def log_info(msg: str):
    """Log an info message (alias for logger.info with markup support)."""
    logger.info(msg)


def log_step(step: int, total: int, msg: str):
    """Log a step in a multi-step process."""
    logger.info(f"[bold magenta][Step {step}/{total}][/bold magenta] {msg}")


def log_config(config_dict: dict, title="Configuration"):
    """Log a dictionary as a clean configuration block."""
    from rich.table import Table
    from rich.console import Console
    import io
    
    table = Table(title=title, show_header=True, header_style="bold magenta", box=None)
    table.add_column("Parameter", style="dim")
    table.add_column("Value", style="bold")
    
    for k, v in config_dict.items():
        table.add_row(str(k), str(v))
    
    # Capture rich table output
    console = Console(file=io.StringIO(), force_terminal=True, width=80)
    console.print(table)
    logger.info("\n" + console.file.getvalue())


def get_logger():
    """
    Return the configured loguru logger instance.
    This can be used directly in analysis scripts.
    """
    return logger


# Singleton pattern to ensure consistent logging across modules
_ANALYSIS_LOGGER = None
_ANALYSIS_LOG_FILE_PATH = None


def initialize_analysis_logger(**kwargs):
    """
    Initialize the analysis logger as a singleton to prevent multiple configurations.
    """
    global _ANALYSIS_LOGGER, _ANALYSIS_LOG_FILE_PATH
    
    if _ANALYSIS_LOGGER is None:
        _ANALYSIS_LOGGER, _ANALYSIS_LOG_FILE_PATH = setup_analysis_logging(**kwargs)
    
    return _ANALYSIS_LOGGER, _ANALYSIS_LOG_FILE_PATH


def get_analysis_logger():
    """
    Get the singleton analysis logger instance.
    """
    global _ANALYSIS_LOGGER
    
    if _ANALYSIS_LOGGER is None:
        # Initialize with defaults if not already done
        _ANALYSIS_LOGGER, _ = initialize_analysis_logger()
    
    return _ANALYSIS_LOGGER


def get_analysis_log_file_path():
    """
    Get the path to the analysis log file.
    """
    global _ANALYSIS_LOG_FILE_PATH
    return _ANALYSIS_LOG_FILE_PATH