#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import sys
import yaml
from pathlib import Path
from typing import Dict, List, Any, Union
from packaging.version import parse as parse_version
from loguru import logger

# 配置 Loguru: 移除默认配置，添加一个简单的格式
# 这样在 Snakemake 日志中看起来会非常清爽
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
)

def get_clean_version(version_str: str) -> str:
    """
    清洗版本号，移除构建哈希码。
    Example: 1.2.3_h123 -> 1.2.3
    """
    if not isinstance(version_str, str):
        return "0.0.0"
    # 分割 = 和 _ 以获取纯净版本号
    return version_str.split('=')[0].split('_')[0]

def parse_single_yaml(file_path: Path) -> Dict[str, str]:
    """
    解析单个 Conda 环境 YAML 文件。
    返回: {包名: 版本号}
    """
    versions = {}
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
            
        if not data or 'dependencies' not in data:
            logger.debug(f"Skipping {file_path.name}: No dependencies found.")
            return versions

        for dep in data['dependencies']:
            if isinstance(dep, str):
                # 处理 conda 格式: package=version=build
                parts = dep.split('=')
                if len(parts) >= 2:
                    versions[parts[0]] = parts[1]
            elif isinstance(dep, dict) and 'pip' in dep:
                # 处理 pip 格式: package==version
                for pip_dep in dep['pip']:
                    parts = pip_dep.split('==')
                    if len(parts) >= 2:
                        versions[parts[0]] = parts[1]
                        
    except Exception as e:
        logger.warning(f"Failed to parse {file_path}: {e}")
        
    return versions

def main():
    parser = argparse.ArgumentParser(
        description="🚀 Extract and merge software versions from Conda environment files.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    parser.add_argument(
        "--config", 
        type=Path, 
        required=True, 
        help="Path to the configuration file (software_list.yaml)"
    )
    parser.add_argument(
        "--inputs", 
        nargs='+', 
        required=True, 
        help="List of environment files (.yaml/.yml) or directories to scan"
    )
    parser.add_argument(
        "--output", 
        type=Path, 
        required=True, 
        help="Path to save the output JSON file"
    )
    
    args = parser.parse_args()

    # 1. 扫描文件
    logger.info("Scanning input paths for environment files...")
    yaml_files: List[Path] = []
    
    for p in args.inputs:
        path_obj = Path(p)
        if path_obj.is_dir():
            # 递归查找 (rglob) 还是当前目录 (glob)? 这里用 glob 比较安全
            found = list(path_obj.glob("*.yaml")) + list(path_obj.glob("*.yml"))
            yaml_files.extend(found)
            logger.debug(f"Found {len(found)} yaml files in directory: {path_obj}")
        elif path_obj.is_file():
            yaml_files.append(path_obj)
        else:
            logger.warning(f"Path not found or ignored: {p}")

    if not yaml_files:
        logger.error("No YAML files found! Exiting.")
        sys.exit(1)

    logger.info(f"Total environment files to process: {len(yaml_files)}")

    # 2. 解析并合并版本 (保留最大版本)
    final_versions: Dict[str, str] = {}
    
    for yf in yaml_files:
        file_vers = parse_single_yaml(yf)
        
        for pkg, new_ver in file_vers.items():
            clean_new = get_clean_version(new_ver)
            
            if pkg not in final_versions:
                final_versions[pkg] = new_ver
            else:
                # 版本 PK 逻辑
                current_ver = final_versions[pkg]
                clean_old = get_clean_version(current_ver)
                try:
                    if parse_version(clean_new) > parse_version(clean_old):
                        # logger.debug(f"Updating {pkg}: {current_ver} -> {new_ver}")
                        final_versions[pkg] = new_ver
                except Exception:
                    # 如果版本号无法比较，保持原样
                    pass

    # 3. 读取配置并构建最终输出
    if not args.config.exists():
        logger.error(f"Config file not found: {args.config}")
        sys.exit(1)

    try:
        with open(args.config, 'r', encoding='utf-8') as f:
            config_data = yaml.safe_load(f)
    except Exception as e:
        logger.error(f"Failed to load config file: {e}")
        sys.exit(1)

    output_data = []
    if config_data:
        for category, tools_list in config_data.items():
            for tool in tools_list:
                pkg_name = tool.get('package', '')
                display_name = tool.get('name', 'Unknown')
                
                ver = final_versions.get(pkg_name, "Not Installed")
                final_ver = f"v{ver}" if ver != "Not Installed" else ver
                
                # 如果没安装，打印个警告方便调试
                if ver == "Not Installed":
                    logger.warning(f"Tool '{display_name}' ({pkg_name}) not found in any environment.")
                
                output_data.append({
                    "Function": category,
                    "Software Name": display_name,
                    "Version": final_ver
                })

    # 4. 保存结果
    try:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=4, ensure_ascii=False)
        
        logger.success(f"Successfully generated version report: {args.output}")
        
    except Exception as e:
        logger.error(f"Failed to write output JSON: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()