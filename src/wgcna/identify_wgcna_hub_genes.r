#' @title 识别 WGCNA 模块中的核心基因 (Hub Genes)
#' @description 
#' 该函数用于分析 WGCNA 结果中特定模块与特定性状的关系。
#' 它会自动执行以下步骤：
#' 1. 计算基因显著性 (GS) 和 模块成员度 (MM)。
#' 2. 绘制 MM vs GS 的相关性散点图并保存为 PNG 图片。
#' 3. 根据设定的阈值筛选核心基因 (Hub Genes)。
#' 4. 将筛选结果保存为 CSV 文件，并返回筛选后的数据框。
#'
#' @param datExpr 数据框或矩阵。基因表达矩阵，行名为样本，列名为基因。
#' @param datTraits 数据框。性状数据，行名为样本，列名为性状。
#' @param MEs 数据框。模块特征基因 (Module Eigengenes) 矩阵，行名为样本。
#' @param moduleColors 字符向量。每个基因对应的模块颜色标签 (长度应与 datExpr 的列数一致)。
#' @param target_module 字符串。目标模块的颜色名称 (例如 "turquoise")，不带 "ME" 前缀。
#' @param target_trait 字符串。目标性状的列名 (必须存在于 datTraits 的列名中)。
#' @param save_dir 字符串。结果保存的目录路径，默认为 "Results"。若不存在会自动创建。
#' @param mm_cutoff 数值。模块成员度 (Module Membership) 的筛选阈值 (绝对值)，默认为 0.8。
#' @param gs_cutoff 数值。基因显著性 (Gene Significance) 的筛选阈值 (绝对值)，默认为 0.5。
#'
#' @return 返回一个数据框 (tibble)，包含筛选出的核心基因及其对应的 Module、MM 值、GS 值和 P 值。
#' @export
identify_wgcna_hub_genes <- function(
    datExpr,               
    datTraits,             
    MEs,                   
    moduleColors,          
    target_module,         
    target_trait,          
    save_dir = "Results",  
    mm_cutoff = 0.8,       
    gs_cutoff = 0.5        
) {
  # ... (这里接你原本的函数体内容) ...
  
  # --- 0. 检查与准备 ---
  if(!dir.exists(save_dir)) dir.create(save_dir, recursive = TRUE)
  
  cat(paste0("\n======================================================\n"))
  cat(paste0("正在分析模块: ", target_module, " | 目标性状: ", target_trait, "\n"))
  cat(paste0("======================================================\n"))
  
  nSamples <- nrow(datExpr)
  all_genes <- colnames(datExpr)
  
  # --- 1. 计算基因性状显著性 (GS) ---
  cat("-> 正在计算 Gene Significance (GS)...\n")
  
  # 提取性状列
  if(!target_trait %in% colnames(datTraits)) stop("错误: 在 datTraits 中找不到目标性状列名！")
  trait_df <- as.data.frame(datTraits[, target_trait])
  names(trait_df) <- target_trait
  
  # 计算 GS
  geneTraitSignificance <- as.data.frame(cor(datExpr, trait_df, use = "p"))
  GSPvalue <- as.data.frame(corPvalueStudent(as.matrix(geneTraitSignificance), nSamples))
  
  # 规范命名
  GS_col_name <- paste0("GS.", target_trait)
  names(geneTraitSignificance) <- GS_col_name
  names(GSPvalue) <- paste0("p.GS.", target_trait)
  
  # --- 2. 计算模块归属度 (MM) ---
  cat("-> 正在计算 Module Membership (MM)...\n")
  
  geneModuleMembership <- as.data.frame(cor(datExpr, MEs, use = "p"))
  MMPvalue <- as.data.frame(corPvalueStudent(as.matrix(geneModuleMembership), nSamples))
  
  # 处理 ME 命名前缀 (移除 "ME" 得到颜色名)
  ME_color_names <- substring(names(MEs), 3)
  names(geneModuleMembership) <- paste0("MM.", ME_color_names)
  names(MMPvalue) <- paste0("p.MM.", ME_color_names)
  
  # 定义目标模块的 MM 列名
  MM_col_name <- paste0("MM.", target_module)
  
  if(!MM_col_name %in% names(geneModuleMembership)) {
    stop(paste("错误: 在 MEs 中找不到目标模块:", target_module))
  }
  
  # --- 3. 整合数据并绘制 MM vs GS 散点图 ---
  cat("-> 正在绘制散点图...\n")
  
  # 构建绘图数据
  plot_data <- data.frame(
    Gene = all_genes,
    Module = moduleColors
  ) %>%
    left_join(geneModuleMembership %>% tibble::rownames_to_column("Gene"), by = "Gene") %>%
    left_join(geneTraitSignificance %>% tibble::rownames_to_column("Gene"), by = "Gene") %>%
    filter(Module == target_module) # 只保留目标模块的基因
  
  # 计算目标模块内的相关性
  cor_val <- cor(plot_data[[MM_col_name]], plot_data[[GS_col_name]], use = "p")
  correlation_text <- sprintf("Cor = %.2f", cor_val)
  
  # 绘图
  # 注意：为了兼容性和安全性，这里使用 .data[[]] 方式引用变量列名
  p <- ggplot(plot_data, aes(x = .data[[MM_col_name]], y = .data[[GS_col_name]])) +
    geom_point(alpha = 0.6, color = target_module) +
    geom_smooth(method = "lm", color = "red", se = FALSE) +
    labs(
      title = paste0("Module Membership vs. Gene Significance\n(Module: ", target_module, ", Trait: ", target_trait, ")"),
      x = paste0("Module Membership (MM) in ", target_module),
      y = paste0("Gene Significance (GS) for ", target_trait)
    ) +
    annotate("text", 
             x = min(plot_data[[MM_col_name]], na.rm = TRUE), 
             y = max(plot_data[[GS_col_name]], na.rm = TRUE), 
             label = correlation_text, hjust = 0, vjust = 1, size = 5) +
    theme_bw() +
    theme(plot.title = element_text(hjust = 0.5))
  
  # 保存图片
  plot_filename <- file.path(save_dir, paste0("Scatter_MM_GS_", target_module, "_", target_trait, ".png"))
  ggsave(plot_filename, plot = p, width = 7, height = 7)
  cat(paste("   [图片已保存]:", plot_filename, "\n"))
  
  # --- 4. 筛选并导出核心基因 ---
  cat("-> 正在筛选核心基因 (Hub Genes)...\n")
  
  # 筛选逻辑：绝对值大于阈值
  hub_genes <- plot_data %>%
    filter(
      abs(.data[[MM_col_name]]) > mm_cutoff & 
      abs(.data[[GS_col_name]]) > gs_cutoff
    ) %>%
    dplyr::arrange(desc(abs(.data[[MM_col_name]]))) # 按 MM 绝对值降序排列
  
  # 输出信息
  cat(paste0("   筛选标准: |MM| > ", mm_cutoff, " & |GS| > ", gs_cutoff, "\n"))
  cat(paste0("   结果: 共找到 ", nrow(hub_genes), " 个核心基因。\n"))
  
  # 保存 CSV
  csv_filename <- file.path(save_dir, paste0("HubGenes_", target_module, "_", target_trait, ".csv"))
  write_csv(hub_genes, csv_filename)
  cat(paste("   [列表已保存]:", csv_filename, "\n"))
  
  cat("完成！\n\n")
  
  # 返回核心基因数据框
  return(hub_genes)
}