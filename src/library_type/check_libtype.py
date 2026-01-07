#!/usr/bin/env python3
import sys
import os

def parse_rseqc(filepath):
    """解析 RSeQC 汇总文件，返回 fr-firststrand / fr-secondstrand / fr-unstranded"""
    first_strand_scores = []
    second_strand_scores = []
    
    try:
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                # 解析 RSeQC 输出格式
                if '"1+-,1-+,2++,2--"' in line or '"+-,-+"' in line: # First Strand Evidence
                    val = float(line.split(':')[-1].strip())
                    first_strand_scores.append(val)
                elif '"1++,1--,2+-,2-+"' in line or '"++,--"' in line: # Second Strand Evidence
                    val = float(line.split(':')[-1].strip())
                    second_strand_scores.append(val)

        if not first_strand_scores and not second_strand_scores:
            return "fr-unstranded"

        avg_first = sum(first_strand_scores) / len(first_strand_scores) if first_strand_scores else 0
        avg_second = sum(second_strand_scores) / len(second_strand_scores) if second_strand_scores else 0

        # 阈值判定 (0.75)
        if avg_first > 0.75:
            return "fr-firststrand"
        elif avg_second > 0.75:
            return "fr-secondstrand"
        else:
            return "fr-unstranded"
            
    except Exception:
        return "fr-unstranded" # 默认回退

def main():
    # 参数接收
    # 1. RSeQC 汇总文件路径
    # 2. 用户在 Config 里的配置 (例如 "fr-firststrand" 或 "auto")
    # 3. 警告文件输出路径
    if len(sys.argv) < 4:
        print("fr-unstranded")
        return

    rseqc_file = sys.argv[1]
    user_config = sys.argv[2].strip()
    warn_file = sys.argv[3]

    # 1. 执行自动检测
    detected_type = parse_rseqc(rseqc_file)

    # 2. 对比逻辑
    # 如果用户填了 "auto" 或者 ""，我们认为用户完全信任检测，不报错
    is_conflict = False
    if user_config and user_config.lower() != "auto":
        if user_config != detected_type:
            is_conflict = True

    # 3. 处理警告文件
    if is_conflict:
        with open(warn_file, 'w') as w:
            w.write("="*40 + "\n")
            w.write("⚠️  WARNING: Library Type Mismatch!\n")
            w.write("="*40 + "\n")
            w.write(f"User Configured: {user_config}\n")
            w.write(f"Auto Detected:   {detected_type}\n")
            w.write("-" * 40 + "\n")
            w.write(f"Action: Pipeline will use detected type '{detected_type}' for rMATS.\n")
            w.write("Please check your library prep kit or config file.\n")
    else:
        # 如果没有冲突，最好删掉旧的警告文件(如果存在)，或者留一个空文件/OK文件
        # 这里选择：如果没有冲突，就不生成WARN文件，或者生成一个内容为OK的文件
        with open(warn_file, 'w') as w:
            w.write(f"OK. Config matches Detected ({detected_type}).\n")

    # 4. 【关键】将最终决定的类型打印到 stdout，供 shell 变量捕获
    print(detected_type)

if __name__ == "__main__":
    main()