#' Manual Calculation of Tau Specificity Index
#'
#' This function calculates the Tau specificity index for a numeric vector of gene expression.
#'
#' @param x A numeric vector representing gene expression values across different tissues.
#'
#' @return A single numeric value between 0 and 1. Returns 0 if max expression is 0.
#' @export
#'
#' @examples
#' expression_vec <- c(10, 100, 5, 2)
#' calc_tau_manual(expression_vec)
calc_tau_manual <- function(x) {
  # 避免全0行导致除以0错误
  if (max(x) == 0) return(0)
  
  # 1. 归一化：将表达量除以该基因的最大表达量
  x_hat <- x / max(x)
  
  # 2. 计算 Tau 公式
  # 公式: sum(1 - x_hat) / (n - 1)
  t <- sum(1 - x_hat) / (length(x) - 1)
  
  return(t)
}