# **🧬 自动化软件版本追踪模块 (Software Version Tracking Module)**

## **📖 1\. 简介 (Introduction)**

本模块旨在解决生信分析中 **“软件版本记录混乱”** 和 **“手动维护文档易出错”** 的痛点。

它独立于 Quarto/Rmarkdown 报告生成系统，作为一个预处理工具运行。其核心功能是扫描分析流程中使用的所有 Conda/Python 环境配置文件，自动提取实际安装的软件版本，并生成标准化的 JSON 数据供下游报告读取。

### **核心设计理念**

* 🛡️ 单一事实来源 (Single Source of Truth)  
  版本号直接来源于实际运行的环境文件 (.yaml)，而非手动输入的文本，确保报告的绝对准确性。  
* ⚙️ 配置分离 (Separation of Concerns)  
  想要在报告里展示什么软件，只需修改配置 (software\_list.yaml)，无需修改任何代码逻辑。  
* 🔄 多环境支持 (Multi-environment Support)  
  自动遍历多个环境文件，智能识别并保留最高版本（例如不同环境中有不同版本的 Python，会自动取最新的）。

## **📂 2\. 文件说明 (File Descriptions)**

### **📄 software\_list.yaml (控制层)**

这是 **“展示清单”**。它定义了你希望在最终报告中看到的软件列表。

* **作用**: 决定报告中显示哪些软件、属于什么分类（如 QC, Alignment）、以及显示什么名称。  
* **映射关系**: 将易读的软件名（如 featureCounts）映射到实际的 Conda 包名（如 subread）。

**配置示例:**

Raw Data QC:  
  \- name: "fastp"          \# 报告中显示的名称  
    package: "fastp"       \# 对应 environment.yaml 中的包名

Quantification:  
  \- name: "featureCounts"  
    package: "subread"     \# 关键映射：Conda 里它是 subread

### **🐍 get\_versions.py (逻辑层)**

这是 **“执行脚本”**，负责处理所有的数据解析工作。

* **输入**:  
  1. software\_list.yaml (清单)  
  2. 一个或多个环境文件夹/文件 (如 envs/mapping.yaml, envs/python.yaml)  
* **逻辑**:  
  1. 扫描所有输入的 .yaml 环境文件。  
  2. 解析 Conda (=) 和 Pip (==) 格式的版本号。  
  3. **智能合并**: 如果同一个软件在多个环境中出现（例如 Python），脚本会自动比对并保留**最高版本**。  
  4. 根据 software\_list.yaml 筛选出关心的软件。  
* **输出**:  
  * 一个干净的 .json 文件（通常位于 report/software\_versions.json）。

## **📊 3\. 工作流图示 (Workflow)**

graph LR  
    A\[software\_list.yaml\\n展示配置\] \--\> C(get\_versions.py)  
    B\[envs/\*.yaml\\n真实环境文件\] \--\> C  
      
    C \--\>|解析 & 比对| D\[software\_versions.json\\n中间数据\]  
      
    D \--\> E\[Quarto Report\\n.qmd\]  
    E \--\>|渲染| F\[最终 HTML 报告\]

## **🚀 4\. 使用方法 (Usage)**

### **命令行运行 (CLI)**

你可以在终端直接运行脚本来测试或生成数据：

python get\_versions.py \\  
    \--config software\_list.yaml \\  
    \--inputs ./envs ../shared\_envs/base.yaml \\  
    \--output report/software\_versions.json

* \--config: 指定展示清单路径。  
* \--inputs: 指定要扫描的环境文件或文件夹（支持多个路径，空格分隔）。  
* \--output: 指定生成的 JSON 文件保存路径。

### **集成到 Snakemake**

建议在流程结束、报告生成之前运行此规则。利用 Snakemake 的依赖追踪，任何环境文件的变更都会触发版本信息的重新生成。

rule gather\_software\_versions:  
    input:  
        config \= "config/software\_list.yaml",  
        envs   \= glob.glob("envs/\*.yaml") \# 自动追踪所有环境变更  
    output:  
        json   \= "report/software\_versions.json"  
    shell:  
        """  
        python get\_versions.py \\  
            \--config {input.config} \\  
            \--inputs {input.envs} \\  
            \--output {output.json}  
        """

## **❓ 5\. 常见问题 (FAQ)**

**Q: 我安装了软件，但生成的 JSON 显示 "Not Installed"？**

* **检查 1**: 确认 software\_list.yaml 中的 package 字段是否拼写正确。它必须与 conda list 显示的包名完全一致。  
  * *例如*: DESeq2 对应的包名通常是 bioconductor-deseq2。  
* **检查 2**: 确认该软件所在的 .yaml 环境文件是否包含在脚本的 \--inputs 参数路径中。

**Q: 为什么要有中间的 JSON 文件？直接在 Quarto 里调 Python 不行吗？**

* **解耦**: 这样做可以让 Quarto 渲染速度飞快，因为它不需要去扫描硬盘、解析大量 YAML 文件，只需读取现成的轻量级 JSON。  
* **调试**: 如果版本显示不对，直接检查生成的 JSON 文件即可快速定位问题，无需重新渲染整个耗时的报告。

#### **📝 维护者信息**

* **Author**: Jian Zhang  
* **Last Updated**: 2025-12-31