"""
Utility module to provide consistent logging for analysis scripts
within Snakemake workflows using the rich-loguru logger plugin.
"""

from loguru import logger
import logging
from rich.logging import RichHandler
from pathlib import Path
from datetime import datetime
import sys


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