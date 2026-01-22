#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
GTF to TSS BED Converter
描述: 从 GENCODE GTF 文件中提取转录起始位点 (TSS) 并生成 BED 文件。
作者: Hajimi (Based on user request)
依赖: rich (pip install rich)
"""

import argparse
import gzip
import os
import sys
import time
import logging
from rich.logging import RichHandler
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn

# === 初始化 Rich 和 Logging ===
console = Console()
logging.basicConfig(
    level="INFO",
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(console=console, rich_tracebacks=True, show_path=False)]
)
log = logging.getLogger("rich")

def get_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="🚀 从 GTF 文件提取 TSS (Transcription Start Sites) 生成 BED 文件",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("-i", "--input", required=True, help="输入的 GTF 文件路径 (支持 .gtf 或 .gtf.gz)")
    parser.add_argument("-o", "--output", required=True, help="输出的 BED 文件路径 (自动 gzip 压缩)")
    parser.add_argument("--feature", default="transcript", help="要提取的特征类型 (默认: transcript)")
    return parser.parse_args()

def parse_attributes(attr_str):
    """
    解析 GTF 属性列 (column 9)
    格式示例: gene_id "ENSG..."; transcript_id "ENST...";
    返回字典: {'gene_id': 'ENSG...', 'transcript_id': 'ENST...'}
    """
    attributes = {}
    if not attr_str:
        return attributes
    
    # 按分号分割
    parts = attr_str.strip().split(';')
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # 分割键值对 (假设用空格分隔)
        if ' ' in part:
            key, value = part.split(' ', 1)
            value = value.replace('"', '').strip() # 去掉引号
            attributes[key] = value
    return attributes

def main():
    args = get_args()
    
    # 检查输入文件是否存在
    if not os.path.exists(args.input):
        log.critical(f"❌ 输入文件不存在: [bold red]{args.input}[/]")
        sys.exit(1)

    start_time = time.time()
    
    # 自动处理 .gz 后缀
    output_file = args.output
    if not output_file.endswith(".gz"):
        output_file += ".gz"

    log.info(f"📂 输入文件: [bold cyan]{args.input}[/]")
    log.info(f"💾 输出文件: [bold green]{output_file}[/]")
    log.info(f"🎯 提取特征: [yellow]{args.feature}[/]")

    # 计数器
    stats = {
        "processed_lines": 0,
        "tss_extracted": 0,
        "skipped_comments": 0,
        "skipped_features": 0
    }

    # 打开文件的方式 (根据后缀)
    open_input = gzip.open if args.input.endswith(".gz") else open
    mode_input = "rt" if args.input.endswith(".gz") else "r"

    try:
        # 使用 Rich 进度条
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("{task.completed} lines"),
            TimeRemainingColumn(),
            console=console
        ) as progress:
            
            # 创建任务 (由于文件行数未知，不设置 total，显示为滚动条)
            task = progress.add_task(f"[cyan]正在读取 {os.path.basename(args.input)}...", total=None)

            with open_input(args.input, mode_input) as f_in, gzip.open(output_file, "wt") as f_out:
                for line in f_in:
                    stats["processed_lines"] += 1
                    
                    # 更新进度条 (每 10000 行更新一次以提高性能)
                    if stats["processed_lines"] % 10000 == 0:
                        progress.update(task, advance=10000)

                    if line.startswith("#"):
                        stats["skipped_comments"] += 1
                        continue

                    parts = line.strip().split("\t")
                    if len(parts) < 9:
                        continue

                    # 提取列信息
                    chrom = parts[0]
                    feature_type = parts[2]
                    start = int(parts[3])
                    end = int(parts[4])
                    strand = parts[6]
                    attr_str = parts[8]

                    # 过滤特征 (通常是 'transcript')
                    if feature_type != args.feature:
                        stats["skipped_features"] += 1
                        continue

                    # 计算 TSS
                    # BED 是 0-based，半开区间 [start, end)
                    # 正链 (+): TSS 在 start。BED: start-1, start
                    # 负链 (-): TSS 在 end。  BED: end-1, end
                    if strand == "+":
                        tss_start = start - 1
                        tss_end = start
                    elif strand == "-":
                        tss_start = end - 1
                        tss_end = end
                    else:
                        continue # 忽略未知链

                    # 解析属性以获取 ID (用于 BED 的 name 列)
                    attrs = parse_attributes(attr_str)
                    # 优先使用 transcript_id, 其次 gene_name, 最后 gene_id
                    name = attrs.get("transcript_id", attrs.get("gene_name", attrs.get("gene_id", "TSS")))

                    # 写入 BED6 格式: chrom, start, end, name, score, strand
                    f_out.write(f"{chrom}\t{tss_start}\t{tss_end}\t{name}\t.\t{strand}\n")
                    stats["tss_extracted"] += 1

            # 完成任务
            progress.update(task, completed=stats["processed_lines"])

    except Exception as e:
        log.exception(f"❌ 发生错误: {e}")
        sys.exit(1)

    end_time = time.time()
    duration = end_time - start_time

    # === 输出最终统计报告 ===
    console.print()
    console.rule("[bold green]处理完成[/]")
    console.print(f"✅ 成功生成文件: [bold underline]{output_file}[/]")
    console.print(f"⏱️  耗时: [bold yellow]{duration:.2f} 秒[/]")
    
    # 表格化统计信息
    from rich.table import Table
    table = Table(title="统计摘要", show_header=True, header_style="bold magenta")
    table.add_column("项目", style="dim")
    table.add_column("数量", justify="right")
    
    table.add_row("总处理行数", f"{stats['processed_lines']:,}")
    table.add_row("提取 TSS 数量", f"[green]{stats['tss_extracted']:,}[/]")
    table.add_row("跳过注释行", f"{stats['skipped_comments']:,}")
    table.add_row("跳过非目标特征", f"{stats['skipped_features']:,}")
    
    console.print(table)

if __name__ == "__main__":
    main()