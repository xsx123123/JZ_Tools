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

# --- 🛠️ 日志配置 ---
def setup_logging(log_level: str = "INFO", log_file: str = None):
    logger.remove()

    # Console handler
    log_fmt = "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    if log_level == "DEBUG":
        log_fmt = "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}:{line}</cyan> - <level>{message}</level>"

    logger.add(sys.stderr, format=log_fmt, level=log_level)

    # File handler (Always detailed DEBUG logs as requested)
    if log_file:
        file_fmt = "{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{line} - {message}"
        logger.add(log_file, format=file_fmt, level="DEBUG", rotation="10 MB")
        logger.info(f"📝 详细日志已保存至: {log_file}")

    if log_level == "DEBUG":
        logger.debug("🔧 调试模式已开启")

# --- 🛡️ 核心校验函数 (用户提供) ---
def _validate_df(df: pd.DataFrame, required_cols: List[str], index_col: str) -> None:
    """
    [内部函数] 校验 DataFrame 的完整性和唯一性
    """
    logger.info(f"🛡️ 正在校验样本表结构... (Index: {index_col}, Required: {required_cols})")

    # 1. 校验必填列是否存在
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        error_msg = (
            f"❌ 样本表格式错误！\n"
            f"   缺失列: [bold red]{missing_cols}[/bold red]\n"
            f"   必需列: {required_cols}"
        )
        rprint(error_msg)
        logger.error(f"Sample sheet missing columns: {missing_cols}")
        sys.exit(1)

    # 2. 校验索引列 (Sample ID) 是否有重复
    # 确保 index_col 在 dataframe 中
    if index_col not in df.columns:
         logger.error(f"❌ 指定的索引列 '{index_col}' 不在表格中！")
         sys.exit(1)

    if df[index_col].duplicated().any():
        duplicated_ids = df[df[index_col].duplicated()][index_col].unique().tolist()
        error_msg = (
            f"❌ 样本ID不唯一！检测到重复样本名 (Sample ID):\n"
            f"   [bold red]{duplicated_ids}[/bold red]"
        )
        rprint(error_msg)
        logger.error(f"Duplicate sample IDs found: {duplicated_ids}")
        sys.exit(1)

    # 3. 校验是否有空值 (NaN)
    # 仅检查必填列中的空值
    if df[required_cols].isnull().any().any():
        nan_rows = df[df[required_cols].isnull().any(axis=1)][index_col].tolist()
        logger.warning(f"⚠️ 警告: 以下样本在必填列中存在空值 (NaN/Empty): {nan_rows}")

    logger.success("✅ 样本表格式校验通过")

# --- 🛠️ 读取并校验映射表 ---
def load_map_from_csv(map_file: str, required_cols: List[str]) -> Dict[str, str]:
    """读取 CSV -> 校验 -> 返回字典"""
    if not map_file or not os.path.exists(map_file):
        return {}

    try:
        logger.debug(f"📂 读取映射表: {map_file}")
        # dtype=str 防止 ID 变成数字
        df = pd.read_csv(map_file, dtype=str)

        # 清理列名空格
        df.columns = df.columns.str.strip()

        # 清理内容空格 (针对 object 类型)
        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

        # 核心逻辑：执行校验
        # 默认假设 "sample" 是作为 ID 的列 (index_col)
        # 如果 required_cols 里没有 sample，这会导致逻辑错误，所以我们强制检查 sample
        if "sample" not in required_cols:
            required_cols.append("sample")

        _validate_df(df, required_cols=required_cols, index_col="sample")

        # 建立映射
        mapping = df.set_index("sample")["sample_name"].to_dict()
        return mapping

    except Exception as e:
        logger.error(f"❌ 读取或校验映射表失败: {e}")
        sys.exit(1)

