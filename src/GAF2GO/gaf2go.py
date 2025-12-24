#!/usr/bin/env python3
"""
Convert GAF (Gene Association File) to a simplified GO annotation format.
"""

import sys
import argparse
from pathlib import Path
from loguru import logger


def setup_logger(log_file=None, verbose=False):
    """
    Configure loguru logger with custom format and levels.
    
    Args:
        log_file: Path to log file (optional)
        verbose: Enable debug level logging
    """
    # Remove default handler
    logger.remove()
    
    # Set log level based on verbose flag
    log_level = "DEBUG" if verbose else "INFO"
    
    # Add stderr handler with custom format
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
        level=log_level,
        colorize=True
    )
    
    # Add file handler if specified
    if log_file:
        logger.add(
            log_file,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}",
            level="DEBUG",
            rotation="10 MB",
            retention="7 days",
            compression="zip"
        )
        logger.info(f"Logging to file: {log_file}")


def parse_gaf_to_simplified(input_file, output_file):
    """
    Parse GAF file and convert to simplified format with columns:
    GeneID, GO_Type, GO_ID, GO_Description
    
    GAF columns used:
    - Column 2: DB Object ID (GeneID)
    - Column 5: GO ID
    - Column 9: Aspect (F=molecular_function, P=biological_process, C=cellular_component)
    - Column 10: Gene Name (GO Description)
    
    Args:
        input_file: Path to input GAF file
        output_file: Path to output file
    """
    
    logger.info(f"Starting GAF file conversion")
    logger.debug(f"Input file: {input_file}")
    logger.debug(f"Output file: {output_file}")
    
    # Mapping for GO aspects
    aspect_map = {
        'F': 'molecular_function',
        'P': 'biological_process',
        'C': 'cellular_component'
    }
    
    results = []
    skipped_lines = 0
    comment_lines = 0
    
    try:
        with open(input_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                # Skip comment lines
                if line.startswith('!'):
                    comment_lines += 1
                    logger.debug(f"Line {line_num}: Skipping comment line")
                    continue
                
                # Skip empty lines
                if not line.strip():
                    logger.debug(f"Line {line_num}: Skipping empty line")
                    continue
                
                # Split by tab
                fields = line.strip().split('\t')
                
                # Check if we have enough columns (GAF 2.2 has 17 columns)
                if len(fields) < 10:
                    skipped_lines += 1
                    logger.warning(f"Line {line_num}: Insufficient columns ({len(fields)}), skipping")
                    continue
                
                gene_id = fields[1]        # Column 2: DB Object ID
                go_id = fields[4]          # Column 5: GO ID
                aspect = fields[8]         # Column 9: Aspect
                description = fields[9]    # Column 10: Gene Name/Description
                
                # Map aspect code to full name
                go_type = aspect_map.get(aspect, aspect)
                
                if aspect not in aspect_map:
                    logger.warning(f"Line {line_num}: Unknown aspect code '{aspect}' for {gene_id}")
                
                # Store result
                results.append([gene_id, go_type, go_id, description])
                logger.debug(f"Line {line_num}: Processed {gene_id} -> {go_id} ({go_type})")
        
        logger.success(f"Parsed {len(results)} annotations from {input_file}")
        logger.info(f"Skipped {comment_lines} comment lines and {skipped_lines} invalid lines")
        
    except FileNotFoundError:
        logger.error(f"Input file not found: {input_file}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error reading input file: {e}")
        sys.exit(1)
    
    # Write output
    try:
        with open(output_file, 'w') as out:
            # Write header
            out.write('GeneID\tGO_Type\tGO_ID\tGO_Description\n')
            
            # Write data rows
            for row in results:
                out.write('\t'.join(row) + '\n')
        
        logger.success(f"Output written to: {output_file}")
        
    except Exception as e:
        logger.error(f"Error writing output file: {e}")
        sys.exit(1)
    
    return len(results)


def validate_args(args):
    """
    Validate command-line arguments.
    
    Args:
        args: Parsed arguments from argparse
    """
    input_path = Path(args.input)
    
    # Check if input file exists
    if not input_path.exists():
        logger.error(f"Input file does not exist: {args.input}")
        sys.exit(1)
    
    if not input_path.is_file():
        logger.error(f"Input path is not a file: {args.input}")
        sys.exit(1)
    
    # Check output directory exists
    output_path = Path(args.output)
    if not output_path.parent.exists():
        logger.warning(f"Output directory does not exist, creating: {output_path.parent}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
    
    logger.debug("Argument validation passed")


def main():
    """Main function to handle argument parsing and execution."""
    
    # Create argument parser
    parser = argparse.ArgumentParser(
        description="Convert GAF (Gene Association File) to simplified GO annotation format.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s input.gaf output.txt
  %(prog)s input.gaf output.txt -v
  %(prog)s input.gaf output.txt --log convert.log
  
Output format:
  GeneID    GO_Type              GO_ID       GO_Description
  gene1     biological_process   GO:0008150  metabolic process
  gene2     molecular_function   GO:0003674  catalytic activity
        """
    )
    
    # Positional arguments
    parser.add_argument(
        'input',
        type=str,
        help='Input GAF file path'
    )
    
    parser.add_argument(
        'output',
        type=str,
        help='Output file path for simplified format'
    )
    
    # Optional arguments
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose (DEBUG level) logging'
    )
    
    parser.add_argument(
        '-l', '--log',
        type=str,
        metavar='FILE',
        help='Log file path (optional, logs to stderr by default)'
    )
    
    parser.add_argument(
        '--version',
        action='version',
        version='%(prog)s 1.0.0'
    )
    
    # Parse arguments
    args = parser.parse_args()
    
    # Setup logger
    setup_logger(log_file=args.log, verbose=args.verbose)
    
    logger.info("=== GAF to Simplified Format Converter ===")
    logger.info(f"Version: 1.0.0")
    
    # Validate arguments
    validate_args(args)
    
    # Run conversion
    try:
        num_annotations = parse_gaf_to_simplified(args.input, args.output)
        logger.success(f"Conversion complete! Processed {num_annotations} annotations.")
    except Exception as e:
        logger.critical(f"Conversion failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
