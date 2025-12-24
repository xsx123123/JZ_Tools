library(data.table)
library(tidyverse)

# ================== 1. 路径与文件读取 ==================
# 定义基础路径
base_dir <- "/home/zj/analysis/EGFR_liu_project"
gistic2_dir <- file.path(base_dir, "01.gistic/gistic2_RESULT")
clin_file <- file.path(base_dir, "02.maftools_update/cli_update.txt")
output_file <- file.path(gistic2_dir, "CytobandSummary_info_add.samples.tsv")

# 读取临床信息并制作映射向量
clin <- fread(clin_file) %>%
  dplyr::select(Tumor_Sample_Barcode, ID)

# 创建命名向量: key是旧ID, value是新ID (Tumor_Sample_Barcode)
clin_map <- setNames(clin$Tumor_Sample_Barcode, clin$ID)

# ================== 2. 处理 all_lesions 文件 ==================
# 读取并清洗数据
al <- fread(file.path(gistic2_dir, "all_lesions.conf_90.txt"), header = TRUE, sep = "\t") %>%
  # 1. 重命名列：去除 .call 后缀，并应用临床信息的 ID 映射
  dplyr::rename_with(~gsub("\\.call$", "", .x)) %>%
  dplyr::rename(any_of(clin_map)) %>%
  
  # 2. 过滤不需要的行 (CN values)
  dplyr::filter(!str_detect(`Unique Name`, "CN values")) %>%
  
  # 3. 批量清洗 Unique Name (使用 str_replace_all 替代多个 gsub，更整洁)
  dplyr::mutate(`Unique Name` = `Unique Name` %>%
                  str_replace_all(" ", "_") %>%
                  str_replace_all("Amplification_Peak_", "AP_") %>%
                  str_replace_all("Deletion_Peak_", "DP_") %>%
                  str_replace_all("__", "_")) %>%
  
  # 4. 生成新的唯一 ID
  dplyr::mutate(new_id = paste0(`Unique Name`, ":", Descriptor))

# ================== 3. 核心提取逻辑 (无需循环) ==================

# 定义需要排除的元数据列名 (这些是 GISTIC 的固定列)
metadata_cols <- c("Unique Name", "Descriptor", "Wide Peak Limits",
                   "Peak Limits", "Region Limits", "q values",
                   "Residual q values after removing segments shared with higher peaks",
                   "Broad or Focal", "Amplitude Threshold")

# 如果你有特定的 CytobandSummary_info 列表想要筛选，可以在这里加 filter
# target_ids <- CytobandSummary_info$Unique_Name
# al <- al %>% filter(new_id %in% target_ids) 

final_result <- al %>%
  # 移除元数据列，只保留 new_id 和 样本列
  dplyr::select(new_id, everything(), -any_of(metadata_cols)) %>%
  
  # 【关键步骤】宽表变长表：将所有样本列合并为两列 (Sample 和 Value)
  # 这一步代替了你的 for 循环和 t() 转置
  tidyr::pivot_longer(
    cols = -new_id,        # 除了 new_id 外的所有列（即样本列）
    names_to = "Sample",   # 列名变为 Sample 列
    values_to = "Value"    # 数值变为 Value 列
  ) %>%
  
  # 筛选阈值 (对应你代码中的 V1 > 0)
  dplyr::filter(Value > 0) %>%
  
  # 按 Peak ID 分组聚合
  dplyr::group_by(new_id) %>%
  dplyr::summarise(
    Sample_Count = n(),                    # 计算样本数
    Sample_List = paste(Sample, collapse = ";") # 拼接样本名
  ) %>%
  dplyr::ungroup() %>%
  
  # 重命名以匹配你的输出格式
  dplyr::rename(Unique_ID = new_id)

# ================== 4. 保存结果 ==================
# 写入文件
fwrite(final_result, output_file, sep = "\t")

message(paste("✅ 处理完成！结果已保存至:", output_file))
# 打印前几行预览
print(head(final_result))