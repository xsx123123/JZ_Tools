# RNAFlow Data Delivery Configuration

This directory contains configuration files for the RNAFlow data delivery tool. Each configuration file defines what files and metrics to include when delivering results for specific analysis modules.

## Configuration Files

### qc_summary_config.yaml
Configuration for delivering quality control results, including:
- Raw and trimmed FASTQ files
- MultiQC reports
- Quality metrics and contamination checks

### mapping_config.yaml
Configuration for delivering mapping results, including:
- BAM files (sorted and indexed)
- Mapping statistics
- Qualimap reports
- Coverage files (bigWig format)

### count_config.yaml
Configuration for delivering gene expression count results, including:
- RSEM gene and isoform results
- TPM, FPKM, and raw count matrices
- Expression summary files

### variant_config.yaml
Configuration for delivering variant calling results, including:
- VCF files (raw and filtered)
- Variant statistics
- Quality control metrics

### deg_config.yaml
Configuration for delivering differential expression gene analysis results, including:
- Expression distribution plots
- Heatmaps
- DEG analysis results

### as_config.yaml
Configuration for delivering alternative splicing analysis results, including:
- rMATS output files
- Splicing event statistics
- Strandness QC

### fusion_config.yaml
Configuration for delivering gene fusion results, including:
- Arriba fusion detection output
- Fusion visualization files

### full_delivery_config.yaml
Configuration for delivering all analysis results in a comprehensive delivery.

## Usage

Each configuration file can be used with the RNAFlow delivery tool to package and deliver the specified files and metrics for each analysis module.