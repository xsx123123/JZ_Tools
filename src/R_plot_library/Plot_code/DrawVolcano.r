# -------------------------------------------------------------------
#          DrawVolcano (Hakimi Optimized & Annotated Version)
# -------------------------------------------------------------------
#
#  - Function: Draws a volcano plot, highlighting up/down-regulated genes, 
#              and automatically labels the Top N genes.
#  - Updates: 
#    - Uses 'padj' (Adjusted P-value) for significance and Y-axis.
#    - "Released" key plotting parameters (labels, point size, colors).
#    - Fixed the p-value cutoff line bug (now automatically matches pvalCutoff).
#    - Optimized symmetrical scaling for the X-axis.
#
# -------------------------------------------------------------------

# Ensure these packages are loaded before calling the function:
# library(ggplot2)
# library(ggrepel)
# library(ggpubr)
# library(dplyr)

#' Draw a Volcano Plot
#'
#' @description
#' A highly customizable ggplot2 function for drawing volcano plots.
#' It takes a DESeq2 result data.frame and uses 'padj' and 'log2FoldChange'
#' to distinguish "Up-regulated", "Down-regulated", and "Non-significant" genes.
#'
#' @param deg_result (Data.frame) **Required**. 
#'   A data.frame that must contain:
#'   - 'Symbol' (Gene name), 
#'   - 'log2FoldChange' (LFC), 
#'   - 'pvalue' (for handling 0 values), 
#'   - 'padj' (for Y-axis and significance testing).
#' @param pvalCutoff (Numeric) **Required**. 
#'   The Adjusted P-value threshold for significance (e.g., 0.05).
#' @param LFCCutoff (Numeric) **Required**. 
#'   The log2 Fold Change threshold for significance (e.g., 1).
#' @param EXP_NAEE (Character) Optional. 
#'   Experiment name, used in the plot title and X-axis label. Defaults to "Volcano".
#' @param y_aes (Numeric) Optional. 
#'   Manually set the maximum value for the Y-axis. If missing, it's auto-calculated.
#'
#' @section Aesthetic Parameters:
#' @param label_n_top (Numeric) 
#'   Number of Top N genes to label (by padj, N for up and N for down). Defaults to 15.
#' @param label_size (Numeric) 
#'   Font size for gene labels. Defaults to 1.5.
#' @param label_force (Numeric) 
#'   Repulsion force for ggrepel labels. Defaults to 20.
#' @param label_max_overlaps (Numeric) 
#'   Max overlaps allowed for ggrepel labels. Defaults to 25.
#' @param point_size (Numeric) 
#'   Size of the points. Defaults to 0.1 (very small, good for large datasets).
#' @param point_alpha (Numeric) 
#'   Alpha transparency of the points. Defaults to 0.3.
#' @param plot_colors (Character Vector) 
#'   A **named vector** of 3 elements specifying colors.
#'   Must be named "Up-regulated", "Down-regulated", "Non-significant".
#'
#' @return (ggplot Object) 
#'   A ggplot2 object, which can be printed or modified further.
#'
#' @author (Your Name/GitHub ID)
#' @author (Hakimi - Optimization & Annotation)
#'
DrawVolcano_optimized <- function(
    deg_result,
    pvalCutoff,
    LFCCutoff,
    EXP_NAEE = "Volcano", 
    y_aes,
    
    # --- "Released" Parameters (Added Parameters) ---
    
    # Label Parameters
    label_n_top = 15,         
    label_size = 1.5,         
    label_force = 20,         
    label_max_overlaps = 25,  
    
    # Point Parameters
    point_size = 0.1,         
    point_alpha = 0.3,        
    
    # Color Parameters
    plot_colors = c(
      "Up-regulated" = "#ff3b30",
      "Down-regulated" = "#56B4E9",
      "Non-significant" = "#d3d3d3"
    )
) {
  
  # 1. Load required libraries (using 'require' is good practice in functions)
  require(ggplot2)
  require(ggrepel)
  require(ggpubr)
  require(dplyr)
  
  # --- 2. Data Processing & Cleaning (Optimized) ---
  
  # Check if 'Symbol' column exists
  if (!"Symbol" %in% colnames(deg_result)) {
    stop("Error: Input 'deg_result' data.frame must contain a 'Symbol' column.")
  }
  
  # Check for 'padj' and 'pvalue' columns
  if (!"padj" %in% colnames(deg_result) | !"pvalue" %in% colnames(deg_result)) {
    stop("Error: Input 'deg_result' data.frame must contain 'pvalue' and 'padj' columns.")
  }
  
  # Check for NAs and 0 p-values
  deg_result <- deg_result[!is.na(deg_result$padj) & !is.na(deg_result$pvalue), ]
  
  # Handle pvalue == 0 (for numerical stability)
  if (min(deg_result$pvalue) == 0) {
    message("Converting pvalue == 0 to the smallest possible non-zero value.")
    deg_result$pvalue[which(deg_result$pvalue == 0)] <- .Machine$double.xmin
  }
  
  # Handle padj == 0 (for -log10 calculation)
  min_padj_non_zero <- min(deg_result$padj[deg_result$padj > 0], na.rm = TRUE)
  if (min(deg_result$padj) == 0) {
    message("Converting padj == 0 to a very small value (0.1x min non-zero padj) for plotting.")
    if (is.infinite(min_padj_non_zero)) { # Just in case all padj are 0
      min_padj_non_zero <- .Machine$double.xmin * 10 
    }
    deg_result$padj[which(deg_result$padj == 0)] <- min_padj_non_zero * 0.1
  }
  
  
  # Process all data using a dplyr pipe
  deg_data_processed <- deg_result %>%
    # Note: No longer renaming p_val, using 'padj' and 'pvalue' directly
    dplyr::mutate(
      # [Key Update] Y-axis uses padj (Adjusted P-value)
      log10 = -log10(padj),
      
      # [Key Update] Grouping uses padj (Adjusted P-value)
      Group = case_when(
        (padj < pvalCutoff) & (log2FoldChange > LFCCutoff)  ~ "Up-regulated",
        (padj < pvalCutoff) & (log2FoldChange < -LFCCutoff) ~ "Down-regulated",
        TRUE                                              ~ "Non-significant"
      ),
      
      # Set Group as factor to control legend order and colors
      Group = factor(Group, levels = names(plot_colors))
    ) %>%
    
    # Sort by padj, preparing for 'head()'
    dplyr::arrange(padj)
  
  # --- 3. Prepare Labels ---
  
  # Use the 'released' `label_n_top` parameter
  deg_result_up <- deg_data_processed %>%
    filter(Group == "Up-regulated") %>%
    head(label_n_top)
    
  deg_result_down <- deg_data_processed %>%
    filter(Group == "Down-regulated") %>%
    head(label_n_top)
    
  # --- 4. Axis Range Calculation (Your original logic, optimized) ---
  
  # Y-axis
  if (missing(y_aes)) {
    y_aes_data <- deg_data_processed$log10
    y_aes_data <- y_aes_data[is.finite(y_aes_data)] # Remove Inf
    
    if (length(y_aes_data) == 0) {
      y_aes_value <- 10 # Default value if no data
    } else {
      y_1 <- sort(y_aes_data, decreasing = TRUE)[1]
      y_2 <- sort(y_aes_data, decreasing = TRUE)[2]
      
      if ( max(y_aes_data) > 300){
        y_aes_value <- 250
      } else {
        if(is.na(y_2) || (y_1/y_2 > 1.4)){ # Check if y_2 exists
          y_aes_value <- (y_1+y_2)/2
          if(is.na(y_aes_value)) y_aes_value <- y_1 * 1.1 # Handle case where y_2 was NA
        } else {
          y_aes_value <- max(y_aes_data)*1.1
        }
      }
    }
  } else {
    y_aes_value <- y_aes
  }
  
  # X-axis (symmetrical logic)
  x_max_abs <- max(abs(na.omit(deg_data_processed$log2FoldChange)))
  if (x_max_abs > 7.5) {
    x_limit <- 7.5 * 1.7  # Multiply by your original 1.7 scale factor
  } else {
    x_limit <- x_max_abs * 1.7
  }
  if (x_limit < 3) x_limit <- 3 # Ensure a minimum X-axis range
  
  
  # --- 5. Plotting (ggplot) ---
  
  p <- ggplot(deg_data_processed, aes(x = log2FoldChange, y = log10)) +
    
    # Main layer: use 'released' parameters
    geom_point(
      aes(fill = Group, color = Group), # Map fill and color
      shape = 21,                     # Circle with outline
      size = point_size,              # <--- 'Released' parameter
      alpha = point_alpha             # <--- 'Released' parameter
    ) +
    
    # Color settings: use 'released' parameters
    scale_fill_manual(values = plot_colors, name = "Group") +
    scale_color_manual(values = plot_colors, name = "Group") +
    
    # --- Key Bug Fix ---
    # Horizontal line now uses the `pvalCutoff` variable
    geom_hline(yintercept = -log10(pvalCutoff), lty = 2, col = "black", lwd = 0.2) +
    
    geom_vline(xintercept = LFCCutoff, lty = 2, col = "black", lwd = 0.2) +
    geom_vline(xintercept = -LFCCutoff, lty = 2, col = "black", lwd = 0.2) +
    
    # Labels: use 'released' parameters
    geom_text_repel(
      data = deg_result_up, 
      aes(label = Symbol),
      size = label_size,              # <--- 'Released' parameter
      force = label_force,            # <--- 'Released' parameter
      max.overlaps = label_max_overlaps, # <--- 'Released' parameter
      # --- (Your other original styles) ---
      colour="black", fontface="bold.italic", segment.alpha = 0.5,
      segment.size = 0.15, segment.color = "black", min.segment.length=0,
      box.padding=unit(0.2, "lines"), point.padding=unit(0, "lines"),
      max.iter = 3e3, arrow=arrow(length = unit(0.02, "inches"))
    ) +
    geom_text_repel(
      data = deg_result_down,
      aes(label = Symbol),
      size = label_size,              # <--- 'Released' parameter
      force = label_force,            # <--- 'Released' parameter
      max.overlaps = label_max_overlaps, # <--- 'Released' parameter
      # --- (Your other original styles) ---
      colour="black", fontface="bold.italic", segment.alpha = 0.5,
      segment.size = 0.15, segment.color = "black", min.segment.length=0,
      box.padding=unit(0.2, "lines"), point.padding=unit(0, "lines"),
      max.iter = 3e3, arrow=arrow(length = unit(0.02, "inches"))
    ) +
    
    # Axes and Titles
    scale_x_continuous(limits = c(-x_limit, x_limit), n.breaks = 8) +
    scale_y_continuous(limits = c(0, y_aes_value), n.breaks = 6, expand = c(0, 0)) +
    
    labs(
      x = bquote("RNA-seq " * log[2] * " fold change " * .(EXP_NAEE) * ""),
      # [Key Update] Y-axis label now reflects that it plots 'padj'
      y = expression(paste(-log[10], " (Adjusted P-value)")), 
      title = paste0(EXP_NAEE," Volcano Plot")
    ) +
    
    # Theme
    theme_pubr() +
    theme(
      legend.position = "bottom",
      plot.title = element_text(hjust = 0.5)
    ) +
    
    # Legend
    guides(
      # Ensure color and fill legends are merged
      color = guide_legend(override.aes = list(size=4, alpha=0.5, ncol=2)),
      fill = guide_legend(override.aes = list(size=4, alpha=0.5, ncol=2))
    )
    
  return(p)
}