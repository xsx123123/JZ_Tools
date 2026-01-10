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
    file_level="DEBUG"
):
    """
    Setup logging for analysis scripts to match the Snakemake rich-loguru plugin style.
    
    Args:
        log_dir: Directory to store log files
        log_file_prefix: Prefix for log file names
        max_file_size: Maximum size before log rotation
        console_level: Logging level for console output
        file_level: Logging level for file output
    """
    # Initialize log directory
    log_dir_path = Path(log_dir)
    log_dir_path.mkdir(parents=True, exist_ok=True)

    # Generate log file path
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    log_file_path = log_dir_path / f"{log_file_prefix}_{timestamp}.log"

    # Reset loguru configuration to avoid duplicate logs
    # Note: This should be called once per script, not if logger is already configured elsewhere
    handlers = logger._core.handlers.copy()
    if len(handlers) > 0:
        # If logger already has handlers, remove them to avoid duplication
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

    # Add Console Handler (Rich) - Beautiful output
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

    logger.info(f"[bold green]{log_file_prefix.capitalize()} Script Initialized[/bold green]")
    logger.info(f"Log file: {log_file_path}")

    return logger, log_file_path


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