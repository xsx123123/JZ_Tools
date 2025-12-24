# 组织特异性基因表达分析 (Tissue-Specific Gene Expression Analysis)

本目录包含一套 R 脚本，专用于处理原始 RNA-seq 基因表达数据，进行标准化处理，并使用 **Tau 特异性指数 (Tau specificity index)** 来识别组织特异性基因。

## 流程概览

该工作流旨在将原始基因计数转换为具有生物学意义的组织特异性指标。主要步骤包括：

1.  **TPM 标准化 (TPM Normalization)**：将原始 Read 计数（来自 featureCounts）转换为 TPM（每百万转录本），以消除基因长度和测序深度差异带来的影响。
2.  **合并重复 (Replicate Merging)**：将生物学重复样本（例如 `Bud_rep1`, `Bud_rep2`）聚合为每个组织的单一代表值（平均 TPM）。
3.  **特异性评分 (Specificity Scoring)**：计算每个基因的 Tau 指数（0 < &tau; < 1）。Tau 值越高，表示基因的组织特异性越强。
4.  **分类 (Classification)**：（可选/扩展）使用扩展算法将基因分类到具体的组织特异性类别中。

## 文件说明

### 1. `calculation.r`
主分析脚本。它负责协调整个分析流程：
- 加载原始计数矩阵。
- 调用标准化函数。
- 过滤低表达基因（例如：总 TPM < 10）。
- 合并生物学重复。
- 计算 Tau 分数并保存最终结果。

**注意**：在运行之前，请务必更新此脚本中的文件路径（例如 `root_dir`, `gene_matrix_dir`）以匹配你的本地环境。

### 2. `calculate_tpm.r`
包含函数 `calculate_tpm(data, count_col_pattern)`。
- **输入**：包含 `Geneid`、`Length` 和计数列的数据框。
- **逻辑**：
    1. 计算 RPK (Reads Per Kilobase)。
    2. 计算缩放因子 (每个样本的 RPK 总和)。
    3. 计算最终的 TPM 值。

### 3. `calc_tau_manual.R`
包含函数 `calc_tau_manual(x)`。
- 实现了标准的 Tau 计算公式：
  $$ \tau = \frac{\sum_{i=1}^{n} (1 - \hat{x}_i)}{n - 1} $$
  其中 $\hat{x}_i$ 是基因在组织 $i$ 中的表达量除以该基因在所有组织中的最大表达量后的归一化值。

### 4. `identify_extended_tau .R`
*状态：占位符/开发中*
旨在包含 `identify_extended_tau` 函数，用于基于 Tau 分数和表达谱对基因进行更高级的分类（例如识别基因具体在哪个组织特异表达）。

## 依赖库

脚本运行需要以下 R 包：
- `dplyr`
- `tidyr`
- `data.table`
- `stringr`

## 使用方法

1. 确保所有 `.R` 辅助脚本都位于你的工作目录中或已被正确 source。
2. 打开 `calculation.r`。
3. 修改 `root_dir` 和输入文件路径。
4. 运行脚本，生成输出文件 `RNA_SEQ_tissue_specificity_of_genes_extended_tau.tsv`。
