plot_nucmer_dotplot <- function(deltafile_path,
                                minl_filter=10000,
                                flanks_size=1e4,
                                alpha=0.3,
                                size=0.3,
                                shape=0) {
  require(tidyverse)
  require(ggplot2)
  ## ---------------------------------
  ## 辅助函数 1: 读取 .delta 文件
  ## ---------------------------------
  # 此函数将 NUCmer 的 .delta 文件解析为易于处理的数据框
  readDelta <- function(deltafile){
    lines = scan(deltafile, 'a', sep='\n', quiet=TRUE)
    lines = lines[-1] # 跳过第一行（版本信息）
    lines.l = strsplit(lines, ' ')
    lines.len = lapply(lines.l, length) %>% as.numeric
    lines.l = lines.l[lines.len != 1]
    lines.len = lines.len[lines.len != 1]
    
    # 解析头部信息 (4个元素: ">rid qid")
    head.pos = which(lines.len == 4)
    head.id = rep(head.pos, c(head.pos[-1], length(lines.l)+1)-head.pos)
    
    # 解析比对行 (7个元素: rs re qs qe error sim...)
    mat = matrix(as.numeric(unlist(lines.l[lines.len==7])), 7)
    res = as.data.frame(t(mat[1:5,]))
    colnames(res) = c('rs','re','qs','qe','error') # rs: Reference Start, qs: Query Start
    
    # 匹配头部信息到比对行
    res$qid = unlist(lapply(lines.l[head.id[lines.len==7]], '[', 2))
    res$rid = unlist(lapply(lines.l[head.id[lines.len==7]], '[', 1)) %>% gsub('^>', '', .)
    # 确定链向 (正向: qs < qe; 负向: qs > qe)
    res$strand = ifelse(res$qe-res$qs > 0, '+', '-')
    return(res)
  }
  
  ## ---------------------------------
  ## 辅助函数 2: 过滤和排序
  ## ---------------------------------
  # 此函数根据最小长度和侧翼区域进行过滤和排序
  filterMum <- function(df, minl=1000, flanks=1e4){
    # 1. 确定比对区域的边界
    coord = df %>% dplyr::filter(abs(re-rs) > minl) %>% dplyr::group_by(qid, rid) %>%
      dplyr::summarize(qsL=min(qs)-flanks, qeL=max(qe)+flanks, rs=median(rs)) %>%
      ungroup %>% arrange(desc(rs)) %>%
      dplyr::mutate(qid=factor(qid, levels=unique(qid))) %>% dplyr::select(-rs)
    
    # 2. 过滤掉边界外的匹配段
    merge(df, coord) %>% dplyr::filter(qs>qsL, qe<qeL) %>%
      dplyr::mutate(qid=factor(qid, levels=levels(coord$qid))) %>% dplyr::select(-qsL, -qeL)
  }
  
  # --- 1. 数据读取与过滤 ---
  nucmer_data <- readDelta(deltafile_path)
  mumgp.filt <- filterMum(nucmer_data, minl=minl_filter, flanks=flanks_size)
  
  if (nrow(mumgp.filt) == 0) {
    stop("经过过滤后，数据框中没有比对匹配片段。请检查 minl_filter 参数。")
  }
  
  # --- 2. 单位自动选择 ---
  # 基于最大坐标值选择 Mbp 还是 Kbp
  max_coord = max(mumgp.filt$qe, mumgp.filt$re)
  
  if (max_coord >= 1000000) { # 1 Mbp 或以上
    kbp_labels <- function(x) {
      paste0(round(x / 1e6, 0))
    }
    labs = "(Mbp)"
  } else { # 小于 1 Mbp
    kbp_labels <- function(x) {
      paste0(round(x / 1e3, 0))
    }
    labs = "(Kbp)"
  }
  
  # --- 3. 绘图 ---
  p <- ggplot(mumgp.filt,
              aes(x=rs,xend=re,
                  y=qs,yend=qe,
                  colour=strand)) + 
    geom_segment(linewidth = 0.8) +
    # 使用 shape = 0 (空心方形) 保证了点不会被 fill 填充
    geom_point(alpha=alpha, size = size, shape = shape) + 
    scale_x_continuous(expand = c(0,0), 
                       n.breaks = 10,
                       labels = kbp_labels) +
    scale_y_continuous(expand = c(0,0), 
                       n.breaks = 10,
                       labels = kbp_labels) +
    scale_color_manual(values = c("-" = "#0072B2", "+" = "#D55E00"), # 增加图例描述
                       name = "Strand") +
    # 根据 qid/rid 自动生成轴标题，并包含单位
    labs(x = paste0(levels(factor(mumgp.filt$rid)), ' ', labs),
         y = paste0(levels(factor(mumgp.filt$qid)), ' ', labs)) +
    theme_bw() +
    theme(axis.text.x = element_text(angle = 90, hjust = 0.5, vjust = 0.5),
          legend.text = element_text(size = 10),
          aspect.ratio = 1 # 保持方形比例，更适合点阵图
    )
  
  return(p)
}