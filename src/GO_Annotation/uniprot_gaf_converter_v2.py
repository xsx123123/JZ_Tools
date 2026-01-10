#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
UniProt GAF to Gene ID Converter (Robust Version)
功能: 
1. 解析 GAF 获取 UniProt ID 和 GO 注释
2. 调用 UniProt API 将 ID 转换为 Ensembl/Entrez ID
3. 自动去除 ID 版本后缀 (如 .1)
4. 输出包含 Gene Description 的最终表格
"""

import sys
import time
import requests
import argparse
import re
from loguru import logger
from requests.adapters import HTTPAdapter, Retry

# 配置 Loguru 日志格式
logger.remove()
logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>")

# UniProt API 基础地址
API_URL = "https://rest.uniprot.org/idmapping"

def get_session():
    """创建一个带有自动重试机制的 HTTP Session"""
    session = requests.Session()
    # 针对 500, 502, 503, 504 错误自动重试 5 次
    retries = Retry(total=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session

def parse_gaf_source_ids(gaf_path):
    """
    解析 GAF 文件
    Returns:
        unique_ids: 用于提交 API 的去重 ID 列表
        annotations: [(uniprot_id, go_id), ...] 原始注释关系
        descriptions: {uniprot_id: description} 描述信息字典
    """
    logger.info(f"正在解析 GAF 文件: {gaf_path}")
    unique_ids = set()
    annotations = []
    descriptions = {} 
    
    with open(gaf_path, 'r') as f:
        for line in f:
            if line.startswith('!'): continue
            parts = line.strip().split('\t')
            
            # GAF 2.2 标准: 至少要有 15-17 列，我们用到第 10 列 (index 9)
            if len(parts) < 10: continue
                
            u_id = parts[1] # Col 2: DB_Object_ID (UniProt ID)
            go_id = parts[4] # Col 5: GO ID
            desc = parts[9] # Col 10: DB_Object_Name (Description)
            
            # 只处理 UniProtKB 来源的数据
            if parts[0] != 'UniProtKB': continue

            unique_ids.add(u_id)
            annotations.append((u_id, go_id))
            
            # 记录描述信息 (保留遇到的第一个描述)
            if u_id not in descriptions:
                descriptions[u_id] = desc
            
    logger.info(f"解析完成，共提取 {len(annotations)} 条注释，涉及 {len(unique_ids)} 个 UniProt ID")
    return list(unique_ids), annotations, descriptions

def submit_id_mapping(from_db, to_db, ids):
    """提交 ID Mapping 任务"""
    session = get_session()
    response = session.post(
        f"{API_URL}/run",
        data={"from": from_db, "to": to_db, "ids": ",".join(ids)}
    )
    response.raise_for_status()
    job_id = response.json()["jobId"]
    return job_id

def wait_for_job(job_id):
    """轮询任务状态直到完成"""
    session = get_session()
    while True:
        response = session.get(f"{API_URL}/status/{job_id}")
        response.raise_for_status()
        j = response.json()
        
        status = j.get("jobStatus")
        if status in ["RUNNING", "NEW"]:
            logger.debug(f"UniProt 正在处理任务... ({status})")
            time.sleep(5)
        elif status == "FINISHED":
            logger.success("任务处理完成！")
            return True
        elif status == "FAILED":
            logger.error(f"UniProt 任务失败: {j}")
            sys.exit(1)
        else:
            # 某些情况下如果没有 status 字段但有 results，也是成功
            if "results" in j or "facets" in j: return True
            time.sleep(5)

def get_next_link(headers):
    """解析分页 Link Header 用于翻页"""
    if "Link" not in headers:
        return None
    re_next = re.search(r'<(.+)>; rel="next"', headers["Link"])
    if re_next:
        return re_next.group(1)
    return None

def parse_tsv_lines(lines_iter, mapped_dict):
    """辅助函数：解析 TSV 数据流"""
    is_header = True
    for line in lines_iter:
        if not line: continue
        line = line.strip()
        
        # 简单的表头检测
        if is_header:
            if line.startswith("From") and "To" in line:
                is_header = False
                continue
            is_header = False 
        
        parts = line.split('\t')
        if len(parts) >= 2:
            u_id = parts[0]
            target_id = parts[1]
            if u_id not in mapped_dict:
                mapped_dict[u_id] = []
            mapped_dict[u_id].append(target_id)

def fetch_results(job_id):
    """
    获取结果 - 双重策略：
    1. 优先尝试 Stream (速度快)
    2. 如果 Stream 404 (尚未准备好)，自动回退到 Pagination (最稳健)
    """
    session = get_session()
    mapped_dict = {}
    
    # 策略 A: Stream 接口
    stream_url = f"{API_URL}/results/stream/{job_id}?format=tsv"
    logger.info("尝试流式下载结果 (Stream)...")
    
    try:
        with session.get(stream_url, stream=True, allow_redirects=True) as response:
            if response.status_code == 200:
                lines = response.iter_lines(decode_unicode=True)
                parse_tsv_lines(lines, mapped_dict)
                return mapped_dict
            elif response.status_code == 404:
                logger.warning("Stream 接口返回 404，正在切换到分页模式 (Pagination)...")
            else:
                response.raise_for_status()
    except Exception as e:
        logger.warning(f"Stream 下载异常: {e}，尝试切换分页模式...")

    # 策略 B: Pagination (分页)
    logger.info("正在使用分页模式下载所有结果...")
    batch_url = f"{API_URL}/results/{job_id}?format=tsv&size=500"
    
    while batch_url:
        with session.get(batch_url) as response:
            response.raise_for_status()
            lines = response.text.strip().split('\n')
            parse_tsv_lines(lines, mapped_dict)
            
            batch_url = get_next_link(response.headers)
            if batch_url:
                logger.debug("下载下一页...")
    
    return mapped_dict

def main():
    parser = argparse.ArgumentParser(description="GAF UniProt -> Gene ID Converter (V4.0)")
    parser.add_argument("-i", "--input", required=True, help="输入的 human GAF 文件")
    parser.add_argument("-o", "--output", required=True, help="输出文件路径")
    parser.add_argument("--to-db", default="Ensembl", choices=["Ensembl", "GeneID", "Ensembl_Genomes"], 
                        help="目标数据库 (Human用Ensembl, Plants用Ensembl_Genomes)")
    
    args = parser.parse_args()

    # 1. 解析 GAF
    uniprot_ids, raw_annotations, descriptions = parse_gaf_source_ids(args.input)
    
    if not uniprot_ids:
        logger.error("未找到有效的 UniProt ID")
        sys.exit(1)

    # 2. 提交转换任务
    logger.info(f"正在向 UniProt 提交 {len(uniprot_ids)} 个 ID 进行转换 ({args.to_db})...")
    job_id = submit_id_mapping("UniProtKB_AC-ID", args.to_db, uniprot_ids)
    
    # 等待完成
    wait_for_job(job_id)
    
    # 强制冷却 5秒，给服务器喘息时间
    logger.info("等待服务器同步数据 (5s)...")
    time.sleep(5)
    
    # 3. 下载结果 (自动处理 404)
    mapping_dict = fetch_results(job_id)

    logger.info(f"成功映射了 {len(mapping_dict)} 个 UniProt ID")

    # 4. 输出最终文件
    logger.info("正在写入最终文件 (自动去除版本后缀)...")
    
    with open(args.output, 'w') as out:
        # 写入表头
        out.write(f"Gene_ID\tGO_ID\tDescription\tOriginal_UniProt\n")
        
        count = 0
        skipped = 0
        
        for u_id, go_id in raw_annotations:
            desc_text = descriptions.get(u_id, "NA")
            
            if u_id in mapping_dict:
                target_ids = mapping_dict[u_id]
                for tid in target_ids:
                    # 【核心功能】去除版本后缀
                    # 例如: ENSG00000123.1 -> ENSG00000123
                    clean_tid = tid.split('.')[0]
                    
                    out.write(f"{clean_tid}\t{go_id}\t{desc_text}\t{u_id}\n")
                    count += 1
            else:
                skipped += 1

    logger.success(f"处理完成！结果已保存至: {args.output}")
    logger.info(f"  - 生成有效条目: {count}")
    logger.info(f"  - 未映射 ID 数: {skipped}")

if __name__ == "__main__":
    main()