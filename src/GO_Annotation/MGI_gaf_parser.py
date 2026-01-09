#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import argparse
import pandas as pd
from pathlib import Path
from loguru import logger
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn

# 初始化 Rich Console
console = Console()

# 配置 Loguru
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
    level="INFO"
)

def get_args():
    parser = argparse.ArgumentParser(
        description="🚀 GAF 解析器 v3 - 外挂 Mapping 文件版",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("-i", "--input", type=str, required=True, help="输入的 GAF 文件路径")
    parser.add_argument("-m", "--mapping", type=str, required=True, help="MGI-to-Ensembl 映射文件 (包含 MGI ID 和 ENSMUSG ID)")
    parser.add_argument("-o", "--output", type=str, default="ensembl_go_annotation.tsv", help="输出路径")
    return parser.parse_args()

def load_external_mapping(map_path):
    """
    加载外部映射文件
    假设格式为 TSV，第0列是 MGI ID，第5列是 Ensembl Gene ID
    """
    mapping = {}
    file_path = Path(map_path)
    
    if not file_path.exists():
        logger.error(f"映射文件不存在: {file_path}")
        sys.exit(1)

    logger.info("正在加载外部 ID 映射表...")
    
    count = 0
    with open(file_path, 'r') as f:
        for line in f:
            if not line.strip(): continue
            parts = line.split('\t')
            
            # 你的数据格式中：
            # Col 0: MGI:1915733
            # Col 5: ENSMUSG00000102531
            if len(parts) > 5:
                mgi_id = parts[0].strip()
                ens_id = parts[5].strip()
                
                # 只有当 Ensembl ID 存在且不为空时才记录
                if mgi_id and ens_id:
                    mapping[mgi_id] = ens_id
                    count += 1
    
    logger.success(f"外部映射表加载完毕，共 {count} 个 MGI->Ensembl 对应关系")
    return mapping

def extract_ensembl_from_gaf(with_from_str):
    """GAF 第8列兜底策略"""
    if not with_from_str: return None
    ids = with_from_str.split('|')
    for raw_id in ids:
        if raw_id.lower().startswith("ensembl:"):
            return raw_id.split(":")[-1] # 只返回 ID 部分，不带前缀
    return None

def parse_gaf(gaf_path, id_map):
    file_path = Path(gaf_path)
    
    # 统计计数器
    stats = {
        "total": 0,
        "mapped_by_file": 0,  # 通过外部文件匹配成功
        "mapped_by_gaf": 0,   # 通过 GAF 第8列兜底成功
        "unmapped": 0         # 彻底没找到
    }
    
    final_data = []
    
    try:
        total_lines = sum(1 for _ in open(file_path, 'r'))
    except Exception:
        total_lines = 0

    logger.info("开始解析 GAF 并进行 ID 转换...")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TimeElapsedColumn(),
        console=console
    ) as progress:
        
        task = progress.add_task("[cyan]Processing...", total=total_lines)
        
        with open(file_path, 'r') as f:
            for line in f:
                progress.advance(task)
                if line.startswith('!'): continue
                
                parts = line.strip().split('\t')
                if len(parts) < 8: continue
                
                stats["total"] += 1
                
                # GAF Columns
                db = parts[0]
                obj_id = parts[1] # 这里的 ID 可能是纯数字也可能是 MGI:xxxxx
                go_id = parts[4]
                with_from_col = parts[7]
                
                # 1. 构造标准 Key (你的映射文件里是 MGI:xxxxx 格式)
                # 如果 GAF 里只有数字 (101757)，需要补全 MGI:101757
                if ":" in obj_id:
                    query_key = obj_id
                else:
                    query_key = f"{db}:{obj_id}"
                
                final_gene_id = None
                source_method = "Unmapped"

                # 策略 A: 查外部映射表 (优先)
                if query_key in id_map:
                    final_gene_id = id_map[query_key]
                    stats["mapped_by_file"] += 1
                    source_method = "External Map"
                
                # 策略 B: 查 GAF 第8列 (兜底)
                if not final_gene_id:
                    ens_in_gaf = extract_ensembl_from_gaf(with_from_col)
                    if ens_in_gaf:
                        final_gene_id = ens_in_gaf
                        stats["mapped_by_gaf"] += 1
                        source_method = "GAF Col8"
                
                # 如果都找不到，保留原 ID
                if not final_gene_id:
                    final_gene_id = query_key
                    stats["unmapped"] += 1
                
                final_data.append({
                    "Gene_ID": final_gene_id,
                    "GO_ID": go_id,
                    "Source": source_method # 方便你调试看 ID 是哪来的
                })

    # 转 DataFrame
    df = pd.DataFrame(final_data)
    # 去重 (Gene + GO)
    df_unique = df[["Gene_ID", "GO_ID"]].drop_duplicates()
    
    return df_unique, stats

def display_summary(df, output_file, stats):
    # 1. 打印转换统计
    stats_table = Table(title="📈 ID 转换统计", show_header=True, header_style="bold yellow")
    stats_table.add_column("Category", style="white")
    stats_table.add_column("Count", style="bold cyan")
    
    stats_table.add_row("Total GO Terms", str(stats["total"]))
    stats_table.add_row("Mapped via External File (High Quality)", f"[green]{stats['mapped_by_file']}[/green]")
    stats_table.add_row("Mapped via GAF Col 8 (Fallback)", f"[yellow]{stats['mapped_by_gaf']}[/yellow]")
    stats_table.add_row("Unmapped (Kept Original)", f"[red]{stats['unmapped']}[/red]")
    
    console.print(stats_table)
    
    # 2. 打印数据预览
    table = Table(title="📊 最终数据预览 (Top 5)", show_header=True, header_style="bold magenta")
    table.add_column("Gene ID (Ensembl)", style="green")
    table.add_column("GO ID", style="cyan")
    
    for _, row in df.head(5).iterrows():
        table.add_row(str(row["Gene_ID"]), str(row["GO_ID"]))
    
    console.print(table)
    logger.info(f"结果已保存: {output_file}")

if __name__ == "__main__":
    args = get_args()
    
    # 1. 加载映射表
    mapping_dict = load_external_mapping(args.mapping)
    
    # 2. 解析并转换
    df_result, statistics = parse_gaf(args.input, mapping_dict)
    
    # 3. 保存
    df_result.to_csv(args.output, sep="\t", index=False)
    
    # 4. 展示
    display_summary(df_result, args.output, statistics) 