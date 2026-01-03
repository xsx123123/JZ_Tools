#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Hajimi RNA-seq QC V5
Updates:
1. Allow BOTH --tpm and --fpkm simultaneously.
2. Process inputs sequentially if both exist.
3. Unified output directory.
"""

import matplotlib
matplotlib.use('Agg') 

import pandas as pd
import numpy as np
from plotnine import *
import argparse
import sys
import os
from loguru import logger
from rich.console import Console
from rich.panel import Panel
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from typing import Optional, Dict
import warnings

warnings.filterwarnings('ignore')

console = Console()
logger.remove()
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{message}</level>")

def parse_args():
    parser = argparse.ArgumentParser(
        description="🐱 哈基咪 RNA-seq QC V5: 全能并行版 (支持同时输入 TPM 和 FPKM)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    # 不再互斥，允许同时存在
    parser.add_argument('--tpm', type=str, help='TPM 矩阵文件路径')
    parser.add_argument('--fpkm', type=str, help='FPKM 矩阵文件路径')
    
    parser.add_argument('--counts', type=str, default=None, help='Counts 矩阵文件路径 (可选)')
    parser.add_argument('--out_dir', type=str, default='Hajimi_QC_Result', help='输出目录')
    parser.add_argument('--detect_cutoff', type=float, default=1.0, help='判定基因表达的阈值 (默认 > 1.0)')
    parser.add_argument('--width', type=int, default=10, help='图片宽度')
    parser.add_argument('--height', type=int, default=6, help='图片高度')
    return parser.parse_args()

def check_dir(dir_path: str):
    if not os.path.exists(dir_path):
        os.makedirs(dir_path)
        logger.info(f"📂 创建输出目录: {dir_path}")

def save_plot(p, filename_prefix: str, out_dir: str, w: int, h: int):
    p.save(os.path.join(out_dir, f"{filename_prefix}.pdf"), width=w, height=h, verbose=False)
    p.save(os.path.join(out_dir, f"{filename_prefix}.png"), width=w, height=h, dpi=300, verbose=False)

def load_data(file_path: str, file_type: str) -> Optional[pd.DataFrame]:
    try:
        logger.info(f"📖 读取 {file_type}: {file_path}")
        df = pd.read_csv(file_path, sep='\t', index_col=0)
        df = df.fillna(0)
        df = df.loc[~(df==0).all(axis=1)] 
        logger.success(f"✅ {file_type} 加载完毕: {df.shape[1]} 样本, {df.shape[0]} 基因")
        return df
    except Exception as e:
        logger.error(f"❌ 读取失败: {e}")
        return None

def save_tsvs(data_dict: Dict[str, pd.DataFrame], out_dir: str):
    logger.info("💾 正在导出统计表...")
    for name, df in data_dict.items():
        filename = os.path.join(out_dir, f"{name}.tsv")
        try:
            df.to_csv(filename, sep='\t', index=True)
        except Exception:
            pass

def plot_library_size(df_counts: pd.DataFrame, out_dir: str, w: int, h: int) -> pd.DataFrame:
    lib_size = df_counts.sum(axis=0).reset_index()
    lib_size.columns = ['Sample', 'Total_Reads']
    lib_size.set_index('Sample', inplace=True)
    
    plot_df = lib_size.reset_index()
    plot_df['Label'] = (plot_df['Total_Reads'] / 1e6).round(2).astype(str) + "M"

    p = (
        ggplot(plot_df, aes(x='Sample', y='Total_Reads', fill='Sample'))
        + geom_bar(stat='identity', color='black', size=0.2, alpha=0.8)
        + geom_text(aes(label='Label'), va='bottom', size=8, format_string='{}')
        + scale_fill_hue(l=0.5, s=0.7)
        + labs(title='Library Size (Counts)', x='', y='Total Reads')
        + theme_classic()
        + theme(axis_text_x=element_text(rotation=45, hjust=1), legend_position='none')
    )
    save_plot(p, "library_size", out_dir, w, h)
    return lib_size

def run_workflow(df: pd.DataFrame, unit: str, args, results_dict: dict):
    """
    处理单个表达矩阵（TPM 或 FPKM）的通用流程
    """
    logger.info(f"🚀 开始处理 {unit} 数据...")
    
    # 1. Detected Genes
    detected = (df > args.detect_cutoff).sum(axis=0).reset_index()
    detected.columns = ['Sample', 'Gene_Count']
    detected.set_index('Sample', inplace=True)
    
    plot_df = detected.reset_index()
    p1 = (
        ggplot(plot_df, aes(x='Sample', y='Gene_Count', fill='Sample'))
        + geom_bar(stat='identity', color='black', size=0.2, alpha=0.8)
        + labs(title=f'Detected Genes ({unit} > {args.detect_cutoff})', x='', y='Count')
        + theme_classic()
        + theme(axis_text_x=element_text(rotation=45, hjust=1), legend_position='none')
    )
    save_plot(p1, f"detected_genes_{unit.lower()}", args.out_dir, args.width, args.height)
    results_dict[f'detected_genes_{unit.lower()}'] = detected

    # 2. Violin Plot
    logger.info(f"🎻 绘制 {unit} 小提琴图...")
    df_log = np.log2(df + 1)
    df_long = df_log.reset_index().melt(id_vars=df_log.index.name, var_name='Sample', value_name='Log2_Value')
    
    p2 = (
        ggplot(df_long, aes(x='Sample', y='Log2_Value', fill='Sample'))
        + geom_violin(style='left-right', alpha=0.6, color='none') 
        + geom_boxplot(width=0.1, color='black', fill='white', alpha=0.9, outlier_size=0.1, outlier_alpha=0.1)
        + labs(title=f'Gene Expression ({unit})', x='', y=f"Log2({unit} + 1)")
        + scale_fill_hue(l=0.5, s=0.8)
        + theme_classic()
        + theme(axis_text_x=element_text(rotation=45, hjust=1), legend_position='none')
    )
    save_plot(p2, f"expression_violin_{unit.lower()}", args.out_dir, args.width, args.height)
    results_dict[f'expression_stats_{unit.lower()}'] = df_log.describe().T

    # 3. PCA
    means = df.mean(axis=1)
    df_filtered = df[means > 1]
    df_log_pca = np.log2(df_filtered + 1)
    
    pca = PCA(n_components=2)
    pca_data = pca.fit_transform(StandardScaler().fit_transform(df_log_pca.T))
    pca_df = pd.DataFrame(data=pca_data, columns=['PC1', 'PC2'])
    pca_df['Sample'] = df_log_pca.columns
    pca_df.set_index('Sample', inplace=True)
    var_exp = pca.explained_variance_ratio_
    
    plot_df_pca = pca_df.reset_index()
    p3 = (
        ggplot(plot_df_pca, aes(x='PC1', y='PC2', fill='Sample', label='Sample'))
        + geom_point(size=5, color='black', stroke=0.5, alpha=0.9)
        + geom_text(nudge_y=0.5, size=8, va='bottom')
        + labs(title=f'PCA (Log2 {unit})', x=f"PC1 ({var_exp[0]*100:.2f}%)", y=f"PC2 ({var_exp[1]*100:.2f}%)")
        + theme_bw()
    )
    save_plot(p3, f"pca_{unit.lower()}", args.out_dir, args.width, args.height)
    results_dict[f'pca_{unit.lower()}'] = pca_df

    # 4. Correlation
    corr_matrix = df_log.corr(method='pearson')
    corr_melt = corr_matrix.reset_index().melt(id_vars='index', var_name='Sample2', value_name='Correlation')
    corr_melt.rename(columns={'index': 'Sample1'}, inplace=True)
    
    p4 = (
        ggplot(corr_melt, aes(x='Sample1', y='Sample2', fill='Correlation'))
        + geom_tile(color='white')
        + geom_text(aes(label='Correlation'), format_string='{:.2f}', size=8, color='black')
        + scale_fill_cmap(name='RdYlBu_r')
        + labs(title=f'Pearson Correlation (Log2 {unit})', x='', y='')
        + theme_minimal()
        + theme(axis_text_x=element_text(rotation=45, hjust=1))
    )
    save_plot(p4, f"correlation_{unit.lower()}", args.out_dir, args.width+1, args.height+1)
    results_dict[f'correlation_{unit.lower()}'] = corr_matrix

def main():
    console.print(Panel.fit("🐱 Hajimi QC V5: 双开并行版 (TPM + FPKM)", style="bold cyan"))
    args = parse_args()
    check_dir(args.out_dir)
    results_to_save = {}

    # 检查是否至少提供了一个输入
    if not args.tpm and not args.fpkm:
        logger.error("❌ 请至少提供 --tpm 或 --fpkm 中的一个！")
        sys.exit(1)

    # 1. 处理 TPM (如果存在)
    if args.tpm:
        df_tpm = load_data(args.tpm, "TPM")
        if df_tpm is not None:
            run_workflow(df_tpm, "TPM", args, results_to_save)

    # 2. 处理 FPKM (如果存在)
    if args.fpkm:
        df_fpkm = load_data(args.fpkm, "FPKM")
        if df_fpkm is not None:
            run_workflow(df_fpkm, "FPKM", args, results_to_save)

    # 3. 处理 Library Size (Counts, 公用)
    if args.counts:
        df_counts = load_data(args.counts, "Counts")
        if df_counts is not None:
            results_to_save['library_size'] = plot_library_size(df_counts, args.out_dir, args.width, args.height)

    # 导出所有表格
    save_tsvs(results_to_save, args.out_dir)
    console.print(f"\n[bold green]✨ 全部完成！结果已保存至: {args.out_dir}[/bold green]")

if __name__ == "__main__":
    main()