# --- 核心逻辑 ---
def core_merge_logic(
    input_files: List[str],
    output_tpm: str,
    output_counts: str,
    output_fpkm: str = None,
    sample_map: Dict[str, str] = None,
    log_level: str = "INFO"
):
    # Determine log file path
    log_dir = os.path.dirname(os.path.abspath(output_tpm))
    os.makedirs(log_dir, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(log_dir, f"merge_rsem_{timestamp}.log")

    setup_logging(log_level, log_file)

    if not input_files:
        logger.error("❌ 输入文件列表为空！")
        sys.exit(1)
    if sample_map is None:
        sample_map = {}

    tpm_list = []
    counts_list = []
    fpkm_list = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]{task.description}"),
        BarColumn(bar_width=None, style="black", complete_style="green"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
        transient=True
    ) as progress:

        task = progress.add_task(f"处理 {len(input_files)} 个样本...", total=len(input_files))

        for file_path in input_files:
            try:
                filename = os.path.basename(file_path)

                # Determine if this is a genes or isoforms results file
                if filename.endswith('.genes.results'):
                    index_col = 'gene_id'
                    cols_to_use = ["gene_id", "TPM", "expected_count"]
                    if output_fpkm:
                        cols_to_use.append("FPKM")
                elif filename.endswith('.isoforms.results'):
                    index_col = 'transcript_id'
                    cols_to_use = ["transcript_id", "gene_id", "TPM", "expected_count"]
                    if output_fpkm:
                        cols_to_use.append("FPKM")
                else:
                    # Default to genes format if not recognized
                    index_col = 'gene_id'
                    cols_to_use = ["gene_id", "TPM", "expected_count"]
                    if output_fpkm:
                        cols_to_use.append("FPKM")

                # 兼容 .genes.results 和 .isoforms.results
                sample_id = filename.split(".")[0]

                # 改名逻辑
                if sample_id in sample_map:
                    sample_name = sample_map[sample_id]
                    logger.debug(f"   🔄 Renaming: {sample_id} -> {sample_name}")
                else:
                    sample_name = sample_id

                df = pd.read_csv(file_path, sep="\t", index_col=index_col, usecols=cols_to_use)

                # For isoforms, we need to preserve both transcript_id and gene_id in the output
                if filename.endswith('.isoforms.results'):
                    # For isoforms, include both transcript_id and gene_id in the output
                    df_with_ids = df.reset_index()  # Reset index to include transcript_id as a column
                    tpm_df = df_with_ids[['transcript_id', 'gene_id', 'TPM']].set_index(['transcript_id', 'gene_id'])
                    counts_df = df_with_ids[['transcript_id', 'gene_id', 'expected_count']].set_index(['transcript_id', 'gene_id'])
                    tpm_df = tpm_df.rename(columns={"TPM": sample_name})
                    counts_df = counts_df.rename(columns={"expected_count": sample_name})
                    tpm_list.append(tpm_df)
                    counts_list.append(counts_df)

                    if output_fpkm:
                        fpkm_df = df_with_ids[['transcript_id', 'gene_id', 'FPKM']].set_index(['transcript_id', 'gene_id'])
                        fpkm_df = fpkm_df.rename(columns={"FPKM": sample_name})
                        fpkm_list.append(fpkm_df)
                else:
                    # For genes, use the original approach
                    tpm_list.append(df[["TPM"]].rename(columns={"TPM": sample_name}))
                    counts_list.append(df[["expected_count"]].rename(columns={"expected_count": sample_name}))
                    if output_fpkm:
                        fpkm_list.append(df[["FPKM"]].rename(columns={"FPKM": sample_name}))

                progress.advance(task)
            except Exception as e:
                logger.error(f"❌ 读取文件失败: {file_path} {e}")
                sys.exit(1)

    logger.info("📦 正在拼接矩阵...")
    os.makedirs(os.path.dirname(os.path.abspath(output_tpm)), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(output_counts)), exist_ok=True)
    if output_fpkm:
        os.makedirs(os.path.dirname(os.path.abspath(output_fpkm)), exist_ok=True)

    pd.concat(tpm_list, axis=1).to_csv(output_tpm, sep="\t")
    logger.success(f"✅ TPM 矩阵: {output_tpm}")

    pd.concat(counts_list, axis=1).to_csv(output_counts, sep="\t")
    logger.success(f"✅ Counts 矩阵: {output_counts}")

    if output_fpkm:
        pd.concat(fpkm_list, axis=1).to_csv(output_fpkm, sep="\t")
        logger.success(f"✅ FPKM 矩阵: {output_fpkm}")

