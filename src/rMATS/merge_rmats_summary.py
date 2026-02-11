#!/usr/bin/env python3
import pandas as pd
import os
import argparse
import sys
import warnings
from loguru import logger
from rich.console import Console

# 忽略不必要的警告，保持界面清爽
warnings.simplefilter(action='ignore', category=FutureWarning)

# --- 极简紫色日志 ---
logger.remove()
logger.add(sys.stderr, format="<magenta>[{level}]</magenta> <white>{message}</white>", level="INFO")
console = Console()

def get_args():
    parser = argparse.ArgumentParser(description="rMATS Final Perfect Merger")
    parser.add_argument("-i", "--input_dir", required=True)
    parser.add_argument("-o", "--output", default="details_rmats.txt")
    parser.add_argument("-m", "--mode", choices=['summary', 'details'], default='details')
    parser.add_argument("--fdr", type=float, default=0.05)
    parser.add_argument("--psi", type=float, default=0.1)
    parser.add_argument("--min_reads", type=int, default=10)
    return parser.parse_args()

def robust_sum(val):
    if pd.isna(val): return 0
    if isinstance(val, (int, float)): return val
    try:
        return sum(float(x) for x in str(val).split(',') if x.strip() and x.strip().upper() != 'NA')
    except:
        return 0

def process_robust_details(name, path, fdr, psi, min_reads):
    event_types = ['SE', 'MXE', 'A3SS', 'A5SS', 'RI']
    all_extracted = []
    stats = {et: {'up': 0, 'down': 0, 'total': 0, 'is_pair': False} for et in event_types}
    
    for et in event_types:
        file_path = os.path.join(path, f"{et}.MATS.JC.txt")
        if not os.path.exists(file_path): continue
        
        try:
            df = pd.read_csv(file_path, sep='\t', low_memory=False)
            if df.empty: continue
            
            # 使用新的 .map 替代 .applymap 消除告警
            ijc_cols = [c for c in df.columns if 'IJC' in c]
            sjc_cols = [c for c in df.columns if 'SJC' in c]
            total_reads = df[ijc_cols + sjc_cols].map(robust_sum).sum(axis=1)
            
            has_fdr = 'FDR' in df.columns and df['FDR'].notnull().any()
            
            if has_fdr:
                df['FDR_num'] = pd.to_numeric(df['FDR'], errors='coerce')
                df['Diff_num'] = pd.to_numeric(df['IncLevelDifference'], errors='coerce')
                mask = (df['FDR_num'] < fdr) & (df['Diff_num'].abs() > psi) & (total_reads >= min_reads)
                filtered = df[mask].copy()
                stats[et] = {'is_pair': True, 'up': (filtered['Diff_num'] > 0).sum(), 'down': (filtered['Diff_num'] < 0).sum(), 'total': len(filtered)}
            else:
                mask = (total_reads >= min_reads)
                filtered = df[mask].copy()
                stats[et] = {'is_pair': False, 'total': len(filtered)}

            if not filtered.empty:
                filtered.insert(0, 'EventType', et)
                filtered.insert(0, 'Comparison', name)
                all_extracted.append(filtered)
        except:
            continue
    return (pd.concat(all_extracted, ignore_index=True) if all_extracted else None, stats)

def main():
    args = get_args()
    target_dirs = [root for root, _, files in os.walk(args.input_dir) if "SE.MATS.JC.txt" in files]
    if not target_dirs: return logger.error("未找到结果目录")

    logger.info(f"深度扫描中... 发现 {len(target_dirs)} 个目录")
    
    final_list = []
    summary_data = [] 
    
    for path in target_dirs:
        name = os.path.basename(path)
        if name in ['tmp', 'split_dot_rmats']: name = os.path.basename(os.path.dirname(path))
        df_res, stats = process_robust_details(name, path, args.fdr, args.psi, args.min_reads)
        
        if df_res is not None:
            final_list.append(df_res)
            
        console.print(f"\n[bold magenta]▶ {name}[/bold magenta]")
        for et, s in stats.items():
            if s.get('is_pair'):
                count = s['up'] + s['down']
                summary_data.append({'Comparison': name, 'EventType': et, 'Total': count, 'Up': s['up'], 'Down': s['down']})
                if count > 0: console.print(f"  [magenta]├─ {et:5}[/magenta]: {count:4} (Up:{s['up']}, Down:{s['down']})")
            elif s.get('total', 0) >= 0: 
                summary_data.append({'Comparison': name, 'EventType': et, 'Total': s.get('total', 0), 'Up': 0, 'Down': 0})
                if s.get('total', 0) > 0:
                    console.print(f"  [magenta]├─ {et:5}[/magenta]: {s.get('total'):4} detected")

    # --- 核心逻辑分支：根据模式控制输出 ---
    if args.mode == 'summary':
        if summary_data:
            df_summary = pd.DataFrame(summary_data)
            df_summary.to_csv(args.output, sep='\t', index=False)
            console.print(f"\n[bold white on magenta] DONE [/bold white on magenta] 汇总完毕 (Summary Mode): [underline]{os.path.abspath(args.output)}[/underline]\n")
        else:
            logger.warning("没有可汇总的数据。")
            
    elif args.mode == 'details':
        if final_list:
            pd.concat(final_list, axis=0, ignore_index=True, sort=False).to_csv(args.output, sep='\t', index=False)
            console.print(f"\n[bold white on magenta] DONE [/bold white on magenta] 汇总完毕 (Details Mode): [underline]{os.path.abspath(args.output)}[/underline]\n")

if __name__ == "__main__":
    main()