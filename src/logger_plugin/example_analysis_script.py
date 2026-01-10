#!/usr/bin/env python3
"""
Example analysis script showing how to use the unified logging system
with the rich-loguru logger plugin.
"""

import sys
from snakemake_logger_plugin_rich_loguru import (
    initialize_analysis_logger, 
    get_analysis_logger
)


def main():
    # Initialize the analysis logger to match the Snakemake workflow style
    # This should be called once at the beginning of your analysis script
    logger = initialize_analysis_logger(
        log_dir="logs",
        log_file_prefix="example_analysis"
    )
    
    # Get the logger instance to use in your script
    logger = get_analysis_logger()
    
    # Now you can use the logger consistently with the Snakemake workflow
    logger.info("[bold blue]Starting example analysis script[/bold blue]")
    logger.info("Processing data...")
    
    # Simulate some analysis work
    for i in range(5):
        logger.info(f"Processing step {i+1}/5...")
        
        if i == 2:
            logger.warning("This is a warning message")
        elif i == 4:
            logger.success("Analysis completed successfully!")
    
    logger.info("[bold green]Example analysis script finished[/bold green]")


if __name__ == "__main__":
    main()