# RNAFlow Logger Plugin Installation and Usage Guide

## Overview
This guide explains how to install and use the RNAFlow logger plugin that captures comprehensive runtime information with a clean, simple format.

## Important: Snakemake Version Compatibility Notice

⚠️ **CRITICAL**: The logger plugin functionality described below requires Snakemake version 8.0 or higher with plugin interface support. Your current Snakemake version appears to be older and does not support the `--logger-plugin` option.

For your current setup, RNAFlow uses the embedded logging system in `rules/00.log.smk` which provides the same clean, simple logging format.

## Installation (For Future Use)

### Method 1: Install as a Python Package (For Newer Snakemake Versions)
1. Navigate to the RNAFlow directory:
   ```bash
   cd /home/jzhang/pipeline/RNAFlow
   ```

2. Install the logger plugin in development mode:
   ```bash
   cd src/logger_plugin
   pip install -e .
   ```

### Method 2: Direct Installation
If you want to install the plugin directly without modifying the RNAFlow structure:
```bash
pip install snakemake-interface-logger-plugins loguru
cd /home/jzhang/pipeline/RNAFlow/src/logger_plugin
python -m pip install -e .
```

## Configuration and Usage (For Newer Snakemake Versions)

### Using the Plugin with Snakemake (Future Compatibility)

The plugin can be used in several ways once you upgrade to a compatible Snakemake version:

#### Option 1: Command Line
Run your Snakemake pipeline with the logger plugin:
```bash
snakemake --logger-plugin rnaflow --cores 8
```

#### Option 2: Configuration File
Add to your config file:
```yaml
logger_plugin: rnaflow
logger_plugin_settings:
  log_dir: "logs"
  log_file_prefix: "RNAFlow"
  max_file_size: "500 MB"
  capture_runtime_info: true
```

#### Option 3: In Snakefile (Advanced)
If you want to programmatically configure the logger, you can modify your Snakefile to use the plugin directly.

## Current Usage (With Your Existing Setup)

For your current Snakemake version, the logging is handled automatically by the `rules/00.log.smk` script that's included in your snakefile. All runtime information is captured in clean, readable format in the `logs/` directory.

Simply run your pipeline as usual:
```bash
snakemake --cores=50 -p --conda-frontend mamba --use-conda --rerun-triggers mtime --dry-run
```

## Plugin Settings (For Future Use)

The RNAFlow logger plugin supports the following settings:

- `log_dir`: Directory to store log files (default: "logs")
- `log_file_prefix`: Prefix for log file names (default: "RNAFlow")
- `max_file_size`: Maximum size before log rotation (default: "500 MB")
- `capture_runtime_info`: Whether to capture runtime information (default: true)

## Log File Location

Log files will be created in the specified log directory with names following the pattern:
```
{log_file_prefix}_{project_name}_runtime_{timestamp}.log
```

For example: `RNAFlow_HYXM-251215018_runtime_2026-01-08_14-35-48.log`

## Features

- Clean, simple log format for better readability
- Comprehensive runtime information capture
- Automatic log rotation
- Detailed pipeline configuration logging
- Timestamped entries for tracking execution

## Upgrading Snakemake for Plugin Support

To use the logger plugin with the `--logger-plugin` option, you'll need to upgrade to a newer version of Snakemake (8.0+) that supports the plugin interface:

### Option 1: Upgrade via Conda/Mamba (Recommended)
```bash
# Update to the latest Snakemake
mamba install -c conda-forge snakemake>=8.0

# Or using conda
conda install -c conda-forge snakemake>=8.0
```

### Option 2: Upgrade via Pip
```bash
pip install snakemake>=8.0
```

### Verify Plugin Support
After upgrading, verify that plugin support is available:
```bash
snakemake --help | grep logger-plugin
```

If you see the `--logger-plugin` option in the help output, your Snakemake version supports plugins.

### Check Available Plugins
```bash
# List available logger plugins
python -c "import snakemake.plugins; print(snakemake.plugins.list_plugins('logger'))"
```

## Registering and Using the Plugin

Once you have a compatible Snakemake version, the plugin will be automatically detected after installation. Here's how to register and use it:

### Plugin Registration
The plugin is automatically registered when you install it using:
```bash
cd /home/jzhang/pipeline/RNAFlow/src/logger_plugin
pip install -e .
```

The plugin registers itself via the entry point defined in `setup.py`:
```python
entry_points={
    "snakemake_logger_plugins": [
        "rnaflow = logger_plugin:LogHandler",
    ],
},
```

### Verification
After installation, verify the plugin is registered:
```bash
python -c "from snakemake_interface_logger_plugins.registry import LoggerPluginRegistry; registry = LoggerPluginRegistry(); print(registry.get_registered_plugins())"
```

### Usage Examples
Once registered, use the plugin with any of these approaches:

#### Command Line
```bash
snakemake --logger-plugin rnaflow --cores 8
```

#### With Custom Settings
```bash
snakemake --logger-plugin rnaflow \
         --logger-plugin-settings '{"log_dir": "logs", "log_file_prefix": "RNAFlow", "capture_runtime_info": true}' \
         --cores 8
```

#### In Configuration File
```yaml
logger_plugin: rnaflow
logger_plugin_settings:
  log_dir: "logs"
  log_file_prefix: "RNAFlow"
  max_file_size: "500 MB"
  capture_runtime_info: true
```

## Backward Compatibility

The current RNAFlow pipeline is designed to work with both older and newer versions of Snakemake:

### For Current Setup (Older Snakemake)
- The `rules/00.log.smk` script provides the same clean logging functionality
- No plugin system required
- Simply run: `snakemake --cores 50 -p --conda-frontend mamba --use-conda --rerun-triggers mtime --dry-run`
- All runtime information is captured in the same clean format

### For Future Setup (Newer Snakemake with Plugins)
- The plugin provides identical functionality with additional configuration options
- Same clean log format maintained
- Enhanced flexibility with plugin settings

### Migration Path
When upgrading to a newer Snakemake version:
1. Upgrade Snakemake as described above
2. Install the logger plugin: `pip install -e src/logger_plugin/`
3. Optionally update your workflow to use the `--logger-plugin rnaflow` option
4. Your existing log format and behavior will remain consistent

## Troubleshooting

If the plugin is not recognized in newer versions:
1. Verify installation: `pip list | grep rnaflow`
2. Check that snakemake-interface-logger-plugins is installed
3. Ensure the package was installed in the same environment as Snakemake