# UniProt GAF to Gene ID Converter (Robust Version)

## 工具简介

这是一个专为 RNA-seq 下游分析设计的 Python 实用工具。它的核心作用是将从 GO 官网或 EBI 下载的原始 GAF 注释文件（通常是基于 UniProt 蛋白 ID 的），批量转换为下游富集分析（如 clusterProfiler）所需的 Gene ID 格式（如 Ensembl ID 或 NCBI Entrez ID）。

## 核心解决的问题

通常的 GAF 文件里只有蛋白 ID（如 A0A024RBG1），但我们在做表达量分析时拿到的是基因 ID（如 ENSG00000105647）。手动转换非常麻烦且容易出错，这个脚本实现了全自动化对接。

## 核心特性

### 1. 极强的网络稳健性 (Robust)

针对 UniProt API 经常出现的 "Stream 接口 404" 或服务器延迟问题，内置了智能降级策略。如果高速流式下载失败，脚本会自动切换到稳定的分页下载模式，确保数据一定能下载成功，不会让流程中断。

### 2. 自动 ID 清洗

生信分析中的常见痛点是 ID 版本号不匹配。本脚本会自动移除 Ensembl ID 的后缀（例如将 ENSG00000239571.1 自动清洗为 ENSG00000239571），完美适配 featureCounts/STAR 的输出结果。

### 3. 信息更丰富

不仅仅是简单的 ID 转换，脚本还会从原始 GAF 文件中提取基因/蛋白质的功能描述 (Description)，让生成的最终表格包含基因名、GO ID、原始蛋白 ID 以及功能描述，方便查阅。

### 4. 多物种支持

通过参数调整，既支持人类/小鼠（Ensembl 数据库），也支持生菜、番茄、拟南芥等植物（Ensembl_Genomes 数据库）。

## 适用场景

- 需要为新物种或特定基因组版本构建包含 GO 注释的背景文件时
- 需要将 UniProt 的高质量注释迁移到 Ensembl 基因 ID 上时
- 在进行富集分析前，需要统一 ID 格式以匹配表达矩阵中的基因 ID

## 使用方法

### 命令行参数

```bash
python uniprot_gaf_converter_v2.py [-h] -i INPUT -o OUTPUT [--to-db {Ensembl,GeneID,Ensembl_Genomes}]
```

#### 参数说明

| 参数 | 必需 | 默认值 | 描述 |
|------|------|--------|------|
| `-i`, `--input` | 是 | - | 输入的 GAF 文件路径 |
| `-o`, `--output` | 是 | - | 输出文件路径 |
| `--to-db` | 否 | Ensembl | 目标数据库类型：<br>- `Ensembl`: 适用于人类/小鼠<br>- `GeneID`: NCBI Gene ID<br>- `Ensembl_Genomes`: 适用于植物等其他物种 |

### 使用示例

#### 1. 转换为 Ensembl ID（人类/小鼠）

```bash
python uniprot_gaf_converter_v2.py -i input.gaf -o output_ensembl.tsv --to-db Ensembl
```

#### 2. 转换为 NCBI Gene ID

```bash
python uniprot_gaf_converter_v2.py -i input.gaf -o output_geneid.tsv --to-db GeneID
```

#### 3. 转换为 Ensembl Genomes ID（植物等）

```bash
python uniprot_gaf_converter_v2.py -i input.gaf -o output_plants.tsv --to-db Ensembl_Genomes
```

## 安装要求

### 依赖包

此脚本依赖以下 Python 包：

- `requests` - 用于与 UniProt API 通信
- `loguru` - 用于日志记录
- `argparse` - 用于命令行参数解析（Python 标准库）
- `re` - 用于正则表达式处理（Python 标准库）
- `time` - 用于延时操作（Python 标准库）
- `sys` - 用于系统相关操作（Python 标准库）

### 安装方法

```bash
pip install requests loguru
```

或者使用 requirements.txt 文件：

```txt
requests>=2.25.1
loguru>=0.5.3
```

## 故障排除

### 常见问题及解决方案

#### 1. Stream 接口 404 错误

**问题描述**: 脚本提示 "Stream 接口返回 404"

**解决方案**: 这是正常现象，脚本会自动切换到分页模式继续下载。如果长时间卡住，请检查网络连接。

#### 2. 网络超时或连接错误

**问题描述**: 出现 "Connection timeout" 或 "Max retries exceeded" 错误

**解决方案**:
- 检查网络连接是否稳定
- 可能是 UniProt API 服务暂时不稳定，稍后再试
- 脚本内置了重试机制，通常会自动恢复

#### 3. 内存不足错误

**问题描述**: 处理大型 GAF 文件时出现内存溢出

**解决方案**:
- 考虑分割大文件为多个小文件分别处理
- 增加系统可用内存

#### 4. ID 映射失败

**问题描述**: 输出文件中存在大量未映射的 ID

**解决方案**:
- 检查输入的 GAF 文件格式是否正确
- 确认使用的 `--to-db` 参数是否适合您的物种
- 某些旧的或非标准的 UniProt ID 可能无法映射，这是正常现象

#### 5. 输出文件为空

**问题描述**: 生成的输出文件大小为 0

**解决方案**:
- 检查输入 GAF 文件是否包含有效的 UniProtKB 条目
- 确保 GAF 文件格式符合标准（GAF 2.2）
- 查看日志输出了解具体错误信息

### 性能提示

- 对于大型 GAF 文件，处理时间可能较长（几小时），请耐心等待
- 脚本会在处理过程中显示进度日志
- 如果中断后重新开始，需要重新处理整个文件