# GISTIC2 Result Sample Extractor (GISTIC2 样本信息提取工具)

## 📖 简介 (Introduction)
这是一个用于处理 GISTIC2 Copy Number Variation (CNV) 分析结果的 R 脚本。

**背景/痛点：**
虽然 `maftools` 是处理突变数据的神器，但在处理 GISTIC2 输出的 `all_lesions.conf_XX.txt` 文件时，官方并未提供直接提取“每个 Peak 对应了哪些具体样本”的功能。GISTIC2 的原始输出格式混合了统计元数据和宽格式的样本矩阵，直接用于后续分析（如生存分析、关联分析）非常不便。

**功能：**
本脚本旨在解决上述问题，它能够：
1.  **自动清洗** GISTIC2 的 `all_lesions` 文件（去除冗余后缀、标准化 Peak 名称）。
2.  **ID 映射**：将 GISTIC 的样本 ID 自动转换为临床信息中的标准 `Tumor_Sample_Barcode`。
3.  **重构数据**：从“宽表”转换为“长表”，提取每个扩增/缺失区域（Cytoband/Peak）中具体的阳性样本列表。
4.  **汇总输出**：生成一份包含 `Unique_ID`, `Sample_Count`, 和 `Sample_List` 的简洁表格。

## 🛠️ 依赖环境 (Prerequisites)
脚本基于 R 语言，依赖以下高性能数据处理包：

```r
install.packages(c("data.table", "tidyverse"))
```
## 📂 输入文件说明 (Input Data)
脚本需要以下两个关键输入文件：
- GISTIC2 结果文件 (all_lesions.conf_90.txt)
- GISTIC2 标准输出文件，包含每个 Peak 的 q-value 和样本的 CNV 状态（0/1/2）。
临床信息映射表 (cli_update.txt)
- 需要包含至少两列：用于 GISTIC 分析的 ID (ID) 和 标准肿瘤样本 ID (Tumor_Sample_Barcode)。

## 🚀 使用方法 (Usage)
修改脚本头部的 路径配置区域：
```r
# ================== 1. 路径与文件读取 ==================
base_dir <- "/home/zj/analysis/EGFR_liu_project"  # 项目根目录
# ... 确保 gistic2_dir 和 clin_file 指向正确位置
```
在 R 环境或命令行中运行脚本：
```r
Rscript extract_gistic_samples.R
```
## 📊 输出结果 (Output)
脚本将在 gistic2_RESULT 目录下生成 CytobandSummary_info_add.samples.tsv。 文件格式如下（制表符分隔）：
```r
Unique_ID	Sample_Count	Sample_List
AP_7p11.2:EGFR	45	Sample_01;Sample_05;Sample_12...
DP_9p21.3:CDKN2A	20	Sample_02;Sample_08...
```
## 📝 逻辑流程 (Workflow Logic)
加载与映射: 读取临床信息，构建 ID -> Tumor_Sample_Barcode 的映射向量。
清洗 (Cleaning):
读取 all_lesions 文件。
重命名列名，去除 .call 后缀。
应用 ID 映射。
标准化 Unique Name (e.g., Amplification_Peak -> AP).
重塑 (Pivoting): 使用 tidyr::pivot_longer 将宽矩阵转换为长格式，大幅提高过滤效率。
聚合 (Aggregating): 筛选 Value > 0 的记录，按 Peak ID 分组并合并样本名。
输出: 写入 TSV 文件。






