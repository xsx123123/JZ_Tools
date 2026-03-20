#!/usr/bin/env python3
import sys
import shutil
import itertools
import subprocess
import argparse
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

# Import logging and UI enhancement tools
from loguru import logger
from rich.console import Console
from rich.progress import (
    Progress, SpinnerColumn, TextColumn, BarColumn,
    TaskProgressColumn, TimeElapsedColumn, TimeRemainingColumn
)

console = Console()

class IDRBatchRunner:
    """Ultimate core class for encapsulating IDR batch execution, merging, and original peak extraction"""
    
    def __init__(self, args):
        self.inputs = [Path(f) for f in args.inputs]
        self.out_dir = Path(args.outdir)
        self.threads = args.threads
        
        # 1. Initialize workspace and configure logging
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self._setup_logger()
        
        # 2. Comprehensive check of runtime environment dependencies
        self._check_dependencies()

    def _setup_logger(self):
        """Configure and return the log file path"""
        logger.remove()
        logger.add(
            sys.stderr, 
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>", 
            level="INFO"
        )
        log_file = self.out_dir / "idr_pipeline.log"
        logger.add(
            log_file, 
            rotation="10 MB", 
            level="DEBUG", 
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}"
        )
        return log_file

    def _check_dependencies(self):
        """Check all required external software (idr, bedtools, awk, sort)"""
        missing_tools = []
        for tool in ["idr", "bedtools", "awk", "sort"]:
            if shutil.which(tool) is None:
                missing_tools.append(tool)
                
        if missing_tools:
            console.print(f"\n[bold red]❌ Fatal Error: Missing the following core tools in the current environment: {', '.join(missing_tools)}[/bold red]")
            console.print("[yellow]💡 Troubleshooting Suggestion: Please ensure the correct conda environment is activated or install the missing tools.[/yellow]\n")
            sys.exit(1)
        else:
            logger.info("✅ Dependency check passed: All required analysis suites are ready.")

    def _run_single_idr(self, pair):
        """Independent worker node: process a single pairwise comparison task"""
        file1, file2 = pair
        name1 = file1.name.replace("_peaks.narrowPeak", "").replace(".narrowPeak", "")
        name2 = file2.name.replace("_peaks.narrowPeak", "").replace(".narrowPeak", "")
        
        out_prefix = self.out_dir / f"{name1}_vs_{name2}"
        
        cmd = [
            "idr",
            "--samples", str(file1), str(file2),
            "--input-file-type", "narrowPeak",
            "--rank", "p.value",
            "--output-file", f"{out_prefix}.idr",
            "--plot",
            "--log-output-file", f"{out_prefix}.idr.log"
        ]
        
        logger.debug(f"Preparing to execute IDR: {' '.join(cmd)}")
        
        try:
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            logger.debug(f"[{name1} vs {name2}] Comparison successful.")
            return True, name1, name2
        except subprocess.CalledProcessError as e:
            logger.error(f"[{name1} vs {name2}] Comparison failed! STDERR:\n{e.stderr}")
            return False, name1, name2

    def _merge_consensus_peaks(self):
        """Merge all qualified IDR results into final high-confidence Consensus Peaks"""
        final_bed = self.out_dir / "Final_Consensus_Peaks.bed"
        logger.info("🧬 Stage 2: Starting to extract high-confidence peaks (IDR >= 1.30, p < 0.05) and merge coordinates...")

        # Construct bash pipe command to extract IDR >= 1.30 (p < 0.05) regions and merge
        cmd = 'cat ' + str(self.out_dir) + '/*.idr | awk \'$12 >= 1.30 {print $1"\\t"$2"\\t"$3}\' | sort -k1,1 -k2,2n | bedtools merge > ' + str(final_bed)
        
        try:
            subprocess.run(cmd, shell=True, check=True, executable='/bin/bash')
            
            # Count the number of generated peaks
            wc_result = subprocess.run(f"wc -l {final_bed}", shell=True, capture_output=True, text=True)
            peak_count = wc_result.stdout.strip().split()[0]
            logger.info(f"✅ Merging complete! Extracted {peak_count} high-confidence consensus peaks in total.")
            
            # Core linkage: After successful merging, immediately extract original detailed peak data for each sample
            self._extract_original_peaks(final_bed)
            
        except subprocess.CalledProcessError:
            logger.error("❌ Error occurred while merging peaks! Please check the IDR result file format.")
            console.print("[bold red]❌ Peak merging failed, pipeline aborted.[/bold red]")

    def _extract_original_peaks(self, final_bed):
        """Use the final BED file to retrieve peak rows from original samples, retaining statistical information"""
        logger.info("🎯 Stage 3: Starting to retrieve original high-quality narrow peak data for each sample using consensus peaks...")
        
        success_count = 0
        for input_file in self.inputs:
            stem_name = input_file.name.replace(".narrowPeak", "")
            out_file = self.out_dir / f"{stem_name}.idr.narrowPeak"
            
            # Use bedtools intersect to get intersecting original rows, -u prevents duplicate rows from spanning intervals
            cmd = f"bedtools intersect -a {input_file} -b {final_bed} -wa -u > {out_file}"
            logger.debug(f"Extraction command: {cmd}")
            
            try:
                subprocess.run(cmd, shell=True, check=True, executable='/bin/bash')
                success_count += 1
            except subprocess.CalledProcessError:
                logger.error(f"❌ Failed to extract original data for {input_file.name}!")

        if success_count == len(self.inputs):
            logger.info(f"✅ High-quality peaks for all {len(self.inputs)} samples have been successfully retrieved!")
            console.print(f"\n[bold green]🎉 Pipeline completed successfully! All results are safely stored in: {self.out_dir.absolute()}[/bold green]\n")
        else:
            logger.warning(f"⚠️ Extraction completed, but {len(self.inputs) - success_count} files failed to process.")

    def execute(self):
        """Execute main scheduling logic"""
        logger.info(f"🚀 Stage 1: Starting batch IDR tasks, {len(self.inputs)} samples received")
        
        pairs = list(itertools.combinations(self.inputs, 2))
        total_tasks = len(pairs)
        logger.info(f"📊 Total of {total_tasks} comparison tasks, starting {self.threads} concurrent processes...")

        success_count = 0

        # Render progress bar
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            TimeRemainingColumn(),
            console=console,
            transient=False
        ) as progress:
            
            task_id = progress.add_task("[cyan]IDR parallel computing...", total=total_tasks)
            
            with ProcessPoolExecutor(max_workers=self.threads) as executor:
                future_to_pair = {executor.submit(self._run_single_idr, pair): pair for pair in pairs}
                
                for future in as_completed(future_to_pair):
                    success, n1, n2 = future.result()
                    if success:
                        success_count += 1
                    progress.advance(task_id)

        # Determine if Stage 1 was completely successful to decide whether to proceed with subsequent steps
        if success_count == total_tasks:
            logger.info("✨ All concurrent comparisons completed successfully! Automatically entering subsequent merging and extraction stages...")
            self._merge_consensus_peaks()
        else:
            logger.warning(f"⚠️ Due to task failures ({success_count}/{total_tasks}), subsequent merging steps have been automatically blocked. Please check the logs for troubleshooting.")

def main():
    parser = argparse.ArgumentParser(description="🧬 End-to-end fully automated: Multi-process IDR analysis, merging, and data retrieval tool")
    parser.add_argument("-i", "--inputs", nargs='+', required=True, help="Input narrowPeak file list (at least 2)")
    parser.add_argument("-o", "--outdir", default="idr_results", help="Output directory (default: idr_results)")
    parser.add_argument("-t", "--threads", type=int, default=1, help="Number of concurrent processes (suggested: half of CPU cores)")
    
    args = parser.parse_args()

    if len(args.inputs) < 2:
        console.print("[bold red]❌ Error: At least 2 narrowPeak files are required![/bold red]")
        sys.exit(1)

    runner = IDRBatchRunner(args)
    runner.execute()

if __name__ == "__main__":
    main()