# --- 核心逻辑扩展：处理目录中的所有基因结果文件 ---
def core_merge_logic_from_dir(
    input_dir: str,
    output_tpm: str,
    output_counts: str,
    output_fpkm: str = None,
    sample_map: Dict[str, str] = None,
    extension: str = ".genes.results",
    log_level: str = "INFO"
):
    # Determine log file path
    log_dir = os.path.dirname(os.path.abspath(output_tpm))
    os.makedirs(log_dir, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(log_dir, f"merge_rsem_{timestamp}.log")

    setup_logging(log_level, log_file)

    if not os.path.isdir(input_dir):
        logger.error(f"❌ 输入目录不存在: {input_dir}")
        sys.exit(1)

    # Find all files with the specified extension in the directory
    input_files = []
    for file in os.listdir(input_dir):
        if file.endswith(extension):
            input_files.append(os.path.join(input_dir, file))

    if not input_files:
        logger.error(f"❌ 在目录 {input_dir} 中未找到以 {extension} 结尾的文件！")
        sys.exit(1)

    logger.info(f"📁 找到 {len(input_files)} 个 {extension} 文件: {input_files}")

    if sample_map is None:
        sample_map = {}

    tpm_list = []
    counts_list = []
    fpkm_list = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]{task.description}"),
        BarColumn(bar_width=None, style="black", complete_style="green"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        console=console,
        transient=True
    ) as progress:

        task = progress.add_task(f"处理 {len(input_files)} 个样本...", total=len(input_files))

        for file_path in input_files:
            try:
                filename = os.path.basename(file_path)

                # Determine if this is a genes or isoforms results file
                if filename.endswith('.genes.results'):
                    index_col = 'gene_id'
                    cols_to_use = ["gene_id", "TPM", "expected_count"]
                    if output_fpkm:
                        cols_to_use.append("FPKM")
                elif filename.endswith('.isoforms.results'):
                    index_col = 'transcript_id'
                    cols_to_use = ["transcript_id", "gene_id", "TPM", "expected_count"]
                    if output_fpkm:
                        cols_to_use.append("FPKM")
                else:
                    # Default to genes format if not recognized
                    index_col = 'gene_id'
                    cols_to_use = ["gene_id", "TPM", "expected_count"]
                    if output_fpkm:
                        cols_to_use.append("FPKM")

                # 兼容 .genes.results 和 .isoforms.results
                sample_id = filename.split(".")[0]

                # 改名逻辑
                if sample_id in sample_map:
                    sample_name = sample_map[sample_id]
                    logger.debug(f"   🔄 Renaming: {sample_id} -> {sample_name}")
                else:
                    sample_name = sample_id

                df = pd.read_csv(file_path, sep="\t", index_col=index_col, usecols=cols_to_use)

                # For isoforms, we need to preserve both transcript_id and gene_id in the output
                if filename.endswith('.isoforms.results'):
                    # For isoforms, include both transcript_id and gene_id in the output
                    df_with_ids = df.reset_index()  # Reset index to include transcript_id as a column
                    tpm_df = df_with_ids[['transcript_id', 'gene_id', 'TPM']].set_index(['transcript_id', 'gene_id'])
                    counts_df = df_with_ids[['transcript_id', 'gene_id', 'expected_count']].set_index(['transcript_id', 'gene_id'])
                    tpm_df = tpm_df.rename(columns={"TPM": sample_name})
                    counts_df = counts_df.rename(columns={"expected_count": sample_name})
                    tpm_list.append(tpm_df)
                    counts_list.append(counts_df)

                    if output_fpkm:
                        fpkm_df = df_with_ids[['transcript_id', 'gene_id', 'FPKM']].set_index(['transcript_id', 'gene_id'])
                        fpkm_df = fpkm_df.rename(columns={"FPKM": sample_name})
                        fpkm_list.append(fpkm_df)
                else:
                    # For genes, use the original approach
                    tpm_list.append(df[["TPM"]].rename(columns={"TPM": sample_name}))
                    counts_list.append(df[["expected_count"]].rename(columns={"expected_count": sample_name}))
                    if output_fpkm:
                        fpkm_list.append(df[["FPKM"]].rename(columns={"FPKM": sample_name}))

                progress.advance(task)
            except Exception as e:
                logger.error(f"❌ 读取文件失败: {file_path} {e}")
                sys.exit(1)

    logger.info("📦 正在拼接矩阵...")
    os.makedirs(os.path.dirname(os.path.abspath(output_tpm)), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(output_counts)), exist_ok=True)
    if output_fpkm:
        os.makedirs(os.path.dirname(os.path.abspath(output_fpkm)), exist_ok=True)

    pd.concat(tpm_list, axis=1).to_csv(output_tpm, sep="\t")
    logger.success(f"✅ TPM 矩阵: {output_tpm}")

    pd.concat(counts_list, axis=1).to_csv(output_counts, sep="\t")
    logger.success(f"✅ Counts 矩阵: {output_counts}")

    if output_fpkm:
        pd.concat(fpkm_list, axis=1).to_csv(output_fpkm, sep="\t")
        logger.success(f"✅ FPKM 矩阵: {output_fpkm}")

