library(data.table)
library(dplyr)
library(tidyr)
library(stringr)

# =======================================================
# 步骤 1: 数据加载与清洗 (Data Loading & Cleaning)
# =======================================================
# 定义文件路径
root_dir <- '/home/zj/analysis/yuyuan_gene_expression_25.12.1/'
gene_matrix_dir <- '/home/zj/analysis/yuyuan_gene_expression_25.12.1/4_quantification/gene_counts.txt'

# 使用 fread 快速读取 featureCounts 的结果
gene_matrix_data <- fread(gene_matrix_dir) |>
  # 选择必要的列：Geneid, Length (基因长度用于计算TPM), 以及所有 bam 结尾的样本列
  dplyr::select(c(Geneid, Length, matches("3_bam"))) |>
  # 批量重命名列名：去掉 "3_bam/" 前缀和 ".sorted.bam" 后缀，只保留样本名(如 Bud_rep1)
  dplyr::rename_with(~ .x %>% 
                       str_remove("3_bam/") %>% 
                       str_remove("\\.sorted\\.bam")) |>
  # 将 Geneid 设为行名，方便后续矩阵计算
  tibble::column_to_rownames(var = "Geneid") 

# =======================================================
# 步骤 2: 标准化 - Raw Count 转 TPM (TPM Normalization)
# =======================================================
# 识别所有计数列（假设包含 "_rep" 的列都是样本）
count_cols <- names(gene_matrix_data)[grepl("_rep", names(gene_matrix_data))]

# --- 2.1 计算 RPK (Reads Per Kilobase) ---
# 公式: Count / (GeneLength / 1000)
# 这一步是为了消除“基因长度”对表达量的影响（长基因reads多，短基因reads少）
ftc_tpm_raw <- gene_matrix_data |>
  as.data.frame() |>
  dplyr::mutate(
    across(all_of(count_cols), 
           ~ .x / (Length / 1000), 
           .names = "RPK_{.col}") # 生成新列，前缀为 RPK_
  ) |>
  # 只保留 RPK 列，准备下一步计算
  dplyr::select(starts_with("RPK_")) 

# --- 2.2 计算 Scaling Factor (每个样本的 RPK 总和) ---
# 这一步是为了消除“测序深度”对表达量的影响
rpk_columns <- ftc_tpm_raw |> dplyr::select(starts_with("RPK_"))
sum_rpk_per_sample <- colSums(rpk_columns)

# --- 2.3 计算 TPM (Transcripts Per Million) ---
# 公式: (RPK / Sum_RPK) * 10^6
gene_matrix_tpm <- ftc_tpm_raw |>
  dplyr::mutate(
    across(starts_with("RPK_"),
           # 当前列除以对应的样本总RPK，再乘以1百万
           ~ (.x / sum_rpk_per_sample[cur_column()]) * 1e6,
           .names = "TPM_{.col}") # 生成新列，前缀为 TPM_
  ) |>
  dplyr::select(starts_with("TPM_")) |> # 只保留最终的 TPM 列
  # --- 2.4 过滤低表达基因 ---
  # 计算每个基因在所有样本中的 TPM 总和
  dplyr::mutate(sum_express = rowSums(across(everything()))) |>
  # 筛选标准：总 TPM >= 10 (去除噪音基因)
  dplyr::filter(sum_express >= 10) |>
  # 移除临时的 sum_express 列
  dplyr::select(-c(sum_express)) |>
  # 清理列名：去掉 TPM_RPK_ 前缀，还原为样本名 (如 Bud_rep1)
  dplyr::rename_with(~ .x %>% 
                       str_remove("TPM_RPK_"))

# =======================================================
# 步骤 3: 合并生物学重复 (Merge Replicates)
# =======================================================
# 目标：将 Bud_rep1, Bud_rep2 合并为 Bud 的平均值
gene_matrix_for_tispec <- gene_matrix_tpm %>%
  tibble::rownames_to_column(var = "Geneid") %>% 
  # 宽变长：方便按组计算
  tidyr::pivot_longer(
    cols = -Geneid,
    names_to = "Sample_ID",
    values_to = "TPM_Value"
  ) %>%
  # 提取组织名：去掉 _rep 及其后面的内容
  dplyr::mutate(
    Tissue = sub("_rep.*", "", Sample_ID) 
  ) %>%
  # 按 基因 和 组织 分组计算平均值
  dplyr::group_by(Geneid, Tissue) %>%
  dplyr::summarise(
    Mean_TPM = mean(TPM_Value, na.rm = TRUE), 
    .groups = 'drop'
  ) %>%
  # 长变宽：变回矩阵格式 (Gene x Tissue)
  tidyr::pivot_wider(
    names_from = Tissue,
    values_from = Mean_TPM
  ) %>%
  as.data.frame() |>
  tibble::column_to_rownames(var = "Geneid")

# =======================================================
# 步骤 4: Extended Tau 特异性分析 (Specificity Analysis)
# =======================================================
# 4.1 计算基础 Tau 分数
tau_scores <- apply(gene_matrix_for_tispec, 1, calc_tau_manual)

# 4.2 运行 Extended Tau 算法 (识别多组织特异性)
# 阈值 Z=2.0 对应约 95.4% 的置信区间
extended_tau_genes <- identify_extended_tau(gene_matrix_for_tispec, tau_scores, z_threshold = 2.0)

# 4.3 合并表达量信息以便查看
# 注意：这里假设 gene_matrix_for_tispec_format 是你想合并的表达矩阵，通常就是 gene_matrix_for_tispec 转了列名的版本
# 如果 gene_matrix_for_tispec 已经是 Geneid 做行名的 data.frame，需要先转为列
gene_express_df <- gene_matrix_for_tispec %>% tibble::rownames_to_column("Geneid")

extended_tau_genes_gene_express <- extended_tau_genes |> 
  left_join(gene_express_df, by = 'Geneid')

# 4.4 保存结果
write.table(extended_tau_genes_gene_express,
            sep = "\t", row.names = F, quote = F,
            file.path(root_dir, 'RNA_SEQ_tissue_specificity_of_genes_extended_tau.tsv'))