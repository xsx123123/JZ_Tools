#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import pandas as pd
import argparse
from loguru import logger

def get_args():
    parser = argparse.ArgumentParser(description="哈基咪的 GO 富集分析自动化封装脚本")
    # 核心路径参数
    parser.add_argument("--rscript", required=True, help="R 脚本 go_enricher.r 的路径")
    parser.add_argument("--deg_info", required=True, help="All_Contrast_DEG_Statistics.csv 的路径")
    parser.add_argument("--deg_dir", required=True, help="包含具体差异分析结果 CSV 的文件夹")
    
    # 转发给 R 的参数
    parser.add_argument("-o", "--obo", required=True, help="GO obo 文件")
    parser.add_argument("-a", "--assoc", required=True, help="背景关联文件")
    parser.add_argument("-d", "--out_dir", required=True, help="输出目录")
    parser.add_argument("--gene_col", default="GeneID", help="基因列名")
    parser.add_argument("--gene_regex", default=None, help="基因名清理正则")
    parser.add_argument("--cutoff", default="0.05", help="P-value 阈值")
    
    return parser.parse_args()

def main():
    args = get_args()
    
    # 1. 读取对照信息
    if not os.path.exists(args.deg_info):
        logger.error(f"找不到 DEG info 文件: {args.deg_info}")
        sys.exit(1)
        
    df = pd.read_csv(args.deg_info)
    # 获取第一列 Contrast，去除引号
    contrasts = df.iloc[:, 0].str.replace('"', '').tolist()
    
    logger.info(f"🚀 开始批量处理 {len(contrasts)} 个对比组...")

    if not os.path.exists(args.out_dir):
        os.makedirs(args.out_dir)

    # 2. 遍历并调用 R
    for contrast in contrasts:
        input_table = os.path.join(args.deg_dir, f"{contrast}_DEG.csv")
        
        if not os.path.exists(input_table):
            logger.warning(f"⚠️ 跳过: 找不到文件 {input_table}")
            continue
            
        logger.info(f"✨ 正在分析对照组: {contrast}")
        
        # 构建 R 命令
        cmd = [
            "Rscript", args.rscript,
            "-o", args.obo,
            "-a", args.assoc,
            "-t", input_table,
            "-n", contrast,
            "-d", args.out_dir,
            "-c", args.cutoff,
            "--gene_col", args.gene_col
        ]
        
        if args.gene_regex:
            cmd.extend(["--gene_regex", args.gene_regex])

        # 执行
        try:
            # shell=False 在独立脚本中更安全，且能继承当前 conda 环境
            subprocess.run(cmd, check=True)
            logger.success(f"✅ {contrast} 分析成功")
        except subprocess.CalledProcessError:
            logger.error(f"❌ {contrast} 分析失败，请检查 R 脚本输出")

if __name__ == "__main__":
    main()