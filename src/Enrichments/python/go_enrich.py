#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import polars as pl
import pandas as pd
import gseapy as gp
from goatools.obo_parser import GODag
import os
import sys
import rich_click as click
from loguru import logger
from rich.console import Console
from rich.table import Table

# 初始化 Rich 控制台
console = Console()

# --- 1. 核心业务逻辑 (Core Logic) ---

def go_enricher(
    gene_list_input: str | list, 
    obo_path: str, 
    assoc_path: str, 
    out_dir: str = "go_results_polars", 
    cutoff: float = 0.05
):
    """
    执行 GO 富集分析的核心逻辑。
    """
    # A. 准备目标基因列表
    target_genes = []
    if isinstance(gene_list_input, str):
        if os.path.exists(gene_list_input):
            with open(gene_list_input, 'r') as f:
                target_genes = [line.strip() for line in f if line.strip()]
        else:
            raise FileNotFoundError(f"基因列表文件不存在: {gene_list_input}")
    elif isinstance(gene_list_input, list):
        target_genes = gene_list_input
    else:
        raise ValueError("gene_list_input 必须是文件路径或列表")

    if not target_genes:
        logger.warning("目标基因列表为空，跳过分析。")
        return None

    # B. 解析 OBO
    logger.info(f"正在解析 OBO: {obo_path}")
    if not os.path.exists(obo_path):
        raise FileNotFoundError(f"OBO文件未找到: {obo_path}")
    godag = GODag(obo_path, optional_attrs={'relationship'})
    valid_go_ids = set(godag.keys())
    
    # C. Polars 读取并构建背景库
    logger.info(f"正在读取关联文件 (Polars Engine): {assoc_path}")
    
    try:
        # 读取 GO 关联文件 (通常是 GeneID <tab> GOID)
        df = pl.read_csv(
            assoc_path, 
            separator='\t', 
            has_header=False, 
            new_columns=['GeneID', 'GOID'],
            schema_overrides={'GeneID': pl.String, 'GOID': pl.String},
            truncate_ragged_lines=True,
            comment_prefix='!'  # 处理 GAF 文件的注释行
        )
    except Exception as e:
        logger.error(f"读取关联文件失败: {e}")
        raise e
    
    # 过滤掉不在 OBO 中的 GO term，并构建字典
    df_agg = (
        df.filter(pl.col("GOID").is_in(valid_go_ids))
          .group_by("GOID")
          .agg(pl.col("GeneID"))
    )
    
    term_genes_dict = {}
    for row in df_agg.iter_rows(named=True):
        go_id = row['GOID']
        if go_id in godag:
            term_name = godag[go_id].name
            key = f"{go_id} : {term_name}"
            term_genes_dict[key] = row['GeneID']

    if not term_genes_dict:
        logger.error("背景库构建失败：关联文件中的 GO ID 未在 OBO 文件中找到匹配项。")
        return None

    # D. 运行 GSEApy
    logger.info(f"开始运行 GSEApy (Input Genes: {len(target_genes)})...")
    
    os.makedirs(out_dir, exist_ok=True)

    try:
        # 注意：如果没有任何基因匹配上背景库，GSEApy 可能会打印错误并返回空结果
        enr = gp.enrich(
            gene_list=target_genes,
            gene_sets=term_genes_dict,
            background=None, 
            outdir=out_dir,
            cutoff=cutoff,
            verbose=False
        )
        return enr
    except Exception as e:
        logger.error(f"GSEApy 运行内部错误: {e}")
        return None

def filter_deg_table(table_path, gene_col, padj_col, lfc_col, padj_th, lfc_th):
    """
    读取差异分析表格并筛选基因。
    [修复] 增加了对 NA 值的处理。
    """
    logger.info(f"正在读取差异表格: {table_path}")
    
    sep = ',' if table_path.endswith('.csv') else '\t'
    
    try:
        # [关键修复 1] 处理 NA/NaN/Inf 等特殊值，防止报错
        df = pl.read_csv(
            table_path, 
            separator=sep,
            null_values=["NA", "na", "NaN", "nan", "Inf", "-Inf", "null", ""],
            infer_schema_length=10000 
        )
        
        # 检查列名
        expected_cols = [gene_col, padj_col, lfc_col]
        missing = [c for c in expected_cols if c not in df.columns]
        if missing:
            raise ValueError(f"表格中缺少列: {missing}. 现有列: {df.columns}")

        # 核心筛选逻辑
        # drop_nulls: 只要这一行里有空值（比如padj是NA），就丢掉
        filtered_df = df.select([gene_col, padj_col, lfc_col]).drop_nulls().filter(
            (pl.col(padj_col).cast(pl.Float64) < padj_th) & 
            (pl.col(lfc_col).cast(pl.Float64).abs() >= lfc_th)
        )
        
        gene_list = filtered_df.select(pl.col(gene_col)).to_series().to_list()
        
        # 结果清洗：转字符串，去重，去空
        gene_list = list(set([str(g).strip() for g in gene_list if g]))
        
        logger.success(f"筛选完成 | 阈值: Padj<{padj_th}, |LFC|>={lfc_th} | 提取基因数: {len(gene_list)}")
        return gene_list

    except Exception as e:
        logger.error(f"读取或筛选表格失败: {e}")
        sys.exit(1)

# --- 2. 辅助函数：打印美观表格 ---

