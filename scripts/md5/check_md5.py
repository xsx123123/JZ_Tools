#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import hashlib
import os
import sys
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from loguru import logger

# ================= 全局配置 =================
# 1. 重置 Loguru
logger.remove()

# 2. 【仅配置控制台输出】
# 这一步可以保留在这里，因为控制台输出不涉及创建文件，
# 即使是 -h 或者是报错，我们也希望看到控制台有反应（虽然 argparse 自己会打印）。
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{message}</level>", level="INFO")
# ===========================================

def calculate_md5(file_path, chunk_size=8192):
    md5 = hashlib.md5()
    try:
        with open(file_path, 'rb') as f:
            while chunk := f.read(chunk_size):
                md5.update(chunk)
        return md5.hexdigest()
    except Exception as e:
        return None

def verify_task(expected_md5, filename):
    filename = filename.strip()
    if not os.path.exists(filename):
        return filename, "MISSING", None, expected_md5
    real_md5 = calculate_md5(filename)
    if real_md5 is None:
        return filename, "ERROR", None, expected_md5
    if real_md5 == expected_md5:
        return filename, "SUCCESS", real_md5, expected_md5
    else:
        return filename, "FAIL", real_md5, expected_md5

def main():
    # 1. 先处理参数解析
    parser = argparse.ArgumentParser(description="批量 MD5 校验工具 (Loguru 日志版)")
    parser.add_argument("-f", "--file", type=str, required=True, help="【必须】包含 MD5 和文件名的列表文件")
    parser.add_argument("-t", "--threads", type=int, default=4, help="并发线程数 (默认: 4)")
    
    # 【关键点】：在这里解析参数
    # 如果用户输入 -h，或者没输 -f，程序会在这里直接 print 帮助信息并退出 (sys.exit)
    # 此时，后面的 logger.add 还没执行，所以不会创建文件。
    args = parser.parse_args()

    # ---------------------------------------------------------
    # 2. 参数检查通过后，再开启文件日志
    # ---------------------------------------------------------
    logger.add(
        "check_md5_{time:YYYY-MM-DD}.log", 
        rotation="00:00", 
        retention="1 week", 
        encoding="utf-8", 
        level="DEBUG"
    )

    md5_file = args.file
    max_threads = args.threads

    logger.info(f"🚀 开始校验任务")
    logger.info(f"📄 校验列表: {md5_file}")
    logger.info(f"🧵 线程数量: {max_threads}")

    if not os.path.exists(md5_file):
        logger.error(f"❌ 找不到指定的 MD5 列表文件: {md5_file}")
        sys.exit(1)

    tasks_data = []
    try:
        with open(md5_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line: continue
                parts = line.split()
                if len(parts) >= 2:
                    expected = parts[0]
                    fname = " ".join(parts[1:])
                    tasks_data.append((expected, fname))
                else:
                    logger.warning(f"⚠️ 跳过格式错误的行 ({line_num}): {line}")
    except Exception as e:
        logger.error(f"❌ 读取列表文件出错: {str(e)}")
        sys.exit(1)

    if not tasks_data:
        logger.error("❌ 列表中没有提取到有效的文件信息。")
        sys.exit(1)

    total_files = len(tasks_data)
    logger.info(f"📊 待校验文件数: {total_files}")

    results = {"SUCCESS": 0, "FAIL": 0, "MISSING": 0, "ERROR": 0}

    with ThreadPoolExecutor(max_workers=max_threads) as executor:
        future_to_file = {
            executor.submit(verify_task, md5, name): name 
            for md5, name in tasks_data
        }

        for future in as_completed(future_to_file):
            name, status, real_md5, expected_md5 = future.result()
            
            if status == "SUCCESS":
                logger.success(f"校验通过: {name}")
                results["SUCCESS"] += 1
            elif status == "MISSING":
                logger.error(f"文件丢失: {name}")
                results["MISSING"] += 1
            elif status == "FAIL":
                logger.critical(f"MD5 不匹配: {name}")
                logger.critical(f"   -> 预期: {expected_md5}")
                logger.critical(f"   -> 实际: {real_md5}")
                results["FAIL"] += 1
            else:
                logger.error(f"读取错误: {name}")
                results["ERROR"] += 1

    logger.info("-" * 30)
    logger.info(f"🏁 校验结束 | 通过: {results['SUCCESS']} | 失败: {results['FAIL']} | 丢失: {results['MISSING']}")

    if results['FAIL'] > 0 or results['MISSING'] > 0 or results['ERROR'] > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()