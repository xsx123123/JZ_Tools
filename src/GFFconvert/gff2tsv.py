#!/usr/bin/env python3
import argparse
import csv
import sys
import urllib.parse
from loguru import logger


logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
)

def parse_attributes(attr_str):
    """
    解析 GFF 第9列的属性信息，返回一个字典。
    例如: "ID=gene01;Name=EDEN;Note=Something" -> {'ID': 'gene01', 'Name': 'EDEN', 'Note': 'Something'}
    """
    attr_dict = {}
    if not attr_str or attr_str == '.':
        return attr_dict

    # 移除末尾可能的换行符或分号，按分号分割
    parts = attr_str.strip().strip(';').split(';')

    for part in parts:
        part = part.strip()
        if not part:
            continue
        # 只分割第一个等号
        if '=' in part:
            key, value = part.split('=', 1)
            attr_dict[key] = value.strip()
    return attr_dict

def extract_gene_info(gff_file, output_file, target_feature='gene'):
    """
    读取 GFF 文件并提取指定特征类型的基因信息。
    """
    # 定义输出文件的表头
    headers = ['GeneID', 'GeneName', 'Chrom', 'Start', 'End', 'Strand', 'Type', 'Description']

    logger.info(f"开始处理文件: <cyan>{gff_file}</cyan>")
    logger.info(f"目标提取特征: <yellow>{target_feature}</yellow>")

    count = 0
    line_count = 0
    
    try:
        with open(gff_file, 'r', encoding='utf-8') as f_in, \
             open(output_file, 'w', encoding='utf-8', newline='') as f_out:

            writer = csv.writer(f_out, delimiter='\t')
            writer.writerow(headers)

            for line in f_in:
                line_count += 1
                
                # 跳过注释和空行
                if line.startswith('#') or not line.strip():
                    continue

                cols = line.strip().split('\t')

                # GFF3 标准应有 9 列
                if len(cols) < 9:
                    # 仅在调试模式或少量错误时显示，避免刷屏，这里作为 warning 显示前几个
                    if line_count < 20: 
                         logger.warning(f"第 {line_count} 行格式异常 (列数不足9)，已跳过")
                    continue

                feature_type = cols[2]

                # 筛选我们感兴趣的特征类型
                if feature_type != target_feature:
                    continue

                # 提取基本区域信息
                chrom = cols[0]
                start = cols[3]
                end = cols[4]
                strand = cols[6]

                # 解析第9列属性
                attributes = parse_attributes(cols[8])

                gene_id = attributes.get('ID', attributes.get('gene_id', 'NA'))
                gene_name = attributes.get('Name', attributes.get('gene_name', attributes.get('symbol', 'NA')))
                description = attributes.get('description', attributes.get('Note', attributes.get('product', 'NA')))

                # 解码 URL 编码的描述信息
                if description != 'NA':
                    description = urllib.parse.unquote(description)

                writer.writerow([gene_id, gene_name, chrom, start, end, strand, feature_type, description])
                count += 1

                # 进度提示：每提取 10000 个特征打印一次日志
                if count > 0 and count % 10000 == 0:
                    logger.info(f"已提取 {count} 个特征 (当前处理到第 {line_count} 行)...")

    except FileNotFoundError:
        logger.error(f"文件未找到: {gff_file}")
        sys.exit(1)
    except PermissionError:
        logger.error(f"没有权限读取文件或写入文件: {output_file}")
        sys.exit(1)
    except Exception as e:
        logger.exception(f"发生未知错误: {e}")
        sys.exit(1)

    if count == 0:
        logger.warning(f"处理完成，但在文件中未找到类型为 '{target_feature}' 的特征。")
    else:
        logger.success(f"处理成功！共提取了 <green>{count}</green> 个 '{target_feature}' 特征。")
        logger.info(f"结果已保存至: <cyan>{output_file}</cyan>")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="从 GFF3 文件中提取基因注释信息")
    parser.add_argument("-i", "--input", required=True, help="输入的 GFF3 文件路径")
    parser.add_argument("-o", "--output", required=True, help="输出的 TSV 文件路径")
    parser.add_argument("-t", "--type", default="gene", help="要提取的特征类型 (默认为 'gene')")

    args = parser.parse_args()

    extract_gene_info(args.input, args.output, args.type)
