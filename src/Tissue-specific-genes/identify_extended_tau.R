#' Identify Tissue-Specific Genes using Extended Tau Method
#'
#' Filters genes based on standard Tau threshold and then assigns them to one or multiple
#' tissues using a statistical distance method (Extended Tau).
#'
#' @param expression_matrix A data frame or matrix of gene expression (e.g., TPM/FPKM).
#'   Rows should be genes, columns should be tissues. Must contain a column named "Geneid"
#'   or have Geneids as rownames.
#' @param tau_results A named numeric vector (names are GeneIDs, values are Tau) OR
#'   a data frame containing "Geneid" and "tau" columns.
#' @param z_threshold Numeric. The Z-score threshold for defining the statistical significant interval.
#'   Default is 1.96 (approx 95% CI). Higher values (e.g., 2.58) make the selection stricter.
#'
#' @return A data frame containing the identified specific genes, their specific tissues
#'   (comma-separated), and statistics. Returns NULL if no genes pass the filter.
#' @importFrom dplyr filter %>%
#' @importFrom tibble column_to_rownames
#' @importFrom stats sd
#' @export
#'
#' @examples
#' \dontrun{
#' # Assuming you have a matrix 'exp_mat' and tau results 'tau_res'
#' result <- identify_extended_tau(exp_mat, tau_res, z_threshold = 2.0)
#' }
identify_extended_tau <- function(expression_matrix, tau_results, z_threshold = 1.96) {
  
  # 1. 数据准备
  # -----------------------------------------------------------
  # 确保数据框是纯数值矩阵，行名为 Geneid
  if ("Geneid" %in% colnames(expression_matrix)) {
    exp_data <- tibble::column_to_rownames(expression_matrix, "Geneid")
  } else {
    exp_data <- expression_matrix
  }
  
  # 2. 初步筛选 (Standard Tau Logic)
  # -----------------------------------------------------------
  
  # 处理 tau_results 输入格式 (兼容向量或数据框)
  if (is.data.frame(tau_results)) {
    if ("tau" %in% colnames(tau_results)) {
      tau_vector <- tau_results$tau
      if ("Geneid" %in% colnames(tau_results)) {
        names(tau_vector) <- tau_results$Geneid
      } else {
        names(tau_vector) <- rownames(tau_results)
      }
    } else {
      stop("tau_results is a data frame but 'tau' column not found.")
    }
  } else {
    tau_vector <- tau_results
  }
  
  # 计算每个基因的 Max Expression 和 SD
  # 使用 base R 的 apply
  max_exps <- apply(exp_data, 1, max)
  sd_exps  <- apply(exp_data, 1, stats::sd)
  
  gene_stats <- data.frame(
    Geneid = rownames(exp_data),
    Max_Exp = max_exps,
    SD_Exp = sd_exps,
    Tau = tau_vector[match(rownames(exp_data), names(tau_vector))],
    stringsAsFactors = FALSE
  )
  
  # 执行筛选：Tau >= 0.85 且 Max_Exp >= 10
  # 使用 dplyr::filter
  specific_candidates <- dplyr::filter(gene_stats, Tau >= 0.85, Max_Exp >= 10)
  
  if (nrow(specific_candidates) == 0) {
    warning("No genes passed the Tau >= 0.85 and Max_Exp >= 10 threshold.")
    return(NULL)
  }
  
  # 3. Extended Tau: 判定多组织特异性
  # -----------------------------------------------------------
  
  results_list <- list()
  
  for (gene in specific_candidates$Geneid) {
    # 获取该基因的统计指标
    stats_row <- specific_candidates[specific_candidates$Geneid == gene, ]
    max_val <- stats_row$Max_Exp
    sd_val  <- stats_row$SD_Exp
    
    # 计算统计下限 (Cutoff)
    cutoff <- max_val - (sd_val * z_threshold)
    
    # 从原始矩阵中提取该基因所有组织的表达量
    gene_exprs <- unlist(exp_data[gene, ])
    
    # 找出所有大于 Cutoff 的组织名
    specific_tissues <- names(gene_exprs)[gene_exprs >= cutoff]
    
    # 存储结果
    results_list[[gene]] <- data.frame(
      Geneid = gene,
      Specific_Tissues = paste(specific_tissues, collapse = ","),
      Num_Tissues = length(specific_tissues),
      Max_Tissue = names(gene_exprs)[which.max(gene_exprs)],
      Max_Exp = max_val,
      Tau = stats_row$Tau,
      stringsAsFactors = FALSE
    )
  }
  
  # 4. 合并结果
  # -----------------------------------------------------------
  final_results <- do.call(rbind, results_list)
  rownames(final_results) <- NULL
  
  return(final_results)
}