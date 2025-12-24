#!/usr/bin/env python3

import argparse
import sys
from collections import defaultdict

def parse_obo(obo_file):
    """
    解析GO OBO文件，返回一个字典。
    字典格式: {go_id: (namespace, name)}
    *** 注意：此版本已被修改，会包含 'is_obsolete: true' (已废弃) 的条目 ***
    *** 注意：此版本已被修改，会包含 'alt_id' (备用ID) ***
    """
    go_data = {}
    current_term = {}
    in_term = False
    
    # 用来收集一个Term块中所有的alt_id
    current_alt_ids = []

    print(f"INFO: 开始解析 OBO 文件: {obo_file}...", file=sys.stderr)

    with open(obo_file, 'r') as f:
        for line in f:
            line = line.strip()

            if line == '[Term]':
                in_term = True
                current_term = {}
                current_alt_ids = [] # 开始新Term时，重置alt_id列表
            
            elif line == '' and in_term:
                # 块结束
                in_term = False
                
                # 检查是否是一个有效的、包含基本信息的Term
                if 'id' in current_term and \
                   'name' in current_term and \
                   'namespace' in current_term:
                    
                    primary_id = current_term['id']
                    info = (current_term['namespace'], current_term['name'])
                    
                    # 1. 存储主ID
                    go_data[primary_id] = info
                    
                    # 2. 存储所有 alt_id
                    # 这样无论基因文件里是主ID还是alt_ID，都能查到
                    for alt_id in current_alt_ids:
                        go_data[alt_id] = info

            elif in_term:
                # 解析Term块内部的行
                if line.startswith('id:'):
                    current_term['id'] = line.split(' ', 1)[1]
                elif line.startswith('name:'):
                    current_term['name'] = line.split(' ', 1)[1]
                elif line.startswith('namespace:'):
                    current_term['namespace'] = line.split(' ', 1)[1]
                elif line.startswith('is_obsolete: true'):
                    current_term['is_obsolete'] = True # 标记（虽然我们不过滤）
                
                # --- 新增逻辑 ---
                elif line.startswith('alt_id:'): 
                    current_alt_ids.append(line.split(' ', 1)[1])

    print(f"INFO: OBO 文件解析完毕。加载了 {len(go_data)} 个GO条目 (包含废弃条目和备用ID)。", file=sys.stderr)
    return go_data

def process_annotations(gene_file, go_data, output_file):
    """
    处理基因注释文件并写入输出文件。
    """
    print(f"INFO: 开始处理注释文件: {gene_file}...", file=sys.stderr)

    with open(gene_file, 'r') as f_in, open(output_file, 'w') as f_out:
        # 写入表头
        f_out.write("GeneID\tGO_Type\tGO_ID\tGO_Description\n")

        line_count = 0
        written_count = 0

        for line in f_in:
            line_count += 1
            line = line.strip()

            if not line or '\t' not in line or line.startswith('['):
                continue

            try:
                gene_id, go_list_str = line.split('\t')
            except ValueError:
                print(f"WARNING: 跳过格式错误的行 (第 {line_count} 行): {line}", file=sys.stderr)
                continue

            if go_list_str == '-':
                continue

            go_ids = go_list_str.split(',')

            for go_id in go_ids:
                go_id = go_id.strip() 
                if not go_id:
                    continue

                info = go_data.get(go_id)

                if info:
                    go_type, go_desc = info
                    f_out.write(f"{gene_id}\t{go_type}\t{go_id}\t{go_desc}\n")
                    written_count += 1
                else:
                    print(f"WARNING: 基因 {gene_id} 的 GO ID '{go_id}' 在 OBO 文件中未找到。跳过。", file=sys.stderr)

    print(f"INFO: 处理完毕。共写入 {written_count} 条注释到 {output_file}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(
        description="将基因-GO注释列表文件转换为长格式的TSV文件。",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '-g', '--gene_file',
        required=True,
        help="输入的基因-GO注释文件 (例如: 'LG0105162\tGO:0000278,GO:0000724,...')"
    )
    parser.add_argument(
        '-o', '--obo_file',
        required=True,
        help="Gene Ontology的OBO文件 (例如 'go-basic.obo')"
    )
    parser.add_argument(
        '-out', '--output_file',
        required=True,
        help="输出的长格式TSV文件名"
    )

    args = parser.parse_args()

    # 1. 解析OBO
    go_term_data = parse_obo(args.obo_file)

    # 2. 处理注释
    process_annotations(args.gene_file, go_term_data, args.output_file)

if __name__ == "__main__":
    main()
