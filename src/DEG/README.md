# **📊 DEG Analysis Pipeline (DESeq2 + edgeR Dual Engine)**

**Author:** Jian Zhang

**Integrator:** Hajimi (AI Assistant)

**Version:** 4.0 (Added edgeR engine for no-replicate / 1v1 designs)

**Last Update:** 2026-07-27

## **📖 简介 (Introduction)**

这是一个基于 **R** 的全自动差异表达分析流程，包含两套引擎：

* **DESeq2** (`run_deseq2.r`)：经典引擎，依赖生物学重复估计离散度，适用于所有比较组均有重复的设计。
* **edgeR** (`run_edger.r`)：**v4.0 新增**。专门解决 **无生物学重复（1v1）** 场景——DESeq2 在每组只有 1 个样本时无法估计离散度、会直接报错终止；edgeR 按官方 User's Guide 的 "No biological replicates" 方案，以用户给定的 **BCV（生物学变异系数）** 先验运行 `exactTest`，让 1v1 比较也能出完整的差异结果、火山图与统计表。

在 RNAFlow 流程中，引擎由 Snakemake 在解析期自动选择（`rules/utils/deg_method.py`）：

| 场景 | 引擎 | 说明 |
| :---- | :---- | :---- |
| 所有比较组两组均有 ≥2 个样本 | DESeq2 | 行为与旧版完全一致 |
| 任一比较组为 1v1（无重复） | edgeR | 1v1 对比走固定 BCV 的 exactTest；同批次内的有重复对比走 edgeR 标准 QL F-test |
| 配置 `METHOD: deseq2 / edger` | 强制指定 | `deseq2` 强跑 1v1 会在该对比上报错（会给出警告） |

## **✨ 核心功能 (Key Features)**

* **⚡ 全自动流程**：一键运行，无需人工干预，适合批量作业。  
* **🧬 双引擎覆盖**：有重复用 DESeq2；**1v1 无重复自动切换 edgeR（固定 BCV）**，不再因缺重复而整个流程失败。  
* **🔍 全局质控**：  
  * 自动生成 PCA (PC1-PC2 & PC2-PC3) 组合拼图。  
  * DESeq2 版使用 vst 标准化、edgeR 版使用 log2-CPM，确保聚类准确。  
* **🎨 高级可视化**：  
  * 生成带基因标签的 **Volcano Plot** (排斥性标签，智能避让互不重叠)。  
  * 同时生成无标签的简洁版 Volcano Plot。  
  * 自动适配 Y 轴高度和 X 轴宽度，防止极值压缩图形。  
* **📈 智能统计**：  
  * 分析结束后自动输出 All\_Contrast\_DEG\_Statistics.csv。  
  * 汇总所有比较组的上调/下调基因数量；**edgeR 版额外记录每个对比所用的方法与离散度假设**。  
* **🛡️ 严谨统计**：  
  * 严格基于 **Raw P-value** 进行筛选和绘图（v3.8 起）。  
  * 修复了常规流程中 Log10(0) 的报错问题。  
* **📝 详细日志**：利用 log4r 提供详细的运行日志（屏幕输出 \+ 文件记录），便于追踪和排错。

## **🛠️ 依赖环境 (Prerequisites)**

请确保你的 R 环境中已安装以下包：

\# Bioconductor 包  
if (\!requireNamespace("BiocManager", quietly \= TRUE))  
    install.packages("BiocManager")  
BiocManager::install(c("DESeq2", "edgeR"))

\# CRAN 包  
install.packages(c("tidyverse", "optparse", "ggplot2", "ggrepel",   
                   "ggpubr", "patchwork", "log4r", "crayon", "cowplot"))

RNAFlow 内置 conda 环境：`envs/deg_deseq2.yaml`（DESeq2）与 `envs/deg_edger.yaml`（edgeR）。

## **📂 输入文件格式 (Input Files)**

两个脚本的输入格式**完全一致**。脚本支持 .csv (逗号分隔) 和 .txt/.tsv (制表符分隔)。

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

### DESeq2（有生物学重复）

Rscript run\_deseq2.r \\  
  \-c counts.csv \\  
  \-m metadata.csv \\  
  \-p contrasts.csv \\  
  \-a annotation.csv \\  
  \-o ./Analysis\_Results \\  
  \--lfc 1 \\  
  \--pval 0.05

### edgeR（支持 1v1 无重复；有重复同样适用）

Rscript run\_edger.r \\  
  \-c counts.csv \\  
  \-m metadata.csv \\  
  \-p contrasts.csv \\  
  \-a annotation.csv \\  
  \-o ./Analysis\_Results \\  
  \--lfc 1 \\  
  \--pval 0.05 \\  
  \--bcv 0.4

### **参数说明 (Arguments)**

| 参数 (Short) | 参数 (Long) | 描述 | 默认值 |
| :---- | :---- | :---- | :---- |
| \-c | \--counts | **\[必选\]** 原始 Counts 表达矩阵文件 | NULL |
| \-m | \--metadata | **\[必选\]** 样本信息表 (含 Sample, Group) | NULL |
| \-p | \--pairs | **\[必选\]** 差异比较对文件 (含 Treat, Control) | NULL |
| \-a | \--annotation | \[可选\] 基因注释文件 | NULL |
| \-o | \--outdir | 输出结果的文件夹路径 | ./results |
| \-l | \--log\_file | 日志文件名 | deseq2.log / edger.log |
|  | \--lfc | Log2 FoldChange 阈值 (绝对值) | 1.0 |
|  | \--pval | Raw P-value 阈值 | 0.05 |
|  | \--bcv | **\[仅 edgeR\]** 无重复对比的生物学变异系数 (BCV) | 0.4 |
|  | \--min-rep | **\[仅 edgeR\]** 组内最少样本数，低于此值的对比走固定 BCV 模式 | 2 |

