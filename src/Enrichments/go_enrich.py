#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import polars as pl
import gseapy as gp
from goatools.obo_parser import GODag
import os
import sys
import rich_click as click
from loguru import logger

# --- 1. 业务逻辑函数 (可被其他脚本 Import) ---

def go_enricher(
    gene_list_input: str | list, 
    obo_path: str, 
    assoc_path: str, 
    out_dir: str = "go_results_polars", 
    cutoff: float = 0.05
):
    """
    执行 GO 富集分析的核心逻辑。
    
    Args:
        gene_list_input: 基因列表文件的路径 (str) 或 基因列表本身 (list)
        obo_path: .obo 文件路径
        assoc_path: .tsv 关联文件路径
        out_dir: 输出目录
        cutoff: P-value 阈值
        
    Returns:
        gseapy.Enrichr 对象 (包含结果 dataframe)
    """
    
    # A. 准备目标基因列表
    target_genes = []
    if isinstance(gene_list_input, str):
        # 如果是路径，读取文件
        if os.path.exists(gene_list_input):
            with open(gene_list_input, 'r') as f:
                target_genes = [line.strip() for line in f if line.strip()]
        else:
            raise FileNotFoundError(f"基因列表文件不存在: {gene_list_input}")
    elif isinstance(gene_list_input, list):
        # 如果已经是列表，直接使用
        target_genes = gene_list_input
    else:
        raise ValueError("gene_list_input 必须是文件路径或列表")

    # B. 解析 OBO
    logger.info(f"正在解析 OBO: {obo_path}")
    godag = GODag(obo_path, optional_attrs={'relationship'})
    valid_go_ids = set(godag.keys())
    
    # C. Polars 读取并构建背景库
    logger.info(f"正在读取关联文件 (Polars Engine): {assoc_path}")
    
    # 读取 TSV
    df = pl.read_csv(
        assoc_path, 
        separator='\t', 
        has_header=False, 
        new_columns=['GeneID', 'GOID'],
        schema_overrides={'GeneID': pl.String, 'GOID': pl.String},
        truncate_ragged_lines=True
    )
    
    # 聚合处理
    df_agg = (
        df.filter(pl.col("GOID").is_in(valid_go_ids))
          .group_by("GOID")
          .agg(pl.col("GeneID"))
    )
    
    # 构建 GSEApy 所需字典
    term_genes_dict = {}
    for row in df_agg.iter_rows(named=True):
        go_id = row['GOID']
        term_name = godag[go_id].name
        key = f"{go_id} : {term_name}"
        term_genes_dict[key] = row['GeneID']

    # D. 运行 GSEApy
    logger.info("开始运行 GSEApy...")
    enr = gp.enrich(
        gene_list=target_genes,
        gene_sets=term_genes_dict,
        background=None, 
        outdir=out_dir,
        cutoff=cutoff,
        verbose=False
    )
    
    return enr

# --- 2. 命令行接口函数 (仅在直接运行时调用) ---

# 配置 Click
click.rich_click.USE_RICH_MARKUP = True
click.rich_click.STYLE_OPTION = "bold cyan"
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

@click.command(context_settings=CONTEXT_SETTINGS)
@click.option("-g", "--gene-list", type=click.Path(exists=True), required=True, help="[bold green]待分析基因列表[/] (TXT)")
@click.option("-o", "--obo", type=click.Path(exists=True), required=True, help="[bold yellow]GO本体文件[/] (.obo)")
@click.option("-a", "--assoc", type=click.Path(exists=True), required=True, help="[bold blue]基因关联文件[/] (TSV: GeneID GOID)")
@click.option("-d", "--out-dir", default="go_results_polars", show_default=True, help="输出目录")
@click.option("-c", "--cutoff", default=0.05, show_default=True, help="P-value 阈值")
def arg(gene_list, obo, assoc, out_dir, cutoff):
    """
    [bold]⚡ Polars 加速版 GO 富集分析工具 (CLI)[/]
    """
    
    # 配置日志 (CLI 模式下开启漂亮的 stderr 输出)
    logger.remove()
    logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>")

    try:
        # 调用核心逻辑函数
        enr = go_enricher(
            gene_list_input=gene_list,
            obo_path=obo,
            assoc_path=assoc,
            out_dir=out_dir,
            cutoff=cutoff
        )
        
        # 处理结果展示 (CLI 专属逻辑)
        if enr.results.empty:
            logger.warning("未发现显著富集。")
        else:
            sig = enr.results[enr.results['Adjusted P-value'] < cutoff]
            if not sig.empty:
                logger.success(f"发现 {len(sig)} 个显著通路！结果已保存至 {out_dir}")
                # 打印前几行
                print(sig[['Term', 'Adjusted P-value', 'Overlap']].head().to_string(index=False))
            else:
                logger.warning(f"没有通路满足 P < {cutoff}")
                
    except Exception as e:
        logger.error(f"运行出错: {e}")
        sys.exit(1)

# --- 3. 入口判断 ---

if __name__ == "__main__":
    arg()