from snakemake_interface_logger_plugins.base import LogHandlerBase
from snakemake_interface_logger_plugins.settings import LogHandlerSettingsBase

from dataclasses import dataclass, field
from typing import Optional, Any
import sys
import os
import platform
import json
from datetime import datetime
from pathlib import Path
import logging

# Import loguru for enhanced logging capabilities
from loguru import logger


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
        default="RNAFlow",
        metadata={
            "help": "Prefix for log file names",
            "env_var": False,
            "required": False,
        },
    )
    max_file_size: Optional[str] = field(
        default="500 MB",
        metadata={
            "help": "Maximum size before log rotation",
            "env_var": False,
            "required": False,
        },
    )
    capture_runtime_info: bool = field(
        default=True,
        metadata={
            "help": "Whether to capture comprehensive runtime information",
            "env_var": False,
            "required": False,
        },
    )


class LogHandler(LogHandlerBase):
    def __post_init__(self) -> None:
        # Initialize additional attributes
        self.loggers = {}  # Store multiple logger instances if needed

        # Create log directory
        self.log_dir = Path(self.settings.log_dir)
        self.log_dir.mkdir(exist_ok=True)

        # Generate log file name with valid format (no colons in timestamp)
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        # Try to get project name from common settings, fallback to default
        project_name = "RNAFlow"
        if hasattr(self.common_settings, 'config') and isinstance(self.common_settings.config, dict):
            project_name = self.common_settings.config.get('project_name', project_name)
        elif hasattr(self.common_settings, 'project_name'):
            project_name = getattr(self.common_settings, 'project_name', project_name)

        self.log_file_path = self.log_dir / f"{self.settings.log_file_prefix}_{project_name}_runtime_{timestamp}.log"

        # Remove default logger handlers to avoid duplication
        logger.remove()

        # Add file logger with clean, simple format
        self.file_logger_id = logger.add(
            self.log_file_path,
            rotation=self.settings.max_file_size,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
            level="INFO",
            colorize=False,  # Disable colorization for file logs
            backtrace=True,
            diagnose=True
        )

        # For development/testing, we can also output to stderr, but for production
        # we'll stick to file output only to comply with the plugin interface
        # Comment out stderr output to comply with single destination rule
        # self.stderr_logger_id = logger.add(
        #     sys.stderr,
        #     format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | "
        #            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        #     level="INFO",
        #     colorize=True,
        #     backtrace=True,
        #     diagnose=True
        # )

        # Capture runtime information if enabled
        if self.settings.capture_runtime_info:
            self._capture_runtime_info()

    def _capture_runtime_info(self):
        """Capture essential runtime information for the pipeline."""
        # Essential system information
        logger.info("RNAFlow Pipeline Started")
        logger.info(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info(f"System: {platform.system()} {platform.release()}")
        logger.info(f"Python Version: {platform.python_version()}")

        # Snakemake version
        try:
            import snakemake
            logger.info(f"Snakemake Version: {snakemake.__version__}")
        except ImportError:
            logger.info("Snakemake Version: unknown")

        # Log file location
        logger.info(f"Log File: {self.log_file_path}")
        logger.info(f"Working Directory: {os.getcwd()}")

        # Try to log key configuration parameters if available
        try:
            if hasattr(self.common_settings, 'config'):
                config = self.common_settings.config
                logger.info("Pipeline Configuration:")
                logger.info(f"  Project: {config.get('project_name', 'N/A')}")
                logger.info(f"  Workflow Dir: {config.get('workflow', 'N/A')}")
                logger.info(f"  Sample CSV: {config.get('sample_csv', 'N/A')}")
                logger.info(f"  Reference: {config.get('Genome_Version', 'N/A')}")
        except:
            logger.info("Configuration: not available")

        logger.info("-" * 60)
        logger.info("Runtime information captured.")
        logger.info("-" * 60)

    def emit(self, record):
        """Actually emit the record."""
        # Format the record using the handler's formatter if available
        formatted_message = self.format(record)
        
        # Determine log level from the record
        level = record.levelname
        
        # Map Python logging levels to loguru levels
        loguru_level = level
        
        # Log the message using loguru
        logger.log(loguru_level, formatted_message)

    @property
    def writes_to_stream(self) -> bool:
        # This plugin only writes to file, not to stream
        return False

    @property
    def writes_to_file(self) -> bool:
        # This plugin writes to a file
        return True

    @property
    def base_filename(self) -> str:
        # Required when writes_to_file returns True
        return str(self.log_file_path)

    @property
    def has_filter(self) -> bool:
        # This plugin does not attach its own filter
        return False

    @property
    def has_formatter(self) -> bool:
        # This plugin does attach its own formatter
        return True

    @property
    def needs_rulegraph(self) -> bool:
        # This plugin does not require the DAG rulegraph
        return False