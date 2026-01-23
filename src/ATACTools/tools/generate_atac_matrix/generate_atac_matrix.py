#!/usr/bin/env python3
import argparse
import subprocess
import os
import logging
import datetime
from pathlib import Path
from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

# 初始化 Rich Console
console = Console()

def setup_logging(log_file):
    """设置双路日志：文件记录详细信息，终端记录彩色简要信息"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[
            RichHandler(rich_tracebacks=True, console=console),
            logging.FileHandler(log_file)
        ]
    )
    return logging.getLogger("ATACFlow")

def main():
    parser = argparse.ArgumentParser(description="[Rich] Generate ATAC-seq Count Matrix")
    parser.add_argument("-b", "--bed", required=True, help="Consensus peak BED file")
    parser.add_argument("-i", "--inputs", nargs='+', required=True, help="Input BAM files")
    parser.add_argument("-s", "--samples", nargs='+', required=True, help="Sample IDs (must match BAM order)")
    parser.add_argument("-o", "--output", required=True, help="Output matrix file")
    parser.add_argument("-d", "--desc", required=True, help="Output description file")
    parser.add_argument("-l", "--log", default="multicov.log", help="Log file path")
    
    args = parser.parse_args()
    logger = setup_logging(args.log)

    # 0. 预检查
    if len(args.inputs) != len(args.samples):
        logger.error(f"[bold red]错误:[/bold red] BAM文件数量({len(args.inputs)})与样本ID数量({len(args.samples)})不匹配！")
        return

    console.print(Panel.fit(
        f"🚀 [bold cyan]ATAC-seq 计数矩阵生成器[/bold cyan]\n"
        f"样本数: {len(args.samples)} | Peaks: {args.bed}",
        border_style="bright_blue"
    ))

    try:
        tmp_out = Path(args.output).with_suffix(".tmp")
        
        # 1. 运行 bedtools multicov (带进度显示)
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            progress.add_task(description="正在通过 bedtools 计算 Coverage...", total=None)
            
            cmd = ["bedtools", "multicov", "-bams"] + args.inputs + ["-bed", args.bed]
            logger.info(f"执行命令: {' '.join(cmd)}")
            
            with open(tmp_out, 'w') as f_out, open(args.log, 'a') as f_log:
                subprocess.run(cmd, stdout=f_out, stderr=f_log, check=True)

        # 2. 准备数据并合并
        logger.info("正在合并表头与数据...")
        header = "chrom\tstart\tend\t" + "\t".join(args.samples) + "\n"
        
        with open(args.output, 'w') as f_final, open(tmp_out, 'r') as f_data:
            f_final.write(header)
            # 使用流式读取，防止超大文件撑爆内存
            for line in f_data:
                f_final.write(line)

        # 3. 生成描述文件 (Metadata)
        logger.info("生成描述信息...")
        peak_count = sum(1 for _ in open(args.bed))
        
        with open(args.desc, 'w') as f_desc:
            f_desc.write(f"File Name: {os.path.basename(args.output)}\n")
            f_desc.write(f"Generated Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f_desc.write("-" * 50 + "\n")
            f_desc.write(f"Summary Statistics:\n")
            f_desc.write(f"  - Total Samples: {len(args.samples)}\n")
            f_desc.write(f"  - Total Peaks: {peak_count}\n")
            f_desc.write("-" * 50 + "\n")
            f_desc.write("Sample Mapping:\n")
            for idx, (sid, bam) in enumerate(zip(args.samples, args.inputs)):
                f_desc.write(f"  [{idx+1}] {sid}  <--  {os.path.basename(bam)}\n")

        # 4. 清理并结束
        if tmp_out.exists():
            os.remove(tmp_out)
        
        console.print(f"\n✨ [bold green]完成![/bold green] 矩阵已保存至: [underline]{args.output}[/underline]")
        logger.info("流程运行结束。")

    except Exception as e:
        logger.exception(f"运行过程中发生崩溃: {e}")
        if 'tmp_out' in locals() and tmp_out.exists():
            os.remove(tmp_out)

if __name__ == "__main__":
    main()