## **🧪 edgeR 无重复 (1v1) 模式说明**

**为什么需要它**：DESeq2 的离散度估计要求组内 ≥2 个样本；1v1 设计下 `DESeq()` 会失败并终止整个流程。edgeR User's Guide 明确支持这种场景：离散度不从数据估计，而是由用户以 BCV 先验给定，`exactTest(y, dispersion = bcv^2)` 在该假设下计算精确检验 P 值。

**BCV 取值指南**（edgeR 官方建议）：

| BCV | 适用场景 |
| :---- | :---- |
| **0.4**（默认） | 人/动物等异质性生物样本，保守、通用 |
| 0.1 | 遗传一致的模式生物、建系细胞系 |
| 0.01 | 严格质控的技术重复 |

**run\_edger.r 的自动分流**：同一次运行内，每个比较对独立判断——

* 两组均 ≥ `--min-rep`（默认 2）个样本 → 标准 edgeR：`estimateDisp` + `glmQLFTest`（QL F 检验，与 DESeq2 同级的严谨方法）；  
* 否则（1v1） → `exactTest` + 固定 `dispersion = bcv²`，日志中以 WARN 级别标注该对比为探索性结果。

**统计学注意事项（必读）**：

1. 1v1 模式下 P 值**条件于你给定的 BCV**：BCV 偏小 → 假阳性膨胀；偏大 → 灵敏度下降。结果应视为**探索性**，关键基因请用 qPCR 或增加重复后复验。  
2. 无重复设计**无法评估生物学变异**，这是设计本身的局限，不是算法能弥补的。  
3. All\_Contrast\_DEG\_Statistics.csv 中会逐对比记录 `Method` 与 `Dispersion_Assumption`，交付/发表时请一并注明。

## **📊 输出结果 (Outputs)**

运行完成后，输出目录将包含以下内容：

### **1\. Global Analysis (全局分析)**

* **Global\_PCA\_Combined.pdf/png**: 所有样本的 PCA 聚类图，展示样本间的整体差异。

### **2\. Differential Analysis (差异分析)**

对于每一组对比（如 Treat\_vs\_WT）：

* **{Treat}\_vs\_{Control}\_DEG.csv**: 完整的差异分析结果表（含 log2FC, pvalue, padj, Symbol）。  
* **{Treat}\_vs\_{Control}\_Volcano.pdf/png**: 基础火山图（无基因标签）。  
* **{Treat}\_vs\_{Control}\_Volcano\_add\_gene\_id.pdf/png**: 标注了 Top 显著基因名称的高级火山图。

两个脚本的输出文件命名与列结构一致，下游（富集、报告）无需区分引擎。

### **3\. Statistics (统计汇总)**

* **All\_Contrast\_DEG\_Statistics.csv**: 差异基因数量汇总表。edgeR 版额外包含 Method / Dispersion\_Assumption / N\_Control / N\_Treat 列。

### **4\. Log (日志)**

* **deseq2.log / edger.log**: 完整的运行记录，包含参数设置、运行进度和警告信息。

## **📝 Example Output (Statistics Table)**

edgeR 引擎生成的统计表 (All\_Contrast\_DEG\_Statistics.csv) 示例（同一运行内混合了有重复与 1v1 对比）：

| Contrast | Control | Treat | Method | Dispersion\_Assumption | N\_Control | N\_Treat | Up\_Regulated | Down\_Regulated | Total\_DEG |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| Treat\_vs\_WT | WT | Treat | edgeR-QLF | trended+tagwise (common BCV=0.321) | 3 | 3 | 150 | 89 | 239 |
| Rescue\_vs\_KO | KO | Rescue | edgeR-NoRep | fixed BCV=0.40 (dispersion=0.1600) | 1 | 1 | 45 | 12 | 57 |

DESeq2 引擎的统计表保持旧版列结构（Contrast / Control / Treat / Up / Down / Total\_DEG / 阈值）。

## **😺 Hajimi's Note (Tips)**

1. 关于 PCA:  
   DESeq2 版使用 vst(blind=TRUE)、edgeR 版使用带先验计数的 log2-CPM 做方差稳定后再绘制 PCA，均为各自官方推荐实践。  
2. 关于 "Volcano Plot Failed" 报错:  
   如果在日志中看到此错误，通常是因为该对比组没有显著差异基因（或者极少），导致绘图函数无法自动计算坐标轴的范围。请查看 CSV 结果表确认该组是否有差异基因。  
3. Padj vs Pvalue:  
   本流程严格使用 Raw P-value 进行筛选和绘图（v3.8 起的口径）；结果表中仍同时提供 padj 列供参考。  
4. 关于 1v1:  
   能加重复就加重复。edgeR 固定 BCV 模式是让 1v1 "有结果可看"的工程方案，统计效力天然受限，解释结果时请保守。
