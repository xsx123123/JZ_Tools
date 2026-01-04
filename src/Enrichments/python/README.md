# **⚡ Polars GO Enricher**

**极速版 GO 富集分析工具**

结合了 **Polars** 的高性能数据处理能力与 **GSEApy** 的统计分析算法，专为大批量基因关联数据设计。

## **📖 简介**

这是一个轻量级但高性能的 Gene Ontology (GO) 富集分析工具。

传统的 Python 富集分析脚本在读取和处理巨大的 Gene-to-GO 关联文件（例如包含数百万行的全基因组注释）时通常非常缓慢。本工具利用 Rust 编写的 DataFrame 库 **Polars** 重构了数据预处理流程，将背景库构建速度提升了数倍。

**核心特性：**

* 🚀 **极速预处理**：利用 Polars 瞬间读取并聚合百万级注释数据。  
* 🛠 **双模式运行**：支持 **命令行 (CLI)** 直接运行，也支持 **Python 模块导入**。  
* 🎨 **优雅交互**：基于 rich-click 和 loguru 提供赏心悦目的终端输出。  
* 📊 **标准算法**：底层调用 GSEApy 进行准确的超几何分布/Fisher 精确检验。

## **📦 安装依赖**

建议使用 Python 3.8+ 环境。

pip install polars gseapy goatools rich-click loguru

## **🖥️ 命令行使用 (CLI Mode)**

你可以直接将其作为脚本运行，支持 \-h 查看帮助。

### **1\. 查看帮助**

python go\_enrich.py \-h

### **2\. 运行分析**

python go\_enrich.py \\  
    \-g ./data/target\_genes.txt \\  
    \-o ./data/go-basic.obo \\  
    \-a ./data/gene\_association.tsv \\  
    \-d ./results \\  
    \-c 0.05

**参数说明：**

| 参数 | 缩写 | 必填 | 说明 |
| :---- | :---- | :---- | :---- |
| \--gene-list | \-g | ✅ | 目标基因列表文件 (TXT, 每行一个基因ID) |
| \--obo | \-o | ✅ | GO 本体文件 (.obo) |
| \--assoc | \-a | ✅ | 基因与GO的关联文件 (TSV) |
| \--out-dir | \-d | ❌ | 结果输出目录 (默认: go\_results\_polars) |
| \--cutoff | \-c | ❌ | P-value / FDR 显著性阈值 (默认: 0.05) |

## **🐍 Python 模块使用 (Import Mode)**

该脚本经过重构，可以方便地集成到你的生信 Pipeline 脚本中，无需通过 subprocess 调用。

from go\_enrich import go\_enricher

\# 1\. 定义你的基因列表 (可以直接传 List，不需要存文件)  
my\_genes \= \["TP53", "BRCA1", "EGFR", "MYC", "KRAS"\]

\# 2\. 运行分析  
try:  
    print("正在进行 GO 分析...")  
    enrich\_result \= go\_enricher(  
        gene\_list\_input=my\_genes,          \# 支持 list 或 文件路径  
        obo\_path="./data/go-basic.obo",  
        assoc\_path="./data/gene\_association.tsv",  
        out\_dir="./my\_analysis\_results",  
        cutoff=0.05  
    )  
      
    \# 3\. 获取结果 DataFrame  
    df \= enrich\_result.results  
      
    \# 4\. 简单的下游处理  
    sig\_df \= df\[df\['Adjusted P-value'\] \< 0.05\]  
    print(f"找到 {len(sig\_df)} 个显著通路")  
    print(sig\_df.head())

except Exception as e:  
    print(f"分析出错: {e}")

## **📂 数据格式说明**

为了确保工具正常运行，请准备以下格式的数据：

### **1\. 目标基因列表 (-g)**

简单的文本文件，每行一个 Gene ID。

GeneA  
GeneB  
GeneC  
...

### **2\. 基因关联文件 (-a)**

制表符分隔文件 (TSV)，无表头（如果有表头会被当作第一行数据处理，建议去除）。  
Polars 会强制读取前两列：

* **第1列**: Gene ID  
* **第2列**: GO ID

GeneA	GO:0008150  
GeneA	GO:0003674  
GeneB	GO:0005575  
...

### **3\. OBO 文件 (-o)**

标准的 Gene Ontology 文件，可从 [Gene Ontology Consortium](http://geneontology.org/docs/download-ontology/) 下载。

* 推荐使用 go-basic.obo。

## **📝 License**

MIT License. Feel free to use and modify.