# --- CLI 定义 ---
@click.group(context_settings=dict(help_option_names=['-h', '--help']))
def cli():
    """[bold cyan]RSEM 结果合并工具箱[/]"""
    pass

@cli.command(help="合并矩阵并支持重命名")
@click.option("-i", "--input", "input_files", multiple=True, required=True, help="输入 RSEM 文件")
@click.option("--tpm", required=True, help="输出 TPM 路径")
@click.option("--counts", required=True, help="输出 Counts 路径")
@click.option("--fpkm", required=False, help="输出 FPKM 路径")
@click.option("--map", "map_file", help="样本信息表 (sample.csv)")
@click.option("--log-level", default="INFO", type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR']), help="设置日志级别")
# ✨ 新增：校验列参数
@click.option(
    "--check-cols",
    multiple=True,
    default=["sample", "sample_name", "group"],
    show_default=True,
    help="sample.csv 中必须存在的列 (支持多次调用: --check-cols col1 --check-cols col2)"
)
def merge(input_files, tpm, counts, fpkm, map_file, log_level, check_cols):
    # 将 tuple 转为 list
    required = list(check_cols)
    mapping = load_map_from_csv(map_file, required_cols=required) if map_file else {}
    core_merge_logic(input_files, tpm, counts, output_fpkm=fpkm, sample_map=mapping, log_level=log_level)

@cli.command(help="从目录合并所有 RSEM 结果文件 (.genes.results 或 .isoforms.results)")
@click.option("--input-dir", required=True, help="输入目录路径，包含 RSEM 结果文件")
@click.option("--tpm", required=True, help="输出 TPM 路径")
@click.option("--counts", required=True, help="输出 Counts 路径")
@click.option("--fpkm", required=False, help="输出 FPKM 路径")
@click.option("--map", "map_file", help="样本信息表 (sample.csv)")
@click.option("--extension", default=".genes.results", type=click.Choice(['.genes.results', '.isoforms.results']), help="文件扩展名")
@click.option("--log-level", default="INFO", type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR']), help="设置日志级别")
# ✨ 新增：校验列参数
@click.option(
    "--check-cols",
    multiple=True,
    default=["sample", "sample_name", "group"],
    show_default=True,
    help="sample.csv 中必须存在的列 (支持多次调用: --check-cols col1 --check-cols col2)"
)
def merge_from_dir(input_dir, tpm, counts, fpkm, map_file, extension, log_level, check_cols):
    # 将 tuple 转为 list
    required = list(check_cols)
    mapping = load_map_from_csv(map_file, required_cols=required) if map_file else {}
    core_merge_logic_from_dir(input_dir, tpm, counts, output_fpkm=fpkm, sample_map=mapping, extension=extension, log_level=log_level)

# --- Snakemake 自动劫持 ---
if __name__ == "__main__":
    if "snakemake" in globals():
        # 获取参数
        log_level = snakemake.params.get("log_level", "INFO")

        # Check if this is the directory-based merge
        input_dir = snakemake.params.get("input_dir", None)

        # 获取必填列配置，默认为 ["sample", "sample_name", "group"]
        # 在 Snakefile 中可以通过 params.check_cols 覆盖
        req_cols = snakemake.params.get("check_cols", ["sample", "sample_name", "group"])

        # 寻找 csv 路径
        csv_path = None
        if hasattr(snakemake.input, "sample_sheet"):
            csv_path = snakemake.input.sample_sheet
        elif hasattr(snakemake.params, "sample_sheet"):
            csv_path = snakemake.params.sample_sheet

        mapping = load_map_from_csv(csv_path, required_cols=req_cols) if csv_path else {}

        output_fpkm = getattr(snakemake.output, "fpkm", None)

        if input_dir:
            # Use directory-based merging
            extension = snakemake.params.get("extension", ".genes.results")
            core_merge_logic_from_dir(
                input_dir=input_dir,
                output_tpm=snakemake.output.tpm,
                output_counts=snakemake.output.counts,
                output_fpkm=output_fpkm,
                sample_map=mapping,
                extension=extension,
                log_level=log_level
            )
        else:
            # Use file-based merging (original behavior)
            core_merge_logic(
                input_files=snakemake.input.rsem_files,
                output_tpm=snakemake.output.tpm,
                output_counts=snakemake.output.counts,
                output_fpkm=output_fpkm,
                sample_map=mapping,
                log_level=log_level
            )
    else:
        cli()