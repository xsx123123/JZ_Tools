#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import pandas as pd
import sys
from loguru import logger
from rich.console import Console
from rich.table import Table

# 初始化 rich 控制台
console = Console()

# 配置 loguru 日志格式，移除默认设置，添加更简洁的格式
logger.remove()
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>")

def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="🌟 Peak 注释与 Count 矩阵合并工具",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument("-a", "--anno", required=True, help="HOMER 注释结果文件路径 (如: SRR6412482_peaks.narrowPeak)")
    parser.add_argument("-c", "--counts", required=True, help="Peak 计数矩阵文件路径 (如: consensus_counts_matrix.txt)")
    parser.add_argument("-o", "--output", default="merged_annotated_counts.txt", help="合并后的输出文件路径")
    return parser.parse_args()

def display_summary(anno_rows, count_rows, merged_rows, output_file):
    """使用 rich 打印精美的总结表格"""
    table = Table(title="✨ 合并结果概览 ✨", style="bold cyan")

    table.add_column("指标", style="magenta")
    table.add_column("数值 / 路径", style="green")

    table.add_row("输入的注释 Peak 数", str(anno_rows))
    table.add_row("输入的计数 Peak 数", str(count_rows))
    table.add_row("成功合并的 Peak 数", f"[bold yellow]{merged_rows}[/bold yellow]")
    table.add_row("输出文件位置", output_file)

    console.print(table)

def main():
    args = parse_args()
    
    logger.info("启动合并流程...")

    # 1. 读取数据 (使用 rich 的状态加载动画)
    with console.status("[bold green]正在将数据加载到内存中 (这可能需要几秒钟)...[/bold green]"):
        try:
            df_anno = pd.read_csv(args.anno, sep='\t')
            # featureCounts output has a comment line at the top starting with #
            df_counts = pd.read_csv(args.counts, sep='\t', comment='#')
            logger.success(f"成功读取文件: 注释表 ({len(df_anno)}行), 计数表 ({len(df_counts)}行)")
        except FileNotFoundError as e:
            logger.error(f"找不到文件: {e.filename}")
            sys.exit(1)

    # 2. 数据清洗与重命名
    with console.status("[bold yellow]正在标准化列名...[/bold yellow]"):
        first_col_name = df_anno.columns[0]
        df_anno.rename(columns={first_col_name: 'PeakID', 'Gene Name': 'gene_id'}, inplace=True)
        logger.info(f"已将 '{first_col_name}' 重命名为 'PeakID'")
        logger.info("已将 'Gene Name' 重命名为 'gene_id'")

    # 3. 合并数据
    with console.status("[bold blue]正在根据基因组坐标合并数据...[/bold blue]"):
        # featureCounts usually uses 'Chr', 'Start', 'End' (matching HOMER)
        # We merge on these coordinates. 
        # Note: pd.merge will add suffixes if column names are identical.
        df_merged = pd.merge(
            df_anno,
            df_counts,
            on=['Chr', 'Start', 'End'],
            how='inner'
        )

        # 检查是否因为坐标系(0-based vs 1-based)差异导致合并失败
        if df_merged.empty:
            logger.warning("合并结果为空！这通常是因为起始坐标相差 1bp。")
            logger.info("正在尝试自动修正坐标 (Start + 1) 并重新合并...")
            # Create a copy to avoid SettingWithCopyWarning if needed, 
            # but here we just modify and retry merge
            df_counts_retry = df_counts.copy()
            df_counts_retry['Start'] = df_counts_retry['Start'] + 1
            df_merged = pd.merge(
                df_anno,
                df_counts_retry,
                on=['Chr', 'Start', 'End'],
                how='inner'
            )

    # 4. 保存结果
    with console.status("[bold magenta]正在保存合并后的文件...[/bold magenta]"):
        df_merged.to_csv(args.output, sep='\t', index=False)
        logger.success("文件保存成功！")

    # 5. 打印总结表格
    console.print("\n")
    display_summary(len(df_anno), len(df_counts), len(df_merged), args.output)

if __name__ == "__main__":
    main()