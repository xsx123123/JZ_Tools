#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
import time
import pandas as pd
from loguru import logger
from rich.console import Console
from rich import print as rprint
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from typing import List, Dict

import rich_click as click

# --- 全局配置 ---
click.rich_click.USE_RICH_MARKUP = True
click.rich_click.USE_MARKDOWN = True
click.rich_click.SHOW_ARGUMENTS = True
click.rich_click.GROUP_ARGUMENTS_OPTIONS = True
click.rich_click.STYLE_ERRORS_SUGGESTION = "magenta italic"
click.rich_click.WIDTH = 100

console = Console()

# --- 🛠️ 1. 日志配置 ---
def setup_logging(log_level: str = "INFO", log_file: str = None):
    logger.remove()
    log_fmt = "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    if log_level == "DEBUG":
        log_fmt = "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}:{line}</cyan> - <level>{message}</level>"
    logger.add(sys.stderr, format=log_fmt, level=log_level)
    if log_file:
        file_fmt = "{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{line} - {message}"
        logger.add(log_file, format=file_fmt, level="DEBUG", rotation="10 MB")
        logger.info(f"📝 详细日志已保存至: {log_file}")

# --- 🛡️ 2. 样本表校验 ---
def _validate_df(df: pd.DataFrame, required_cols: List[str], index_col: str) -> None:
    logger.info(f"🛡️ 正在校验样本表结构... (Index: {index_col})")
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        rprint(f"❌ 样本表格式错误！缺失列: [bold red]{missing_cols}[/bold red]")
        sys.exit(1)
    if df[index_col].duplicated().any():
        duplicated_ids = df[df[index_col].duplicated()][index_col].unique().tolist()
        rprint(f"❌ 样本ID不唯一！检测到重复样本名: [bold red]{duplicated_ids}[/bold red]")
        sys.exit(1)
    logger.success("✅ 样本表格式校验通过")

def load_map_from_csv(map_file: str, required_cols: List[str]) -> Dict[str, str]:
    if not map_file or not os.path.exists(map_file): return {}
    try:
        df = pd.read_csv(map_file, dtype=str)
        df.columns = df.columns.str.strip()
        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
        if "sample" not in required_cols: required_cols.append("sample")
        _validate_df(df, required_cols=required_cols, index_col="sample")
        return df.set_index("sample")["sample_name"].to_dict()
    except Exception as e:
        logger.error(f"❌ 读取映射表失败: {e}"); sys.exit(1)

# --- 🧬 3. 核心 ID 清理逻辑 ---
def clean_identifiers(series: pd.Index) -> pd.Index:
    """
    清洗基因/转录本 ID：
    1. 移除 'gene:' 前缀
    2. 移除末尾的 '.数字' 版本号 (如 .13)
    """
    return series.astype(str).str.replace(r'^gene:', '', regex=True).str.replace(r'\.\d+$', '', regex=True)

# --- 🛠️ 4. 核心合并函数 ---
def core_merge_logic(
    input_files: List[str],
    output_tpm: str,
    output_counts: str,
    output_fpkm: str = None,
    sample_map: Dict[str, str] = None,
    log_level: str = "INFO"
):
    log_dir = os.path.dirname(os.path.abspath(output_tpm))
    os.makedirs(log_dir, exist_ok=True)
    setup_logging(log_level, os.path.join(log_dir, f"merge_rsem_{time.strftime('%Y%m%d_%H%M%S')}.log"))

    if not input_files:
        logger.error("❌ 输入文件列表为空！"); sys.exit(1)
    sample_map = sample_map or {}

    tpm_list, counts_list, fpkm_list = [], [], []
    is_isoform = any(".isoforms.results" in f for f in input_files)

    with Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]{task.description}"),
        BarColumn(bar_width=None, complete_style="green"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console, transient=True
    ) as progress:
        task = progress.add_task(f"正在处理 {len(input_files)} 个样本...", total=len(input_files))

        for file_path in input_files:
            try:
                filename = os.path.basename(file_path)
                sample_id = filename.split(".")[0]
                sample_name = sample_map.get(sample_id, sample_id)

                # 自动判定格式
                curr_is_iso = filename.endswith('.isoforms.results')
                idx_col = 'transcript_id' if curr_is_iso else 'gene_id'
                cols = [idx_col, "TPM", "expected_count"]
                if curr_is_iso: cols.append("gene_id")
                if output_fpkm: cols.append("FPKM")

                # 读取数据
                df = pd.read_csv(file_path, sep="\t", usecols=cols)
                
                # ✨ 清理 ID
                df[idx_col] = clean_identifiers(df[idx_col])
                if curr_is_iso:
                    df['gene_id'] = clean_identifiers(df['gene_id'])
                
                # 设置索引
                if curr_is_iso:
                    df = df.set_index(['transcript_id', 'gene_id'])
                else:
                    df = df.set_index('gene_id')

                # 提取并重命名
                tpm_list.append(df[["TPM"]].rename(columns={"TPM": sample_name}))
                counts_list.append(df[["expected_count"]].rename(columns={"expected_count": sample_name}))
                if output_fpkm:
                    fpkm_list.append(df[["FPKM"]].rename(columns={"FPKM": sample_name}))

                progress.advance(task)
            except Exception as e:
                logger.error(f"❌ 处理文件失败 {file_path}: {e}"); sys.exit(1)

    # 📦 拼接并去重加和
    logger.info("📦 正在拼接矩阵并执行 ID 去重合并...")
    for out_path, df_list, label in zip([output_tpm, output_counts, output_fpkm], 
                                        [tpm_list, counts_list, fpkm_list], 
                                        ["TPM", "Counts", "FPKM"]):
        if out_path:
            combined = pd.concat(df_list, axis=1)
            # 关键：移除版本号后，如果出现同名基因，执行加和处理
            combined = combined.groupby(level=combined.index.names).sum()
            combined.to_csv(out_path, sep="\t")
            logger.success(f"✅ {label} 矩阵已保存: {out_path}")

