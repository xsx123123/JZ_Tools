# GISTIC2 扩增/缺失区域基因提取脚本

该脚本 (`extract_gistic_genes.r`) 提供了一个函数，用于从 GISTIC2 的输出文件中提取和清理基因列表，特别是 `amp_genes.conf_90.txt` 和 `del_genes.conf_90.txt`。它会处理这些文件，将已识别的扩增/缺失区域内的基因整合到一个干净、易于使用的格式中。

## 先决条件

要运行此脚本，您需要安装以下 R 包：

*   `data.table`
*   `tidyverse`

您可以使用以下命令安装它们：

```r
install.packages(c("data.table", "tidyverse"))
```

## 函数: `extract_gistic_genes`

### 描述

`extract_gistic_genes(file_path, region_prefix)` 是一个函数，用于读取 GISTIC2 的 `amp_genes` 或 `del_genes` 结果文件，转置并清理数据，合并各区域中发现的基因，并为区域 ID 添加自定义前缀。

### 参数

*   `file_path` (字符型): GISTIC2 结果文件的完整路径 (例如，`"amp_genes.conf_90.txt"` 或 `"del_genes.conf_90.txt"`)。
*   `region_prefix` (字符型): 要添加到生成的区域 ID 的前缀。这有助于区分扩增 (例如，"AP") 和缺失 (例如，"DP") 区域。

### 返回值

返回一个 `tibble` (或 `data.frame`)，包含以下列：

*   `amp_chr_id`: 扩增或缺失区域的唯一标识符，带有 `region_prefix` 前缀。
*   `merged_genes`: 该区域内所有基因的逗号分隔字符串。
*   `gene_count`: 该区域 `merged_genes` 字符串中识别的基因总数。

## 使用示例

首先，加载 R 脚本以载入函数：

```r
source("extract_gistic_genes.r")
```

然后，您可以按如下所示对扩增和缺失文件使用该函数：

```r
# 缺失区域示例
del_range_genes <- extract_gistic_genes("/home/zj/analysis/EGFR_liu_project/01.gistic/gistic2_RESULT/del_genes.conf_90.txt", "DP")

# 扩增区域示例
amp_range_genes <- extract_gistic_genes("/home/zj/analysis/EGFR_liu_project/01.gistic/gistic2_RESULT/amp_genes.conf_90.txt", "AP")

# 查看结果
print(del_range_genes)
print(amp_range_genes)
```

## 示例输出

以下是输出 `tibble` 可能的样子：

### AP 范围基因结果 (扩增)

```
# A tibble: 6 × 3
  amp_chr_id   merged_genes                                                         gene_count
  <chr>        <chr>                                                                     <dbl>
1 AP:16p13.3.1 hsa-mir-1826,AARS,ABAT,ABCA3,ADCY7,ADCY9,AP1G1,AFG3L1P,AGRP,ALDOA,A…       1095
2 AP:16q22.1.1 hsa-mir-1826,AARS,ABAT,ABCA3,ADCY7,ADCY9,AP1G1,AFG3L1P,AGRP,ALDOA,A…       1095
3 AP:8q24.21   ADCY8,ANXA13,HAS2,KCNQ3,MYC,NDUFB9,POU5F1B,PVT1,ST3GAL1,SLA,SNTB1,S…        106
4 AP:14q13.2   CFL2,NFKBIA,PAX9,PSMA6,RNU1-4,SRP54,NKX2-1,KIAA0391,BAZ1A,NKX2-8,RN…         29
5 AP:11q12.3   CHRM1,POLR2G,SLC3A2,STX5,SNORD29,SNORD31,SNORD30,SNORD28,SNORD27,SN…         22
6 AP:7p15.2    HOXA1,HOXA2,HOXA3,HOXA4,HOXA5,HOXA6,HOXA7,HOXA9,HOXA10,HOXA11,HOXA1…         17
```

### DP 范围基因结果 (缺失)

```
# A tibble: 6 × 3
  amp_chr_id     merged_genes                                                       gene_count
  <chr>          <chr>                                                                   <dbl>
1 del:5q31.3     TAF7,PCDHA9,PCDHB5,PCDHB1,PCDHB18P,PCDHB17P,PCDHB15,PCDHB14,PCDHB…         33
2 del:7p11.2     ZNF138,ZNF273,ZNF117,ZNF107,ZNF479,ZNF679,DKFZp434L192,ZNF680,NUP…         33
3 del:19q13.31   PSG1,PSG2,PSG3,PSG4,PSG5,PSG6,PSG7,PSG9,PSG11,PRG1,LOC284344,PSG8…         14
4 del:19p12      ZNF43,ZNF99,ZNF208,ZNF492,ZNF257,ZNF98,ZNF676,LOC374890,ZNF728,GO…         14
5 del:19q13.31.1 PSG1,PSG2,PSG3,PSG4,PSG5,PSG6,PSG7,PSG9,PSG11,PRG1,LOC284344,PSG8…         14
6 del:9p21.3     IFNA4,IFNA5,IFNA7,IFNA10,IFNA14,IFNA16,IFNA17,IFNA21,IFNA22P,IFNB…         12
```