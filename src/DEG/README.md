# **📊 DESeq2 Analysis Pipeline (Advanced Edition)**

**Author:** Jian Zhang

**Integrator:** Hajimi (AI Assistant)

**Version:** 3.6

**Last Update:** 2026-01-03

## **📖 简介 (Introduction)**

这是一个基于 **R** 和 **DESeq2** 的全自动化差异表达分析流程。该工具专为批量处理设计，能够自动完成从数据标准化、PCA 质控到差异分析、高级绘图及统计报表生成的全过程。

## **✨ 核心功能 (Key Features)**

* **⚡ 全自动流程**：一键运行，无需人工干预，适合批量作业。  
* **🔍 全局质控**：  
  * 自动生成 PCA (PC1-PC2 & PC2-PC3) 组合拼图。  
  * 分析前自动执行 vst (Variance Stabilizing Transformation) 标准化，确保聚类准确。  
* **🎨 高级可视化**：  
  * 生成带基因标签的 **Volcano Plot** (排斥性标签，智能避让互不重叠)。  
  * 同时生成无标签的简洁版 Volcano Plot。  
  * 自动适配 Y 轴高度和 X 轴宽度，防止极值压缩图形。  
* **📈 智能统计**：  
  * 分析结束后自动输出 All\_Contrast\_DEG\_Statistics.csv。  
  * 汇总所有比较组的上调/下调基因数量。  
* **🛡️ 严谨统计**：  
  * 严格基于 **Padj (Adjusted P-value)** 进行筛选和绘图。  
  * 修复了常规流程中 Log10(0) 的报错问题。  
* **📝 详细日志**：利用 log4r 提供详细的运行日志（屏幕输出 \+ 文件记录），便于追踪和排错。

## **🛠️ 依赖环境 (Prerequisites)**

请确保你的 R 环境中已安装以下包：

\# Bioconductor 包  
if (\!requireNamespace("BiocManager", quietly \= TRUE))  
    install.packages("BiocManager")  
BiocManager::install("DESeq2")

\# CRAN 包  
install.packages(c("tidyverse", "optparse", "ggplot2", "ggrepel",   
                   "ggpubr", "patchwork", "log4r", "crayon", "cowplot"))

## **📂 输入文件格式 (Input Files)**

脚本支持 .csv (逗号分隔) 和 .txt/.tsv (制表符分隔)。

### **1\. 表达矩阵 (--counts)**

* 行是基因 (GeneID)，列是样本 (Sample)。  
* 数值必须是 Raw Counts (整数)。

GeneID,Sample1,Sample2,Sample3,Sample4  
GeneA,100,120,5,0  
GeneB,200,210,50,45  
...

### **2\. 样本信息表 (--metadata)**

* 必须包含 Sample (对应表达矩阵列名) 和 Group (分组名) 两列。

Sample,Group  
Sample1,WT  
Sample2,WT  
Sample3,Treat  
Sample4,Treat

### **3\. 比较对文件 (--pairs)**

* 定义差异分析的组别。  
* 列名必须是 Treat (处理组) 和 Control (对照组)，内容必须在 Metadata 的 Group 列中存在。

Treat,Control  
Treat,WT  
Mutant,WT  
Time24h,Time0h

### **4\. 注释文件 (可选, \--annotation)**

* 第一列必须是与表达矩阵行名一致的 ID (如 ENSEMBL)。  
* 后续列可包含 Symbol, Description 等信息，将自动合并到结果表中。

ENSEMBL,Symbol,Description  
ENSG000001,TP53,Tumor protein p53  
...

## **🚀 使用方法 (Usage)**

在终端 (Terminal) 中运行以下命令：

Rscript deseq2\_pipeline.R \\  
  \-c counts.csv \\  
  \-m metadata.csv \\  
  \-p contrasts.csv \\  
  \-a annotation.csv \\  
  \-o ./Analysis\_Results \\  
  \--lfc 1 \\  
  \--pval 0.05

### **参数说明 (Arguments)**

| 参数 (Short) | 参数 (Long) | 描述 | 默认值 |
| :---- | :---- | :---- | :---- |
| \-c | \--counts | **\[必选\]** 原始 Counts 表达矩阵文件 | NULL |
| \-m | \--metadata | **\[必选\]** 样本信息表 (含 Sample, Group) | NULL |
| \-p | \--pairs | **\[必选\]** 差异比较对文件 (含 Treat, Control) | NULL |
| \-a | \--annotation | \[可选\] 基因注释文件 | NULL |
| \-o | \--outdir | 输出结果的文件夹路径 | ./results |
| \-l | \--log\_file | 日志文件名 | deseq2.log |
|  | \--lfc | Log2 FoldChange 阈值 (绝对值) | 1.0 |
|  | \--pval | Adjusted P-value (FDR) 阈值 | 0.05 |

## **📊 输出结果 (Outputs)**

运行完成后，输出目录将包含以下内容：

### **1\. Global Analysis (全局分析)**

* **Global\_PCA\_Combined.pdf/png**: 所有样本的 PCA 聚类图，展示样本间的整体差异。

### **2\. Differential Analysis (差异分析)**

对于每一组对比（如 Treat\_vs\_WT）：

* **{Treat}\_vs\_{Control}\_DEG.csv**: 完整的差异分析结果表（含 log2FC, pvalue, padj, Symbol）。  
* **{Treat}\_vs\_{Control}\_Volcano.pdf/png**: 基础火山图（无基因标签）。  
* **{Treat}\_vs\_{Control}\_Volcano\_add\_gene\_id.pdf/png**: 标注了 Top 显著基因名称的高级火山图。

### **3\. Statistics (统计汇总)**

* **All\_Contrast\_DEG\_Statistics.csv**: 差异基因数量汇总表。

### **4\. Log (日志)**

* **deseq2.log**: 完整的运行记录，包含参数设置、运行进度和警告信息。

## **📝 Example Output (Statistics Table)**

生成的统计表 (All\_Contrast\_DEG\_Statistics.csv) 示例如下：

| Contrast | Control | Treat | Up\_Regulated | Down\_Regulated | Total\_DEG |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Treat\_vs\_WT | WT | Treat | 150 | 89 | 239 |
| Mut\_vs\_WT | WT | Mut | 45 | 12 | 57 |

## **😺 Hajimi's Note (Tips)**

1. 关于 PCA:  
   脚本会自动使用 vst(blind=TRUE) 对数据进行方差稳定变换后再绘制 PCA。这是 DESeq2 官方推荐的最佳实践，不用担心因为直接使用 Raw Counts 导致的异常聚类。  
2. 关于 "Volcano Plot Failed" 报错:  
   如果在日志中看到此错误，通常是因为该对比组没有显著差异基因（或者极少），导致绘图函数无法自动计算坐标轴的范围。请查看 CSV 结果表确认该组是否有差异基因。  
3. Padj vs Pvalue:  
   本流程严格使用 Padj (FDR) 进行筛选和绘图。这是目前发表高水平文章的标准要求，能有效降低假阳性率。
