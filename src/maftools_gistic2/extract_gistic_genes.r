#' 提取 GISTIC2 Amp/Del 区域基因并清洗
#'
#' @param file_path GISTIC2 结果文件的完整路径 (例如 "amp_genes.conf_90.txt")
#' @param region_prefix 给区域 ID 添加的前缀 (例如 "AP" 或 "DP")
#'
#' @return 返回一个处理好的 DataFrame/Tibble
extract_gistic_genes <- function(file_path, region_prefix) {

  require(data.table)
  require(tidyverse)
)
  # 1. 读取数据并转置
  raw_data <- fread(file_path, header = TRUE, sep = "\t")
  
  # 2. 数据清洗与转换
  processed_df <- raw_data |>
    t() |> 
    as.data.frame() |>
    # 过滤掉不需要的元数据行（这里对应转置后的 V1 列）
    filter(V1 != "q value") |> 
    tibble::rownames_to_column(var = 'amp_chr_id') |>
    # 移除前三列元数据 (V1=Cytoband/q-val, V2, V3)
    select(-c(V1, V2, V3)) |>
    rowwise() |>
    mutate(
      merged_genes = {
        x <- c_across(starts_with("V"))
        clean_x <- x[!is.na(x) & x != ""]
        paste(clean_x, collapse = ",")
      }
    ) |>
    ungroup() |>
    select(amp_chr_id, merged_genes) |>
    mutate(amp_chr_id = gsub("^X", "", amp_chr_id)) |>
    mutate(amp_chr_id = paste0(region_prefix, ":", amp_chr_id)) |>
    mutate(gene_count = str_count(merged_genes, ",") + 1) |>
    mutate(gene_count = ifelse(merged_genes == "", 0, gene_count)) |>
    arrange(desc(gene_count))
  
  return(processed_df)
}