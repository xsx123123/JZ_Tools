#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import argparse
import sys
import os
from pathlib import Path
from loguru import logger
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn, FileSizeColumn, TotalFileSizeColumn
from rich.table import Table
from rich.panel import Panel

# 初始化 Rich Console
console = Console()

# 配置 Loguru logger
logger.remove()
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>")

def parse_arguments():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="🚀 GTF Gene Info Extractor: 自定义提取 GTF 属性",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    parser.add_argument(
        "-i", "--input", 
        required=True, 
        type=Path,
        help="输入的 GTF 文件路径"
    )
    
    parser.add_argument(
        "-o", "--output", 
        required=False, 
        type=Path,
        help="输出文件路径 (默认: [输入文件名].gene_info.tsv)"
    )
    
    parser.add_argument(
        "-a", "--attributes",
        default="gene_id,gene_name",
        help="指定要提取的属性列表，用逗号分隔 (默认: 'gene_id,gene_name')\n例如: -a gene_id,gene_name,gene_type,mgi_id"
    )

    parser.add_argument(
        "-c", "--columns",
        default=None,
        help="指定输出文件的列名，用逗号分隔 (默认: 与属性名一致)\n例如: -c ID,Symbol,Type,MGI_ID\n注意: 列数必须与 -a 指定的数量相同"
    )
    
    parser.add_argument(
        "--keep-version", 
        action="store_true", 
        help="保留 gene_id 的版本号 (默认: 去除，如 ENSMUSG...2 -> ENSMUSG...)"
    )

    return parser.parse_args()

def extract_genes(gtf_path: Path, output_path: Path, target_attrs: list, col_names: list, keep_version: bool):
    """核心处理逻辑"""
    
    # 动态生成正则：为每个需要提取的属性编译一个正则表达式
    # 匹配模式: key "value" (允许 key 和 value 之间有不定量的空格)
    patterns = {
        attr: re.compile(rf'{attr}\s+"([^"]+)"') 
        for attr in target_attrs
    }
    
    total_size = gtf_path.stat().st_size
    gene_count = 0
    skipped_count = 0
    
    logger.info(f"开始处理文件: {gtf_path}")
    logger.info(f"提取属性: {target_attrs}")
    logger.info(f"输出列名: {col_names}")
    
    # 修复了这里：移除了 binary_units 参数
    progress_columns = [
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(),
        FileSizeColumn(),  # 自动处理单位
        TextColumn("/"),
        TotalFileSizeColumn(),
        TextColumn("•"),
        TimeRemainingColumn()
    ]

    with Progress(*progress_columns, console=console) as progress:
        
        task = progress.add_task("🔍 解析 GTF...", total=total_size)
        
        with open(gtf_path, 'r', encoding='utf-8') as f_in, open(output_path, 'w', encoding='utf-8') as f_out:
            # 1. 写入自定义表头
            f_out.write("\t".join(col_names) + "\n")
            
            for line in f_in:
                # 更新进度条
                progress.advance(task, advance=len(line.encode('utf-8')))
                
                if line.startswith("#"):
                    continue
                
                parts = line.strip().split('\t')
                
                # 检查是否为 gene 行 (去重)
                if len(parts) < 9 or parts[2] != 'gene':
                    continue
                
                attributes = parts[8]
                row_values = []
                found_any = False
                
                # 2. 循环提取用户指定的每个属性
                for attr in target_attrs:
                    match = patterns[attr].search(attributes)
                    if match:
                        val = match.group(1)
                        found_any = True
                        
                        # 特殊处理: 如果是 gene_id 且不保留版本号
                        if attr == "gene_id" and not keep_version and '.' in val:
                            val = val.split('.')[0]
                        
                        row_values.append(val)
                    else:
                        row_values.append("NA") # 没找到则填 NA
                
                # 只有当至少提取到一个属性时才写入（防止空行）
                if found_any:
                    f_out.write("\t".join(row_values) + "\n")
                    gene_count += 1
                else:
                    skipped_count += 1

    return gene_count, skipped_count

def main():
    args = parse_arguments()
    
    # 处理属性列表
    target_attrs = [x.strip() for x in args.attributes.split(',') if x.strip()]
    
    # 处理列名列表
    if args.columns:
        col_names = [x.strip() for x in args.columns.split(',') if x.strip()]
        if len(col_names) != len(target_attrs):
            logger.error(f"参数错误: 指定的列名数量 ({len(col_names)}) 与 属性数量 ({len(target_attrs)}) 不一致！")
            sys.exit(1)
    else:
        col_names = target_attrs # 默认使用属性名作为列名
    
    # 检查输入
    if not args.input.exists():
        logger.error(f"找不到输入文件: {args.input}")
        sys.exit(1)
        
    # 确定输出路径
    out_path = args.output if args.output else args.input.with_name(args.input.stem + ".gene_info.tsv")
    
    try:
        count, skipped = extract_genes(args.input, out_path, target_attrs, col_names, args.keep_version)
        
        # 结果摘要
        table = Table(title="解析完成摘要", show_header=True, header_style="bold magenta")
        table.add_column("项目", style="dim")
        table.add_column("数值", justify="right")
        
        table.add_row("输入文件", str(args.input.name))
        table.add_row("输出文件", str(out_path.name))
        table.add_row("提取基因数", f"[green]{count:,}[/green]")
        table.add_row("提取字段", ", ".join(target_attrs))
        
        console.print("\n")
        console.print(Panel(table, expand=False))
        logger.success(f"处理完毕！")
        
    except Exception as e:
        logger.exception("处理过程中发生未知错误") # Loguru 会自动打印 Traceback
        sys.exit(1)

if __name__ == "__main__":
    main()