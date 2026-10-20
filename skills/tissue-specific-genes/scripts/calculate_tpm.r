#' 将原始计数转换为 TPM (Transcripts Per Million)
#'
#' @param count_matrix 包含 Geneid, Length 和 Count 列的数据框
#' @param count_col_pattern 用于识别计数列的正则表达式 (默认识别含 "_rep" 的列)
#'
#' @return 返回过滤低表达基因后的 TPM 矩阵
calculate_tpm <- function(data, count_col_pattern = "_rep") {
  require(dplyr)
  require(stringr)
  
  # 1. 识别计数列
  count_cols <- names(data)[grepl(count_col_pattern, names(data))]
  
  if(length(count_cols) == 0) stop("未找到计数列，请检查 count_col_pattern")
  if(!"Length" %in% names(data)) stop("数据框中必须包含 'Length' 列")

  # 2. 计算 RPK (Reads Per Kilobase)
  # 公式: Count / (Length_kb)
  rpk_df <- data |>
    dplyr::mutate(
      across(all_of(count_cols), 
             ~ .x / (Length / 1000))
    ) |>
    dplyr::select(all_of(count_cols)) # 此时这些列已经是 RPK 值了
  
  # 3. 计算 Scaling Factors (Sum of RPKs per sample)
  sum_rpk <- colSums(rpk_df)
  
  # 4. 计算 TPM
  # 公式: (RPK / Sum_RPK) * 1e6
  tpm_df <- rpk_df |>
    dplyr::mutate(
      across(everything(),
             ~ (.x / sum_rpk[cur_column()]) * 1e6)
    )
  
  # 5. 添加 Geneid (假设 data 第一列是 Geneid 或行名)
  # 如果 Geneid 是一列
  if("Geneid" %in% names(data)) {
    tpm_df <- bind_cols(Geneid = data$Geneid, tpm_df)
  } else {
    tpm_df <- bind_cols(Geneid = rownames(data), tpm_df)
  }
  
  return(tpm_df)
}