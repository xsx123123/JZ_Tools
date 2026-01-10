# Snakemake Logger Plugin Rich-Loguru

A Snakemake logger plugin using Loguru and Rich for beautiful console and file logging.

## Features

- Beautiful console output using Rich
- Structured file logging using Loguru
- Integration with Snakemake's logging system
- Support for unified logging in analysis scripts

## Installation

```bash
pip install snakemake-logger-plugin-rich-loguru
```

## Usage

### In Snakemake Workflows

```bash
snakemake --logger rich-loguru
```

### For Analysis Scripts Within Workflows

To maintain consistent logging in your analysis scripts, use the provided utilities:

```python
from snakemake_logger_plugin_rich_loguru import initialize_analysis_logger, get_analysis_logger

# Initialize logger (call once at the start of your script)
logger = initialize_analysis_logger(
    log_dir="logs",
    log_file_prefix="my_analysis_script"
)

# Get the logger instance
logger = get_analysis_logger()

# Use the logger in your script
logger.info("Starting analysis...")
logger.warning("This is a warning")
logger.error("This is an error")
logger.debug("Debug information")
```

This ensures that your analysis scripts use the same logging format and style as your Snakemake workflow.