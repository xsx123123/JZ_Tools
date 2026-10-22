#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import pandas as pd
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from loguru import logger

def get_args():
    parser = argparse.ArgumentParser(description="哈基咪的 GO 富集分析自动化封装脚本")
    # 核心路径参数
    parser.add_argument("--rscript", required=True, help="R 脚本 go_enricher.r 的路径")
    parser.add_argument("--deg_info", required=True, help="All_Contrast_DEG_Statistics.csv 的路径")
    parser.add_argument("--deg_dir", required=True, help="包含具体差异分析结果 CSV 的文件夹")
    parser.add_argument("--lib_type", default="RNA", help="富集分析的文库类型")
    parser.add_argument("--threads", type=int, default=1, help="最多同时运行的比较组数 [默认: 1]")
    parser.add_argument("--log-dir", help="比较组控制台日志目录 [默认: OUT_DIR/logs]")
    
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
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads 必须至少为 1")
    return args

def main():
    args = get_args()
    
    kegg = {}
    if args.kegg_config:
        with open(args.kegg_config) as handle:
            kegg = json.load(handle)
    if kegg.get("enabled", False):
        if not kegg.get("organism") or not args.kegg_rscript:
            raise ValueError("KEGG 启用时必须配置 organism 和 kegg_rscript")
        if kegg.get("id_map") and not os.path.isfile(kegg["id_map"]):
            raise FileNotFoundError(kegg["id_map"])

    # 1. 读取对照信息
    if not os.path.exists(args.deg_info):
        logger.error(f"找不到 DEG info 文件: {args.deg_info}")
        sys.exit(1)
        
    df = pd.read_csv(args.deg_info)
    # 获取第一列 Contrast，去除引号
    contrasts = df.iloc[:, 0].str.replace('"', '').tolist()
    if any(not isinstance(name, str) or not name or "/" in name or "\\" in name for name in contrasts):
        raise ValueError("Contrast 名称不能为空或包含路径分隔符")
    if len(set(contrasts)) != len(contrasts):
        raise ValueError("Contrast 名称重复会覆盖富集结果文件")
    
    workers = min(args.threads, max(len(contrasts), 1))
    logger.info(f"🚀 开始批量处理 {len(contrasts)} 个对比组，并发数: {workers}")

    logs = Path(args.log_dir) if args.log_dir else Path(args.out_dir) / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    Path(args.out_dir).mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "BLIS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[key] = "1"

    # 每个任务串行执行该比较组的 GO/KEGG；比较组之间并行，避免嵌套并行超额使用 CPU。
    def run_contrast(contrast):
        if args.lib_type == 'ATAC':
            input_table = os.path.join(args.deg_dir, f"{contrast}_Differential_Peaks.csv")
        elif args.lib_type == 'RNA':
            input_table = os.path.join(args.deg_dir, f"{contrast}_DEG.csv")
        else:
            input_table = os.path.join(args.deg_dir, f"{contrast}_DEG.csv")

        if not os.path.exists(input_table):
            logger.warning(f"⚠️ 跳过: 找不到文件 {input_table}")
            return False
            
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
                "--organism", kegg["organism"],
                "--gene_col", kegg.get("gene_col", args.gene_col),
                "--cutoff", args.cutoff,
                "--padj_th", args.padj_th, "--lfc_th", args.lfc_th,
            ]
            if kegg.get("id_map"):
                kegg_cmd.extend(["--id_map", kegg["id_map"]])
            commands.append(kegg_cmd)

        # 执行
        console_log = logs / f"{contrast}.console.log"
        try:
            with console_log.open("w", encoding="utf-8") as handle:
                for command in commands:
                    subprocess.run(command, check=True, env=env, stdout=handle, stderr=subprocess.STDOUT)
            logger.success(f"✅ {contrast} 分析成功")
            return True
        except (OSError, subprocess.CalledProcessError) as error:
            logger.error(f"❌ {contrast} 分析失败: {error}；日志: {console_log}")
            return False

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(run_contrast, contrasts))
    failures = [contrast for contrast, success in zip(contrasts, results) if not success]
    if failures:
        raise SystemExit(f"Enrichment failed: {', '.join(failures)}")

if __name__ == "__main__":
    main()
