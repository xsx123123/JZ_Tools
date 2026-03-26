import argparse
import os
import sys

try:
    from loguru import logger
    from rich.console import Console
    from rich.progress import (
        Progress,
        SpinnerColumn,
        TextColumn,
        BarColumn,
        TaskProgressColumn,
    )
    from rich.table import Table
except ImportError as e:
    print(f"请先安装依赖：pip install loguru rich")
    exit(1)

console = Console()

# 配置 loguru
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
    level="INFO",
    colorize=True,
)


def count_data_lines(file_path):
    count = 0
    with open(file_path, "r", encoding="utf-8") as f:
        header_skip = False
        for line in f:
            line = line.strip()
            if not line:
                continue
            if not header_skip:
                header_skip = True
                continue
            count += 1
    return count


def preview_result(output_path, preview_rows=5):
    table = Table(title="结果预览（前5行）", show_header=True, header_style="bold")
    with open(output_path, "r", encoding="utf-8") as f:
        header = f.readline().strip().split("\t")
        for col in header:
            table.add_column(col, justify="center")
        for idx, line in enumerate(f):
            if idx >= preview_rows:
                break
            line = line.strip()
            if not line:
                continue
            table.add_row(*line.split("\t"))
    console.print(table)


def main():
    parser = argparse.ArgumentParser(description="VCFtools杂合率计算工具")
    parser.add_argument(
        "-i", "--input", required=True, help="输入vcftools het结果文件路径"
    )
    parser.add_argument("-o", "--output", required=True, help="输出结果文件路径")
    parser.add_argument(
        "-d", "--decimals", type=int, default=6, help="杂合率保留小数位数，默认6位"
    )
    args = parser.parse_args()

    # 去掉了花里胡哨的欢迎面板，只留极简启动提示
    logger.info("启动杂合率计算程序...")

    if not os.path.exists(args.input):
        logger.error(f"输入文件 {args.input} 不存在")
        exit(1)

    format_str = f"%.{args.decimals}f"
    total_data_lines = count_data_lines(args.input)
    if total_data_lines == 0:
        logger.error("输入文件无有效数据行")
        exit(1)

    # 进度条保留（实用功能不删）
    with (
        open(args.input, "r", encoding="utf-8") as f_in,
        open(args.output, "w", encoding="utf-8") as f_out,
    ):
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(bar_width=30),
            TaskProgressColumn(),
            console=console,
            transient=True,  # 进度条完成后自动消失，不占终端空间
        ) as progress:
            task = progress.add_task(f"处理中...", total=total_data_lines)

            # 处理表头
            header = f_in.readline().strip()
            while header == "":
                header = f_in.readline().strip()
            f_out.write(f"{header}\tHo(观测杂合率)\tHe(期望杂合率)\n")

            # 逐行处理
            for line_num, line in enumerate(f_in, start=2):
                line = line.strip()
                if not line:
                    continue
                fields = line.split()
                if len(fields) != 5:
                    logger.warning(f"第{line_num}行格式异常，已跳过")
                    progress.advance(task)
                    continue
                try:
                    o_hom = int(fields[1])
                    e_hom = float(fields[2])
                    n_sites = int(fields[3])
                except ValueError:
                    logger.warning(f"第{line_num}行数值异常，已跳过")
                    progress.advance(task)
                    continue

                ho = (
                    "NA" if n_sites == 0 else format_str % ((n_sites - o_hom) / n_sites)
                )
                he = "NA" if n_sites == 0 else format_str % (1 - e_hom / n_sites)

                f_out.write(f"{line}\t{ho}\t{he}\n")
                progress.advance(task)

    # 预览结果
    preview_result(args.output)

    # 去掉了大绿框，只留简洁成功提示
    logger.success(f"计算完成，结果已保存到：{os.path.abspath(args.output)}")


if __name__ == "__main__":
    main()
