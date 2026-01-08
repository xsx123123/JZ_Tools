# RNAFlow Logger Plugin - Example Usage

## Complete Example: Running RNAFlow with the New Logger

### Step 1: Install the Plugin
```bash
# Navigate to the RNAFlow directory
cd /home/jzhang/pipeline/RNAFlow

# Install the logger plugin
cd src/logger_plugin
pip install -e .
```

### Step 2: Run Snakemake with the Plugin

#### Option A: Using Command Line
```bash
# Run with default plugin settings
snakemake --logger-plugin rnaflow --dry-run --cores 1

# Run with custom plugin settings
snakemake --logger-plugin rnaflow \
         --logger-plugin-settings '{"log_dir": "logs", "log_file_prefix": "RNAFlow", "capture_runtime_info": true}' \
         --cores 8
```

#### Option B: Using Configuration File
Create a config file (e.g., `config_with_logger.yaml`) with logger settings:

```yaml
# See config_with_logger.yaml for a complete example
logger_plugin: rnaflow
logger_plugin_settings:
  log_dir: "logs"
  log_file_prefix: "RNAFlow"
  max_file_size: "500 MB"
  capture_runtime_info: true

# Your other RNAFlow settings...
project_name: 'HYXM-251215018'
# ... rest of your config
```

Then run:
```bash
snakemake --configfile config_with_logger.yaml --dry-run --cores 1
```

### Step 3: Expected Output
When running with the plugin, you should see:
1. A log file created in the `logs/` directory
2. Clean, readable log entries with timestamps
3. Runtime information captured at the start of the pipeline

Example log file content:
```
2026-01-08 14:35:48 | INFO     | RNAFlow Pipeline Started
2026-01-08 14:35:48 | INFO     | Start Time: 2026-01-08 14:35:48
2026-01-08 14:35:48 | INFO     | System: Linux 5.4.0-216-generic
2026-01-08 14:35:48 | INFO     | Python Version: 3.13.5
2026-01-08 14:35:48 | INFO     | Snakemake Version: unknown
2026-01-08 14:35:48 | INFO     | Log File: logs/RNAFlow_TEST_PROJECT_runtime_2026-01-08_14-35-48.log
2026-01-08 14:35:48 | INFO     | Working Directory: /home/jzhang/pipeline/RNAFlow
2026-01-08 14:35:48 | INFO     | Pipeline Configuration:
2026-01-08 14:35:48 | INFO     |   Project: TEST_PROJECT
2026-01-08 14:35:48 | INFO     |   Workflow Dir: /test/workflow/path
2026-01-08 14:35:48 | INFO     |   Sample CSV: samples.csv
2026-01-08 14:35:48 | INFO     |   Reference: GRCh38
2026-01-08 14:35:48 | INFO     | ------------------------------------------------------------
2026-01-08 14:35:48 | INFO     | Runtime information captured.
2026-01-08 14:35:48 | INFO     | ------------------------------------------------------------
```

### Step 4: Integration with Existing Pipeline
The plugin can be integrated with your existing RNAFlow pipeline by either:
1. Updating the snakefile to use the plugin (see next section)
2. Using command-line options when running snakemake
3. Adding logger configuration to your existing config files

## Migration from Old Logging System

If you were previously using the `rules/00.log.smk` script, you can:
1. Remove or comment out the `include: 'rules/00.log.smk'` line in your snakefile
2. Use the plugin instead for better logging capabilities
3. The plugin provides enhanced functionality with cleaner output