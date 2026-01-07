# RNAFlow CLI - Merge Command

The `merge` command allows you to combine multiple configuration files into a single JSON or TSV file for easy analysis and management.

## Usage

```bash
rnaflow-cli merge [OPTIONS]
```

## Options

- `-p, --config-pattern`: Glob pattern for config files to merge (default: `config/*_config.yaml`)
- `-o, --output-dir`: Output directory for merged results (default: `merged_output`)
- `-f, --format`: Output format (json or tsv) (default: `tsv`)
- `--prefix`: Output filename prefix (default: `merged_config`)

## Examples

### Merge all config files to TSV format:
```bash
rnaflow-cli merge -p "config/*_config.yaml" -o my_output -f tsv --prefix my_merged
```

### Merge all config files to JSON format:
```bash
rnaflow-cli merge -p "config/*_config.yaml" -o my_output -f json --prefix my_merged
```

### Merge only specific config files:
```bash
rnaflow-cli merge -p "config/mapping_config.yaml" -o mapping_output -f json
```

## Output Files

The merge command generates three output files:

1. **Main output file**: Contains merged configuration data in the specified format (TSV or JSON)
2. **Summary file**: A CSV file with summary statistics grouped by module
3. **Console output**: Rich formatted tables showing merged configuration summary

## Supported Config Files

The merge command supports all RNAFlow configuration files including:
- `qc_summary_config.yaml` - Quality control configurations
- `mapping_config.yaml` - Mapping analysis configurations  
- `count_config.yaml` - Gene expression count configurations
- `variant_config.yaml` - Variant calling configurations
- `deg_config.yaml` - Differential expression gene configurations
- `as_config.yaml` - Alternative splicing configurations
- `fusion_config.yaml` - Gene fusion detection configurations
- `full_delivery_config.yaml` - Complete pipeline configurations
- Any other configuration files following the same structure

## Data Structure

The merged output includes the following columns/fields:
- `module`: The analysis module name
- `sample_name`: Extracted sample name from file patterns
- `file_pattern`: The file pattern from the config
- `delivery_mode`: How files should be delivered (copy, symlink, etc.)
- `output_dir`: Output directory specified in config
- `include_qc_summary`: Whether QC summary is included
- `summary_columns`: List of summary columns defined in config
- `config_file`: Source configuration file
- `metric_*`: All metrics defined in the configuration