#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Interactive Heatmap with Clustering & High-Res Download (V2.3)
Author: Jian Zhang (Integrated by Hajimi)
Features: 
  1. Scipy Hierarchical Clustering
  2. Auto Column Matching
  3. High-Res Download Config (Scale=4)
"""

import argparse
import pandas as pd
import plotly.express as px
import os
import sys
import numpy as np
from scipy.stats import zscore
import scipy.cluster.hierarchy as sch
from scipy.spatial.distance import pdist

# --- 参数设置 ---
parser = argparse.ArgumentParser()
parser.add_argument("-i", "--input", required=True)
parser.add_argument("-m", "--metadata", required=True)
parser.add_argument("-o", "--outdir", default="./results_heatmap")
parser.add_argument("--processed", action="store_true")
parser.add_argument("--top_n", type=int, default=1000)
parser.add_argument("--no_cluster", action="store_true", help="Disable clustering")
args = parser.parse_args()

def log_info(msg): print(f"[\033[96mINFO\033[0m] ➡️  {msg}")
def log_error(msg): print(f"[\033[91mERROR\033[0m] 🧨 {msg}")

if not os.path.exists(args.outdir): os.makedirs(args.outdir)

# --- 1. 读取数据 (Robust) ---
try:
    df = pd.read_csv(args.input, sep=None, engine='python', index_col=0)
    meta_raw = pd.read_csv(args.metadata, sep=None, engine='python')
    
    # 智能列名匹配
    matrix_samples = set(df.columns.astype(str))
    best_col, max_overlap = None, 0
    for col in meta_raw.columns:
        overlap = len(set(meta_raw[col].astype(str)) & matrix_samples)
        if overlap > max_overlap: max_overlap, best_col = overlap, col
            
    if best_col and max_overlap > 0:
        meta = meta_raw.set_index(best_col)
        log_info(f"Matched ID column: {best_col}")
    else:
        log_error("Metadata mismatch!"); sys.exit(1)
        
except Exception as e: log_error(f"Read Error: {e}"); sys.exit(1)

# 对齐
df.columns = df.columns.astype(str)
meta.index = meta.index.astype(str)
common = [s for s in df.columns if s in meta.index]
df = df[common]; meta = meta.loc[common]

# --- 2. 预处理 ---
if not args.processed:
    df = df.apply(pd.to_numeric, errors='coerce').dropna()
    df = df[df.mean(axis=1) > 1]
    df = np.log2(df + 1)
    df = df[df.var(axis=1) > 0]
    if len(df) > args.top_n:
        top_genes = df.var(axis=1).sort_values(ascending=False).head(args.top_n).index
        df = df.loc[top_genes]
    log_info(f"Data Prepared: {df.shape}")

# --- 3. Z-Score ---
z_mat = zscore(df.values, axis=1, nan_policy='omit')
df_z = pd.DataFrame(z_mat, index=df.index, columns=df.columns).fillna(0)

# --- 4. 聚类 ---
if not args.no_cluster and not df_z.empty:
    log_info("Performing Hierarchical Clustering...")
    try:
        # 行聚类
        d_rows = pdist(df_z.values, metric='correlation') # 基因通常用相关性
        row_idx = sch.leaves_list(sch.linkage(d_rows, method='ward'))
        df_z = df_z.iloc[row_idx, :]
        
        # 列聚类
        d_cols = pdist(df_z.values.T, metric='euclidean') # 样本通常用欧氏距离
        col_idx = sch.leaves_list(sch.linkage(d_cols, method='ward'))
        df_z = df_z.iloc[:, col_idx]
        log_info("Matrix reordered.")
    except Exception as e: log_error(f"Clustering skipped: {e}")

# --- 5. 绘图与配置 ---
log_info("Generating Plotly Heatmap...")
title_suffix = "TPM" if "tpm" in args.input.lower() else ("FPKM" if "fpkm" in args.input.lower() else "Exp")

# 画图
fig = px.imshow(
    df_z,
    labels=dict(x="Sample", y="Gene", color="Z-Score"),
    color_continuous_scale="RdBu_r",
    zmin=-2, zmax=2,
    aspect="auto"
)

fig.update_layout(
    title=f"Clustered Heatmap ({title_suffix})",
    xaxis={'side': 'bottom'},
    yaxis={'visible': True if len(df_z) < 100 else False}
)

# 【核心更新】配置下载按钮的高清参数
my_config = {
    'toImageButtonOptions': {
        'format': 'png', # 下载格式
        'filename': f'Heatmap_{title_suffix}_Cluster', # 动态文件名
        'height': 1200,  # 基础高度 (像素)
        'width': 1600,   # 基础宽度 (像素)
        'scale': 4       # 放大倍数 (最终宽度 = 1600 * 4 = 6400px，非常清晰!)
    },
    'displaylogo': False, # 隐藏 Plotly Logo
    'modeBarButtonsToRemove': ['lasso2d', 'select2d'] # 移除一些不常用的按钮
}

out_html = os.path.join(args.outdir, f"Interactive_Heatmap_{title_suffix}.html")

# 将 config 传入 write_html
fig.write_html(out_html, config=my_config)

log_info(f"Saved: {out_html}")
log_info("Done! (Check the camera icon in the HTML for 4K download)")