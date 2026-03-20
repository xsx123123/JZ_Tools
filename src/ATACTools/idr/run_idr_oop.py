#!/usr/bin/env python3
import sys
import shutil
import itertools
import subprocess
import argparse
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

# 引入美化与日志神器
from loguru import logger
from rich.console import Console
from rich.progress import (
    Progress, SpinnerColumn, TextColumn, BarColumn,
    TaskProgressColumn, TimeElapsedColumn, TimeRemainingColumn
)

console = Console()

class IDRBatchRunner:
    """封装 IDR 批量运行、合并及原始 Peak 提取的终极核心类"""
    
    def __init__(self, args):
        self.inputs = [Path(f) for f in args.inputs]
        self.out_dir = Path(args.outdir)
        self.threads = args.threads
        
        # 1. 初始化工作空间并配置日志
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self._setup_logger()
        
        # 2. 运行环境依赖全面检查 (预判拦截)
        self._check_dependencies()

    def _setup_logger(self):
        """配置并返回日志文件路径"""
        logger.remove()
        logger.add(
            sys.stderr, 
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>", 
            level="INFO"
        )
        log_file = self.out_dir / "idr_pipeline.log"
        logger.add(
            log_file, 
            rotation="10 MB", 
            level="DEBUG", 
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {message}"
        )
        return log_file

    def _check_dependencies(self):
        """检查所有必需的外部软件 (idr, bedtools, awk, sort)"""
        missing_tools = []
        for tool in ["idr", "bedtools", "awk", "sort"]:
            if shutil.which(tool) is None:
                missing_tools.append(tool)
                
        if missing_tools:
            console.print(f"\n[bold red]❌ 致命错误：当前环境中缺失以下核心工具：{', '.join(missing_tools)}[/bold red]")
            console.print("[yellow]💡 排查建议：请确保激活了正确的 conda 环境，或安装缺失的工具。[/yellow]\n")
            sys.exit(1)
        else:
            logger.info("✅ 依赖检查通过：已就绪所有必需的分析套件。")

    def _run_single_idr(self, pair):
        """独立的工作节点：处理单个两两比对任务"""
        file1, file2 = pair
        name1 = file1.name.replace("_peaks.narrowPeak", "").replace(".narrowPeak", "")
        name2 = file2.name.replace("_peaks.narrowPeak", "").replace(".narrowPeak", "")
        
        out_prefix = self.out_dir / f"{name1}_vs_{name2}"
        
        cmd = [
            "idr",
            "--samples", str(file1), str(file2),
            "--input-file-type", "narrowPeak",
            "--rank", "p.value",
            "--output-file", f"{out_prefix}.idr",
            "--plot",
            "--log-output-file", f"{out_prefix}.idr.log"
        ]
        
        logger.debug(f"准备执行 IDR: {' '.join(cmd)}")
        
        try:
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            logger.debug(f"[{name1} vs {name2}] 比对成功。")
            return True, name1, name2
        except subprocess.CalledProcessError as e:
            logger.error(f"[{name1} vs {name2}] 比对失败！STDERR:\n{e.stderr}")
            return False, name1, name2

    def _merge_consensus_peaks(self):
        """将所有合格的 IDR 结果合并为最终的高置信度 Consensus Peaks"""
        final_bed = self.out_dir / "Final_Consensus_Peaks.bed"
        logger.info("🧬 阶段二：开始提取高置信度 Peak (IDR < 0.05) 并融合物理坐标...")

        # 拼接 Bash 管道命令，提取 IDR >= 1.30 (即 p < 0.05) 的区域并合并
        cmd = 'cat ' + str(self.out_dir) + '/*.idr | awk \'$12 >= 1.30 {print $1"\\t"$2"\\t"$3}\' | sort -k1,1 -k2,2n | bedtools merge > ' + str(final_bed)
        
        try:
            subprocess.run(cmd, shell=True, check=True, executable='/bin/bash')
            
            # 统计生成的 Peak 数量
            wc_result = subprocess.run(f"wc -l {final_bed}", shell=True, capture_output=True, text=True)
            peak_count = wc_result.stdout.strip().split()[0]
            logger.info(f"✅ 合并完成！共提取到 {peak_count} 个高置信度共识 Peak。")
            
            # 核心串联：合并成功后，立刻去提取各样本的原始详细 Peak 数据
            self._extract_original_peaks(final_bed)
            
        except subprocess.CalledProcessError:
            logger.error("❌ 合并 Peak 时发生错误！请检查 idr 结果文件格式。")
            console.print("[bold red]❌ Peak 合并失败，流水线中止。[/bold red]")

    def _extract_original_peaks(self, final_bed):
        """利用最终的 BED 文件去原样本中捞取保留统计信息的 Peak 行"""
        logger.info("🎯 阶段三：开始利用共识 Peak 回捞各样本的原始高质量窄峰数据...")
        
        success_count = 0
        for input_file in self.inputs:
            stem_name = input_file.name.replace(".narrowPeak", "")
            out_file = self.out_dir / f"{stem_name}.idr.narrowPeak"
            
            # 使用 bedtools intersect 获取交集原始行，-u 防止跨越区间导致的重复行
            cmd = f"bedtools intersect -a {input_file} -b {final_bed} -wa -u > {out_file}"
            logger.debug(f"提取命令: {cmd}")
            
            try:
                subprocess.run(cmd, shell=True, check=True, executable='/bin/bash')
                success_count += 1
            except subprocess.CalledProcessError:
                logger.error(f"❌ 提取 {input_file.name} 的原始数据失败！")

        if success_count == len(self.inputs):
            logger.info(f"✅ 所有 {len(self.inputs)} 个样本的高质量 Peak 均已成功回捞！")
            console.print(f"\n[bold green]🎉 流水线圆满收官！所有结果已安全存放在：{self.out_dir.absolute()}[/bold green]\n")
        else:
            logger.warning(f"⚠️ 提取完成，但有 {len(self.inputs) - success_count} 个文件处理失败。")

    def execute(self):
        """执行主调度逻辑"""
        logger.info(f"🚀 阶段一：启动批量 IDR 任务，接收到 {len(self.inputs)} 个样本")
        
        pairs = list(itertools.combinations(self.inputs, 2))
        total_tasks = len(pairs)
        logger.info(f"📊 共有 {total_tasks} 个比对任务，启用 {self.threads} 个并发进程...")

        success_count = 0

        # 渲染进度条
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            TimeRemainingColumn(),
            console=console,
            transient=False
        ) as progress:
            
            task_id = progress.add_task("[cyan]IDR 并行计算中...", total=total_tasks)
            
            with ProcessPoolExecutor(max_workers=self.threads) as executor:
                future_to_pair = {executor.submit(self._run_single_idr, pair): pair for pair in pairs}
                
                for future in as_completed(future_to_pair):
                    success, n1, n2 = future.result()
                    if success:
                        success_count += 1
                    progress.advance(task_id)

        # 判定阶段一是否全部成功，决定是否放行后续流程
        if success_count == total_tasks:
            logger.info("✨ 并发比对全部成功完成！自动进入后续合并与提取阶段...")
            self._merge_consensus_peaks()
        else:
            logger.warning(f"⚠️ 由于有任务失败 ({success_count}/{total_tasks})，已自动阻断后续合并步骤。请查看日志排查。")

def main():
    parser = argparse.ArgumentParser(description="🧬 端到端全自动：多进程 IDR 分析、合并及数据回捞工具")
    parser.add_argument("-i", "--inputs", nargs='+', required=True, help="输入的 narrowPeak 文件列表 (至少2个)")
    parser.add_argument("-o", "--outdir", default="idr_results", help="输出结果目录 (默认: idr_results)")
    parser.add_argument("-t", "--threads", type=int, default=1, help="并发运行的进程数 (建议设置为 CPU 核心数的一半)")
    
    args = parser.parse_args()

    if len(args.inputs) < 2:
        console.print("[bold red]❌ 错误: 至少需要输入 2 个 narrowPeak 文件！[/bold red]")
        sys.exit(1)

    runner = IDRBatchRunner(args)
    runner.execute()

if __name__ == "__main__":
    main()