def print_enrich_table(df_sig):
    """使用 Rich 打印漂亮的终端表格"""
    table = Table(title="Top Enriched Pathways", box=click.rich_click.BOX_STYLES['rounded'])

    table.add_column("Term", style="cyan", no_wrap=False)
    table.add_column("Adj. P-value", style="magenta")
    table.add_column("Overlap", style="green")
    table.add_column("Genes", style="yellow", no_wrap=True, max_width=40)

    # 取前 10 个展示
    for row in df_sig.head(10).iter_rows(named=True):
        genes = row.get('Genes', '')
        if len(genes) > 30:
            genes = genes[:27] + "..."
            
        table.add_row(
            row.get('Term', 'N/A').split(':')[-1].strip(), 
            f"{row.get('Adjusted P-value', 1.0):.2e}",
            str(row.get('Overlap', '0/0')),
            genes
        )

    console.print(table)

# --- 3. 命令行接口 (CLI) ---

click.rich_click.USE_RICH_MARKUP = True
click.rich_click.STYLE_OPTION = "bold cyan"
click.rich_click.STYLE_COMMAND = "bold green"
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])

def common_options(func):
    """共享参数"""
    func = click.option("-o", "--obo", type=click.Path(exists=True), required=True, help="[bold yellow]GO本体文件[/] (.obo)")(func)
    func = click.option("-a", "--assoc", type=click.Path(exists=True), required=True, help="[bold blue]基因关联文件[/] (TSV: GeneID GOID)")(func)
    func = click.option("-d", "--out-dir", default="go_results", show_default=True, help="输出目录")(func)
    func = click.option("-c", "--cutoff", default=0.05, show_default=True, help="富集分析 P-value 阈值")(func)
    return func

@click.group(context_settings=CONTEXT_SETTINGS)
def cli():
    """
    [bold]⚡ Polars 加速版 GO 富集分析工具[/]
    """
    logger.remove()
    logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>")

@cli.command(name="run-list")
@click.option("-g", "--gene-list", type=click.Path(exists=True), required=True, help="基因列表文件 (TXT)")
@common_options
def run_list(gene_list, obo, assoc, out_dir, cutoff):
    run_analysis(gene_list, obo, assoc, out_dir, cutoff)

@cli.command(name="run-table")
@click.option("-t", "--table", type=click.Path(exists=True), required=True, help="差异分析结果表格 (CSV/TSV)")
@click.option("--gene-col", default="GeneID", show_default=True, help="基因ID列名")
@click.option("--padj-col", default="padj", show_default=True, help="Padj 列名")
@click.option("--lfc-col", default="log2FoldChange", show_default=True, help="LFC 列名")
@click.option("--padj-th", default=0.05, show_default=True, help="Padj 阈值")
@click.option("--lfc-th", default=1.0, show_default=True, help="|LFC| 阈值")
@common_options
def run_table(table, gene_col, padj_col, lfc_col, padj_th, lfc_th, obo, assoc, out_dir, cutoff):
    # 1. 筛选
    genes = filter_deg_table(table, gene_col, padj_col, lfc_col, padj_th, lfc_th)
    
    if not genes:
        logger.warning("筛选结果为空，终止运行。")
        sys.exit(0)
    
    # 2. 保存筛选后的基因列表
    os.makedirs(out_dir, exist_ok=True)
    list_save_path = os.path.join(out_dir, "filtered_gene_list.txt")
    with open(list_save_path, 'w') as f:
        f.write("\n".join(genes))
    logger.info(f"筛选后的基因列表已保存至: {list_save_path}")

    # 3. 分析
    run_analysis(genes, obo, assoc, out_dir, cutoff)

def run_analysis(gene_input, obo, assoc, out_dir, cutoff):
    try:
        enr = go_enricher(
            gene_list_input=gene_input,
            obo_path=obo,
            assoc_path=assoc,
            out_dir=out_dir,
            cutoff=cutoff
        )
        
        # 如果函数返回 None，直接退出
        if enr is None:
            return 

        # [关键修复 2] 检查 enr.results 的类型
        # GSEApy 在没有匹配结果(No hits)时，会返回一个空列表 []，而不是 DataFrame
        if isinstance(enr.results, list):
            logger.warning("⚠️ 分析完成，但未找到任何结果。原因可能是：")
            logger.warning("   1. 输入基因 ID 与背景库 ID 格式不匹配 (如: Solyc01g.1 vs Solyc01g)")
            logger.warning("   2. 输入基因不在背景库中")
            return

        if not isinstance(enr.results, pd.DataFrame):
            logger.error(f"GSEApy 返回了未知的数据类型: {type(enr.results)}")
            return

        if enr.results.empty:
            logger.warning(f"分析完成，但结果表格为空。")
            return

        # 安全转换为 Polars
        res_df = pl.from_pandas(enr.results)
        
        if not res_df.is_empty():
            sig = res_df.filter(pl.col('Adjusted P-value') < cutoff).sort('Adjusted P-value')
            
            if not sig.is_empty():
                logger.success(f"分析成功！发现 {len(sig)} 个显著富集通路。")
                print_enrich_table(sig)
                logger.info(f"完整结果已保存至: {out_dir}")
            else:
                logger.warning(f"分析完成，但没有通路满足 Adj.P < {cutoff}")
        else:
            logger.warning("结果表格为空。")
                
    except Exception as e:
        logger.error(f"分析过程中发生未捕获异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    cli()