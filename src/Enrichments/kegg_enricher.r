#!/usr/bin/env Rscript
# Offline KEGG ORA. KEGG.db must be installed in the active R environment.
suppressPackageStartupMessages(library(optparse))

main <- function() {
  options(stringsAsFactors = FALSE)
  parser <- OptionParser(option_list = list(
    make_option('--table', type='character'),
    make_option('--name', type='character', default='Enrich'),
    make_option('--out_dir', type='character', default='kegg_results'),
    make_option('--organism', type='character'),
    make_option('--gene_col', type='character', default='ENSEMBL'),
    make_option('--id_map', type='character', help='Headerless two-column TSV: source gene ID, KEGG gene ID'),
    make_option('--cutoff', type='double', default=0.05),
    make_option('--padj_th', type='double', default=0.05),
    make_option('--lfc_th', type='double', default=1)
  ))
  opt <- parse_args(parser)
  if (is.null(opt$table) || is.null(opt$organism)) stop('--table and --organism are required')
  if (!requireNamespace('clusterProfiler', quietly=TRUE)) stop('Install clusterProfiler in the enrichment R environment')
  if (!requireNamespace('KEGG.db', quietly=TRUE)) {
    stop('Offline KEGG requires KEGG.db. Install your KEGG.db tar.gz in this R environment; no online fallback is used.')
  }
  message('Offline KEGG: organism=', opt$organism,
          '; clusterProfiler=', packageVersion('clusterProfiler'),
          '; KEGG.db=', packageVersion('KEGG.db'))
  # Fail early for species missing from the installed internal database.
  # Internal KEGG enrichment uses KEGG gene IDs and requires keyType="kegg".
  mapping <- get('KEGGPATHID2EXTID', envir=asNamespace('KEGG.db'))
  pathway_genes <- as.list(mapping)
  species_paths <- startsWith(names(pathway_genes), opt$organism)
  if (!any(species_paths)) stop('Installed KEGG.db has no pathways for organism: ', opt$organism)
  annotated <- unique(as.character(unlist(pathway_genes[species_paths], use.names=FALSE)))
  annotated <- sub(paste0('^', opt$organism, ':'), '', annotated)

  first <- readLines(opt$table, n=1)
  df <- read.table(opt$table, header=TRUE, sep=if (grepl(',', first)) ',' else '\t',
                   quote='"', comment.char='', check.names=FALSE, colClasses='character')
  required <- c(opt$gene_col, 'padj', 'log2FoldChange')
  if (!all(required %in% names(df))) stop('Missing columns: ', paste(setdiff(required, names(df)), collapse=', '))
  ids <- trimws(df[[opt$gene_col]])
  padj <- as.numeric(df$padj)
  lfc <- as.numeric(df$log2FoldChange)
  eligible <- !is.na(padj) & is.finite(lfc) & !is.na(ids) & nzchar(ids)
  df <- data.frame(source=ids[eligible], padj=padj[eligible], lfc=lfc[eligible])
  if (!is.null(opt$id_map)) {
    id_map <- read.delim(opt$id_map, header=FALSE, colClasses='character',
                         quote='', comment.char='', check.names=FALSE)
    if (ncol(id_map) != 2) stop('id_map must have exactly two columns and no header')
    names(id_map) <- c('source', 'target')
    id_map[] <- lapply(id_map, trimws)
    id_map <- unique(id_map)
    # Exact IDs only: never silently collapse biologically distinct versioned IDs.
    df <- merge(df, id_map, by='source', all.x=TRUE, sort=FALSE)
  } else {
    df$target <- df$source
  }
  df$target <- sub(paste0('^', opt$organism, ':'), '', df$target)
  mapped <- !is.na(df$target) & nzchar(df$target)
  universe <- intersect(unique(df$target[mapped]), annotated)
  message('Tested source genes=', length(unique(df$source)),
          '; mapped source genes=', length(unique(df$source[mapped])),
          '; annotated background genes=', length(universe))
  if (length(universe) == 0) stop('No tested genes match the offline KEGG annotation. Check organism, ID mapping and KEGG.db coverage.')
  dir.create(opt$out_dir, recursive=TRUE, showWarnings=FALSE)
  for (direction in c('UP', 'DOWN')) {
    selected <- df$padj < opt$padj_th & if (direction == 'UP') df$lfc >= opt$lfc_th else df$lfc <= -opt$lfc_th
    input_count <- length(unique(df$source[selected]))
    genes <- intersect(unique(df$target[selected & mapped]), universe)
    result <- NULL
    if (length(genes)) {
      result <- clusterProfiler::enrichKEGG(
        gene=genes, organism=opt$organism, keyType='kegg',
        universe=universe, pAdjustMethod='BH',
        pvalueCutoff=opt$cutoff, qvalueCutoff=opt$cutoff,
        use_internal_data=TRUE
      )
    }
    output <- if (is.null(result)) data.frame() else as.data.frame(result)
    if (!nrow(output)) {
      output <- data.frame(ID='None',
        Description=if (!length(genes)) 'No differential genes matched KEGG background' else 'No significant KEGG enrichment',
        GeneRatio=paste0('0/', length(genes)), BgRatio=paste0('0/', length(universe)),
        pvalue=1, p.adjust=1, qvalue=1, geneID='None', Count=0)
    } else {
      output <- output[order(output$p.adjust), , drop=FALSE]
    }
    output$Input_Gene_Count <- input_count
    output$Background_Match_Count <- length(genes)
    output$Universe_Gene_Count <- length(universe)
    write.csv(output, file.path(opt$out_dir, paste0(opt$name, '_KEGG_', direction, '.csv')), row.names=FALSE)
  }
}
main()
