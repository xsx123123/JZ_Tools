#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import pandas as pd
import argparse
import json
from loguru import logger

def get_args():
    parser = argparse.ArgumentParser(description="哈基咪的 GO 富集分析自动化封装脚本")
    # 核心路径参数
    parser.add_argument("--rscript", required=True, help="R 脚本 go_enricher.r 的路径")
    parser.add_argument("--deg_info", required=True, help="All_Contrast_DEG_Statistics.csv 的路径")
    parser.add_argument("--deg_dir", required=True, help="包含具体差异分析结果 CSV 的文件夹")
    parser.add_argument("--lib_type", default="RNA", help="富集分析的文库类型")
    
    # 转发给 R 的参数
    parser.add_argument("-o", "--obo", required=True, help="GO obo 文件")
    parser.add_argument("-a", "--assoc", required=True, help="背景关联文件")
    parser.add_argument("-d", "--out_dir", required=True, help="输出目录")
    parser.add_argument("--gene_col", default="GeneID", help="基因列名")
    parser.add_argument("--gene_regex", default=None, help="基因名清理正则")
    parser.add_argument("--cutoff", default="0.05", help="P-value 阈值")
    
    parser.add_argument("--kegg_config", help="JSON 配置文件，包含 organism/gene_col/id_map")
    parser.add_argument("--kegg_rscript", help="离线 KEGG R 脚本")
    parser.add_argument("--padj_th", default="0.05")
    parser.add_argument("--lfc_th", default="1")
    return parser.parse_args()

def main():
    args = get_args()
    
    kegg = {}
    if args.kegg_config:
        with open(args.kegg_config) as handle:
            kegg = json.load(handle)
    if kegg.get("enabled", False):
        if not args.kegg_rscript:
            raise ValueError("KEGG 启用时必须配置 kegg_rscript")
        if not kegg.get("organism") and not kegg.get("term2gene"):
            raise ValueError("KEGG 启用时必须配置 organism，或提供本地 term2gene")
        if kegg.get("id_map") and not os.path.isfile(kegg["id_map"]):
            raise FileNotFoundError(kegg["id_map"])
        if kegg.get("term2gene") and not os.path.isfile(kegg["term2gene"]):
            raise FileNotFoundError(kegg["term2gene"])
        if kegg.get("term2name") and not os.path.isfile(kegg["term2name"]):
            raise FileNotFoundError(kegg["term2name"])

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

    failures = []
    # 2. 遍历并调用 R
    for contrast in contrasts:
        if args.lib_type == 'ATAC':
            input_table = os.path.join(args.deg_dir, f"{contrast}_Differential_Peaks.csv")
        elif args.lib_type == 'RNA':
            input_table = os.path.join(args.deg_dir, f"{contrast}_DEG.csv")
        else:
            input_table = os.path.join(args.deg_dir, f"{contrast}_DEG.csv")

        if not os.path.exists(input_table):
            logger.warning(f"⚠️ 跳过: 找不到文件 {input_table}")
            failures.append(contrast)
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
            "--gene_col", args.gene_col,
            "--padj_th", args.padj_th, "--lfc_th", args.lfc_th
        ]
        
        if args.gene_regex:
            cmd.extend(["--gene_regex", args.gene_regex])

        commands = [cmd]
        if kegg.get("enabled", False):
            kegg_cmd = [
                "Rscript", args.kegg_rscript, "--table", input_table,
                "--name", contrast, "--out_dir", args.out_dir,
                "--gene_col", kegg.get("gene_col", args.gene_col),
                "--cutoff", args.cutoff,
                "--padj_th", args.padj_th, "--lfc_th", args.lfc_th,
            ]
            if kegg.get("organism"):
                kegg_cmd.extend(["--organism", kegg["organism"]])
            if kegg.get("id_map"):
                kegg_cmd.extend(["--id_map", kegg["id_map"]])
            if kegg.get("term2gene"):
                kegg_cmd.extend(["--term2gene", kegg["term2gene"]])
            if kegg.get("term2name"):
                kegg_cmd.extend(["--term2name", kegg["term2name"]])
            commands.append(kegg_cmd)

        # 执行
        try:
            # shell=False 在独立脚本中更安全，且能继承当前 conda 环境
            for command in commands:
                subprocess.run(command, check=True)
            logger.success(f"✅ {contrast} 分析成功")
        except subprocess.CalledProcessError:
            logger.error(f"❌ {contrast} 分析失败，请检查 R 脚本输出")
            failures.append(contrast)
    if failures:
        raise SystemExit(f"Enrichment failed: {', '.join(failures)}")

if __name__ == "__main__":
    main()