def core_merge_logic_from_dir(input_dir, output_tpm, output_counts, output_fpkm=None, sample_map=None, extension=".genes.results", log_level="INFO"):
    files = [os.path.join(input_dir, f) for f in os.listdir(input_dir) if f.endswith(extension)]
    if not files:
        logger.error(f"❌ 目录 {input_dir} 中未找到后缀为 {extension} 的文件！"); sys.exit(1)
    core_merge_logic(files, output_tpm, output_counts, output_fpkm, sample_map, log_level)

# --- 🚀 5. CLI 定义 (带完整帮助注释) ---
@click.group(context_settings=dict(help_option_names=['-h', '--help']))
def cli():
    """[bold cyan]RSEM 结果合并工具箱[/] - 自动移除 ID 版本号并生成表达矩阵"""
    pass

@cli.command(help="模式 A：直接通过多个输入文件路径进行合并")
@click.option("-i", "--input", "input_files", multiple=True, required=True, help="[必填] RSEM 结果文件路径，可多次使用此参数添加多个文件")
@click.option("--tpm", required=True, help="[必填] 输出 TPM 矩阵路径 (.tsv)")
@click.option("--counts", required=True, help="[必填] 输出 Expected Counts 矩阵路径 (.tsv)")
@click.option("--fpkm", help="[可选] 输出 FPKM 矩阵路径")
@click.option("--map", "map_file", help="[可选] 样本信息表 (CSV)，用于将 Sample_ID 转换为 Sample_Name")
@click.option("--log-level", default="INFO", type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR']), help="设置日志记录级别")
@click.option("--check-cols", multiple=True, default=["sample", "sample_name"], help="样本信息表中必须存在的列名")
def merge(input_files, tpm, counts, fpkm, map_file, log_level, check_cols):
    mapping = load_map_from_csv(map_file, list(check_cols)) if map_file else {}
    core_merge_logic(list(input_files), tpm, counts, fpkm, mapping, log_level)

@cli.command(help="模式 B：扫描整个目录中的 RSEM 结果文件并合并")
@click.option("--input-dir", required=True, help="[必填] 包含 RSEM 结果文件的文件夹路径")
@click.option("--tpm", required=True, help="[必填] 输出 TPM 矩阵路径")
@click.option("--counts", required=True, help="[必填] 输出 Counts 矩阵路径")
@click.option("--fpkm", help="[可选] 输出 FPKM 矩阵路径")
@click.option("--map", "map_file", help="[可选] 样本信息表 (CSV)")
@click.option("--extension", default=".genes.results", type=click.Choice(['.genes.results', '.isoforms.results']), help="需要扫描的文件后缀")
@click.option("--log-level", default="INFO", help="日志级别")
@click.option("--check-cols", multiple=True, default=["sample", "sample_name"], help="校验列")
def merge_from_dir(input_dir, tpm, counts, fpkm, map_file, extension, log_level, check_cols):
    mapping = load_map_from_csv(map_file, list(check_cols)) if map_file else {}
    core_merge_logic_from_dir(input_dir, tpm, counts, fpkm, mapping, extension, log_level)

# --- 🔄 6. Snakemake 自动对接 ---
if __name__ == "__main__":
    if "snakemake" in globals():
        # 从 snakemake 对象获取参数
        mapping = load_map_from_csv(getattr(snakemake.input, "sample_sheet", None), 
                                   snakemake.params.get("check_cols", ["sample", "sample_name"]))
        input_dir = snakemake.params.get("input_dir")
        out_fpkm = getattr(snakemake.output, "fpkm", None)
        
        if input_dir:
            core_merge_logic_from_dir(input_dir, snakemake.output.tpm, snakemake.output.counts, 
                                      out_fpkm, mapping, snakemake.params.get("extension", ".genes.results"))
        else:
            core_merge_logic(snakemake.input.rsem_files, snakemake.output.tpm, snakemake.output.counts, 
                             out_fpkm, mapping)
    else:
        cli()