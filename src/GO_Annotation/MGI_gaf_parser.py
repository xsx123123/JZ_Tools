#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import argparse
import pandas as pd
from pathlib import Path
from loguru import logger
from rich.console import Console
from rich.table import Table

# 初始化 Rich Console
console = Console()

# 配置 Loguru
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
    level="INFO"
)

# 标准 GAF 2.1/2.2 列名定义
GAF_COLUMNS = [
    "DB",                   # 0
    "DB_Object_ID",         # 1
    "DB_Object_Symbol",     # 2 (通常是 Gene Symbol)
    "Qualifier",            # 3
    "GO_ID",                # 4
    "DB_Reference",         # 5
    "Evidence_Code",        # 6
    "With_From",            # 7
    "Aspect",               # 8
    "DB_Object_Name",       # 9
    "DB_Object_Synonym",    # 10
    "DB_Object_Type",       # 11
    "Taxon",                # 12
    "Date",                 # 13
    "Assigned_By",          # 14
    "Annotation_Extension", # 15
    "Gene_Product_Form_ID"  # 16
]

def get_args():
    parser = argparse.ArgumentParser(
        description="🚀 通用 GAF/TSV 解析工具 (自动识别 GAF 格式)",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("-i", "--input", type=str, required=True, help="输入文件路径 (.gaf 或 .tsv)")
    parser.add_argument("-o", "--output", type=str, default="clean_gene_go.tsv", help="输出路径")
    
    # 修改帮助文档，提示用户 GAF 文件的标准列名
    parser.add_argument("--gene-col", type=str, default="DB_Object_Symbol", 
                        help="基因列名或索引。\n对于标准 GAF 文件，推荐使用 'DB_Object_Symbol'(第3列) 或 'DB_Object_ID'(第2列)。\n默认: DB_Object_Symbol")
    parser.add_argument("--go-col", type=str, default="GO_ID", 
                        help="GO列名或索引。对于 GAF 文件默认是 'GO_ID'。")
    
    return parser.parse_args()

def clean_gene_id(gene_str):
    """清洗 Gene ID: 移除 .1 后缀"""
    if pd.isna(gene_str):
        return ""
    return str(gene_str).split('.')[0]

def get_column_data(df, col_identifier, col_type_name):
    """根据列名或索引获取数据"""
    # 1. 尝试作为列名
    if col_identifier in df.columns:
        logger.info(f"提取 '{col_type_name}' -> 使用列名: [cyan]{col_identifier}[/]")
        return df[col_identifier]
    
    # 2. 尝试作为索引
    if str(col_identifier).isdigit():
        idx = int(col_identifier)
        if idx < len(df.columns):
            actual_name = df.columns[idx]
            logger.info(f"提取 '{col_type_name}' -> 使用索引 {idx} (列名: {actual_name})")
            return df.iloc[:, idx]
    
    # 3. 失败
    logger.error(f"❌ 找不到列 '{col_identifier}'")
    logger.info(f"📄当前文件可用列名: {list(df.columns)}")
    sys.exit(1)

def detect_and_read(file_path):
    """
    智能读取函数：
    1. 检测是否包含 '!' 注释行 (GAF 特征)
    2. 如果是 GAF，跳过注释并自动赋予表头
    3. 如果是普通 TSV，直接读取
    """
    is_gaf = False
    
    # 预读取前几行检测格式
    with open(file_path, 'r') as f:
        first_line = f.readline()
        if first_line.startswith('!'):
            is_gaf = True
            logger.info("检测到 GAF 格式注释行 (!)，将启用 GAF 模式读取。")

    try:
        if is_gaf:
            # GAF 模式: 跳过注释，无表头，手动指定列名
            df = pd.read_csv(
                file_path, 
                sep='\t', 
                comment='!',      # 跳过 ! 开头的行
                header=None,      # GAF 没有表头
                names=GAF_COLUMNS,# 强制指定标准列名
                on_bad_lines='skip', # 跳过格式错误的行
                low_memory=False
            )
        else:
            # 普通 TSV 模式 (如 eggNOG)
            df = pd.read_csv(file_path, sep='\t')
            
        return df

    except Exception as e:
        logger.error(f"文件读取失败: {e}")
        sys.exit(1)

def process_file(args):
    file_path = Path(args.input)
    if not file_path.exists():
        logger.error(f"❌ 文件不存在: {file_path}")
        sys.exit(1)

    # 1. 智能读取
    df = detect_and_read(file_path)
    
    # 2. 提取数据
    gene_series = get_column_data(df, args.gene_col, "Gene ID")
    go_series = get_column_data(df, args.go_col, "GO ID")
    
    # 3. 构建结果
    df_new = pd.DataFrame({
        'Gene_ID': gene_series,
        'GO_ID': go_series
    })
    
    raw_count = len(df_new)
    
    # 4. 清洗后缀
    logger.info("正在清洗 Gene ID 后缀 (.1)...")
    df_new['Gene_ID'] = df_new['Gene_ID'].apply(clean_gene_id)

    # 5. 去重
    df_clean = df_new.dropna().drop_duplicates()
    final_count = len(df_clean)
    
    logger.info(f"处理完成: {raw_count} -> {final_count} 行")

    # 6. 保存
    df_clean.to_csv(args.output, sep='\t', index=False)
    return df_clean

def display_preview(df):
    table = Table(title="📊 结果预览", show_header=True, header_style="bold magenta")
    table.add_column("Gene ID", style="green")
    table.add_column("GO ID", style="cyan")
    for _, row in df.head(5).iterrows():
        table.add_row(str(row["Gene_ID"]), str(row["GO_ID"]))
    console.print(table)

if __name__ == "__main__":
    args = get_args()
    df_result = process_file(args)
    display_preview(df_result)