#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
import glob
import argparse
from pathlib import Path

from loguru import logger
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich import box

# 初始化 Rich Console
console = Console()

# 配置 Loguru: 
# 1. 移除默认 handler (防止不必要的屏幕输出干扰 Rich 表格)
logger.remove()
# 2. 添加 stderr handler，只显示 critical 级别的系统错误
logger.add(sys.stderr, format="<level>{message}</level>", level="CRITICAL")

def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description="FastQ Screen 配置文件路径及完整性校验工具",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "conf", 
        help="fastq_screen.conf 配置文件的路径"
    )
    # 新增 log 参数
    parser.add_argument(
        "--log", "-l",
        help="指定日志文件的输出路径 (可选)",
        default=None
    )
    return parser.parse_args()

def strip_markup(text):
    """移除 Rich 的颜色标记，返回纯文本 (用于写入日志文件)"""
    return Text.from_markup(text).plain

def check_software_path(name, path):
    """
    检查软件路径是否有效且可执行
    Returns: (is_valid, message_with_color)
    """
    p = Path(path)
    if not p.exists():
        return False, f"[red]路径不存在[/red]"
    if not os.access(p, os.X_OK):
        return False, f"[yellow]无执行权限[/yellow]"
    return True, f"[green]有效[/green]"

def check_database_path(name, path_prefix):
    """
    检查数据库索引是否存在
    Returns: (is_valid, message_with_color)
    """
    # 1. 检查目录是否存在
    db_dir = os.path.dirname(path_prefix)
    if not os.path.isdir(db_dir):
        return False, f"[red]目录不存在: {db_dir}[/red]"
    
    # 2. 检查索引文件
    search_pattern = f"{path_prefix}*"
    found_files = [f for f in glob.glob(search_pattern) if os.path.isfile(f)]
    
    if not found_files:
        return False, f"[red]未找到索引文件 (Basename: {os.path.basename(path_prefix)})[/red]"
    
    return True, f"[green]有效 (索引文件数: {len(found_files)})[/green]"

def validate_conf(conf_path):
    """主校验逻辑"""
    conf_file = Path(conf_path)
    
    if not conf_file.exists():
        msg = f"配置文件未找到: {conf_path}"
        logger.critical(msg)
        # 如果还没法写日志(因为还没解析参数)，直接打印并退出
        print(f"❌ {msg}") 
        sys.exit(1)

    logger.info(f"开始检查配置文件: {conf_file.absolute()}")

    # 支持检查的软件关键字
    ALIGNER_KEYS = {'BOWTIE', 'BOWTIE2', 'BWA', 'MINIMAP2', 'BISMARK'}
    
    has_error = False
    
    # 创建 Rich 表格
    table = Table(title=f"FastQ Screen 配置检查报告\n{conf_file.name}", box=box.ROUNDED)
    table.add_column("行号", justify="right", style="cyan", no_wrap=True)
    table.add_column("类型", style="magenta")
    table.add_column("名称", style="bold white")
    table.add_column("路径/前缀", style="dim")
    table.add_column("状态", justify="center")
    table.add_column("详情")

    with open(conf_file, 'r') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            parts = line.split()
            if len(parts) < 2:
                continue
            
            key = parts[0].upper()
            
            # 准备数据容器
            item_type = ""
            name = ""
            path = ""
            is_valid = False
            msg_colored = ""

            # --- 1. 检查软件路径 ---
            if key in ALIGNER_KEYS:
                item_type = "SOFTWARE"
                name = key
                path = parts[1]
                is_valid, msg_colored = check_software_path(name, path)

            # --- 2. 检查数据库索引 ---
            elif key == 'DATABASE':
                item_type = "DATABASE"
                path = parts[-1]
                name = parts[1] if len(parts) > 2 else "Unknown"
                is_valid, msg_colored = check_database_path(name, path)

            # 如果匹配到了检查项，则添加到表格并记录日志
            if item_type:
                status_icon = "✅" if is_valid else "❌"
                if not is_valid: has_error = True
                
                # 1. 添加到屏幕表格 (保留颜色)
                table.add_row(
                    str(line_num), item_type, name, path, status_icon, msg_colored
                )

                # 2. 记录到日志文件 (去除颜色，格式化文本)
                plain_msg = strip_markup(msg_colored)
                log_content = f"Line {line_num} | {item_type:<8} | {name:<15} | {path} | {plain_msg}"
                
                if is_valid:
                    logger.info(log_content)
                else:
                    logger.error(log_content)

    # 屏幕打印表格
    console.print(table)
    
    # 最终汇总
    if has_error:
        fail_msg = "检测到配置错误，请根据表格或日志修正 fastq_screen.conf"
        console.print(Panel(fail_msg, title="FAILED", style="bold red"))
        logger.error(f"检查结束: 失败 - {fail_msg}")
        sys.exit(1)
    else:
        success_msg = "所有配置路径均有效，可以放心运行！"
        console.print(Panel(success_msg, title="SUCCESS", style="bold green"))
        logger.success(f"检查结束: 通过 - {success_msg}")
        sys.exit(0)

def main():
    args = parse_args()
    
    # 配置日志文件输出
    if args.log:
        # 添加 File Handler
        # rotation="1 MB" 表示如果日志超过1MB自动分割，retention保留旧日志
        logger.add(
            args.log, 
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}", 
            level="INFO",
            encoding="utf-8",
            rotation="10 MB",
            mode="w" # 每次运行覆盖旧日志，如果想追加改成 "a"
        )
    
    try:
        validate_conf(args.conf)
    except Exception as e:
        logger.exception(f"发生未预期的错误: {e}")
        console.print_exception() # Rich 会在屏幕打印漂亮的 Traceback
        sys.exit(1)

if __name__ == "__main__":
    main()