# Enrichments：GO / KEGG 富集分析

本目录提供基于差异分析结果的 GO 和 KEGG 过度富集分析（ORA）脚本。脚本不负责差异分析或参考注释下载；对于 eggNOG 风格的非模式物种注释，可用转换器自动构建 GO 关联表和本地 KEGG 通路映射。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `go_enricher.r` | R 版 GO 富集。读取一张差异表，分别分析 UP 和 DOWN 基因。 |
| `kegg_enricher.r` | R 版 KEGG 富集。支持命令行差异表模式，也保留可被其他 R 脚本调用的函数接口。 |
| `deg_enrich_wrapper.py` | 批量读取多个 contrast，并调用 GO R 脚本；可选地同时调用 KEGG R 脚本。 |
| `annotation_to_enrichment.py` | 将 eggNOG 注释表转换为 RNAFlow 所需的 GO 关联和本地 KEGG 映射。 |
| `python/go_enrich.py` | Python 版 GO 富集，支持基因列表和差异表两种入口。 |
| `python/requirments.yaml` | Python 运行依赖清单（文件名沿用仓库现状）。 |

`python/README.md` 是 Python 脚本的独立说明；本文档说明整个目录的选择和组合方式。

## 运行前准备

### R 环境

GO 脚本需要以下 R 包：`optparse`、`log4r`、`tidyverse`、`ontologyIndex`、`clusterProfiler`。

KEGG 命令行脚本需要 `optparse`、`clusterProfiler`、`dplyr` 和 `ggplot2`；使用 `--id_map` 时还需要 `readr`，旧的 XLSX 函数接口需要 `readxl`。

### Python 环境

建议 Python 3.10 或更高版本（脚本使用 `str | list` 类型标注）。可在当前目录执行：

```bash
python -m pip install -r python/requirments.yaml
```

该文件虽然扩展名为 `.yaml`，内容实际是逐行的 pip requirements 格式。

### 参考文件

- GO OBO：例如 `go-basic.obo`。
- GO 关联表：必须与输入基因 ID 使用同一物种、同一版本的注释。
- KEGG 基因 ID 映射：可选的无表头两列 TSV（输入基因 ID、KEGG 基因 ID），并固定版本保存。KEGG 通路注释由 `clusterProfiler::enrichKEGG` 按 `--organism` 获取，因此运行时通常需要网络或可用缓存。

大型参考文件不随代码分发。建议记录版本、下载日期和 SHA-256；运行前先确认基因 ID（包括是否带版本号）能与关联表匹配。

### 非模式物种（eggNOG 注释）

非模式物种不需要伪造 KEGG organism code。配置 `STAR_index.<Genome_Version>.annotation_table` 后，工作流会在富集任务中自动生成：

- `go_annotation.tsv`：`gene<TAB>GO1,GO2,...`；
- `kegg_id_map.tsv`：输入基因 ID 到自身 ID 的本地映射；
- `kegg_term2gene.tsv`：`koXXXXX<TAB>gene`；
- `kegg_term2name.tsv`：本地 pathway ID 名称表。

eggNOG 表需要包含 `query`、`gos` 和 `kegg_pathway` 列。`query` 末尾的 `_mRNA` 会自动去掉，以匹配 RSEM/DESeq2 的 gene ID。`kegg_pathway` 中使用 `koXXXXX` 通路；`mapXXXXX` 记录会被忽略，避免把物种无关的 map 通路与基因重复计数。

例如 Dioscorea `ziyushenshu_v1` 可直接使用 `eggnog_highconf.tsv`；GO 使用同一个 OBO 文件解析，KEGG 使用本地 pathway-gene 映射，不调用 `enrichKEGG` 的物种数据库。番茄等已有 `organism`、`id_map`、`term2gene` 配置的物种仍走原有分支。

## 1. R 版 GO 富集

`go_enricher.r` 当前只接受差异表模式。表格可以是 CSV 或 TSV（脚本根据首行是否含逗号自动判断），默认需要以下列：

| 列 | 默认名称 | 含义 |
| --- | --- | --- |
| 基因 ID | `GeneID` | 输入基因标识 |
| 校正 p 值 | `padj` | 用于筛选差异基因 |
| log fold change | `log2FoldChange` | 用于区分 UP/DOWN |

筛选规则为 `padj < --padj_th` 且 `log2FoldChange >= --lfc_th`（UP）或 `<= - --lfc_th`（DOWN）。脚本会读取 OBO 和关联表建立 `TERM2GENE`，并在匹配率很低时尝试去除基因 ID 末尾的数字版本号。

示例：

```bash
Rscript src/Enrichments/go_enricher.r \
  --obo ref/go-basic.obo \
  --assoc ref/gene_association.tsv \
  --table results/contrast_DEG.csv \
  --name Control_vs_Treated \
  --out_dir results/enrichment \
  --padj_th 0.05 \
  --lfc_th 1 \
  --cutoff 0.05
```

常用参数还包括 `--gene_col`、`--padj_col`、`--lfc_col` 和 `--gene_regex 'pattern/replacement'`。`--cutoff` 是富集结果的显著性阈值；`--padj_th` 和 `--lfc_th` 是差异基因筛选阈值，三者作用不同。

输出目录中会生成：

- `{name}_GO_UP.csv`
- `{name}_GO_DOWN.csv`
- `{name}_GO_UP.png` / `{name}_GO_UP.pdf`
- `{name}_GO_DOWN.png` / `{name}_GO_DOWN.pdf`

每个方向默认生成简单横向柱状图：按 `p.adjust` 从小到大选择最多 10 条显著通路（`p.adjust < --cutoff`），横轴为命中基因数。不足 10 条时展示实际条数；没有显著通路时输出提示图。可用 `--top_n` 调整显示数量。

即使没有匹配基因或没有显著通路，也会写出带有原因和计数信息的空结果表。运行错误会以非零状态退出。运行日志写入输出目录的 `{name}_GO.log`，不同比较组使用独立日志。

## 2. R 版 KEGG 富集

`kegg_enricher.r` 与 `go_enricher.r` 一样是命令行脚本：读取一张差异表，按阈值拆分 UP/DOWN 后调用 `clusterProfiler::enrichKEGG`。`--id_map` 用于把物种基因 ID 转换为 KEGG ID；如果输入表已经是 KEGG 基因 ID，可以省略该参数。

运行示例：

```bash
Rscript src/Enrichments/kegg_enricher.r \
  --table results/contrast_DEG.csv \
  --name Control_vs_Treated \
  --out_dir results/kegg \
  --organism sly \
  --id_map ref/ITAG4.1.kegg.id \
  --cutoff 0.05 \
  --padj_th 0.05 \
  --lfc_th 1 \
  --min_gs 10 \
  --plot
```

KEGG 输入表必须包含 `--gene_col` 指定的基因列（默认 `GeneID`），以及 `padj`、`log2FoldChange` 两列（可分别用 `--padj_col`、`--lfc_col` 修改）。`--id_map` 必须是无表头两列 TSV：第一列为输入基因 ID，第二列为 KEGG 基因 ID；脚本会清理物种前缀和末尾版本号。

脚本默认生成 PNG/PDF 柱状图，不再需要额外加 `--plot`。每个方向按 `p.adjust` 排序展示最多 10 条显著通路，横轴为命中基因数；没有显著通路时生成提示图。`--top_n` 默认为 10。KEGG 通路查询依赖 `clusterProfiler` 的 KEGG 支持和网络/缓存状态。

每个方向通常会生成：

- `{name}_KEGG_UP_enrichments.csv` / `{name}_KEGG_DOWN_enrichments.csv`：按 `p.adjust < --cutoff` 筛选后的主结果；
- `{name}_KEGG_UP_enrichments_full.csv` / `{name}_KEGG_DOWN_enrichments_full.csv`：完整测试结果（有可测试结果时生成）；
- `{name}_KEGG_UP_enrichments.png` / `.pdf` 与 `{name}_KEGG_DOWN_enrichments.png` / `.pdf`。

主表与 `_full` 表使用同一次富集计算：主表是全量表中 `p.adjust < --cutoff` 的显著通路子集（默认阈值 0.05），`_full` 表还包含未达到该阈值的通路。两者都来自同一方向的基因列表；`_full` 并不表示整个 KEGG 数据库，仍受基因匹配、背景及通路大小等条件限制。如果没有显著通路，主表会写一行 `ID=None, Count=0` 的说明记录，这行不是实际通路。图形只选择显著通路，不会用全量表中的非显著条目补足 10 条。

## 3. 批量处理多个 contrast

`deg_enrich_wrapper.py` 从 `--deg_info` 的第一列读取 contrast 名称，并按文库类型寻找差异表：

- `RNA`：`{contrast}_DEG.csv`
- `ATAC`：`{contrast}_Differential_Peaks.csv`

示例：

```bash
python src/Enrichments/deg_enrich_wrapper.py \
  --rscript src/Enrichments/go_enricher.r \
  --deg_info results/All_Contrast_DEG_Statistics.csv \
  --deg_dir results/DEG \
  --lib_type RNA \
  --obo ref/go-basic.obo \
  --assoc ref/gene_association.tsv \
  --out_dir results/enrichment_batch \
  --gene_col GeneID \
  --cutoff 0.05 \
  --padj_th 0.05 \
  --lfc_th 1 \
  --threads 4
```

启用 KEGG 时，配置文件至少包含 `enabled`、`organism`，并额外传入 `--kegg_rscript`；可选 `id_map`：

```json
{
  "enabled": true,
  "organism": "sly",
  "gene_col": "GeneID",
  "id_map": "ref/gene_to_kegg.tsv"
}
```

```bash
python src/Enrichments/deg_enrich_wrapper.py ... \
  --kegg_config ref/kegg.json \
  --kegg_rscript src/Enrichments/kegg_enricher.r
```

`--threads` 指定同时运行的比较组数量，独立调用默认 1。每个比较组内依次执行 GO、KEGG，比较组之间并行；每个 R 进程的 BLAS/OpenMP 限制为 1 线程。各组的标准输出和错误输出分别写入 `logs/{contrast}.console.log`。任一 contrast 文件缺失或子进程失败，最终命令会以非零状态退出；请检查日志中列出的 contrast 名称和文件名。

RNAFlow 中通过 `parameter.threads.Enrichments` 配置并发数（默认 4），实际受 Snakemake 分配的 CPU 数限制。enrichments skill 的 `batch` manifest 同样支持 `"threads": 4`。每个并行 R 进程会独立加载参考注释，增加并发数时也需要增加可用内存。

RNAFlow 的各组控制台日志位于 `logs/07.Enrichments/contrasts/`，规则失败后也能保留。独立调用可使用 `--log-dir` 指定该目录。

## 4. Python GO 富集

Python 版适合不需要 R 的轻量工作流，底层使用 Polars 读取关联表、GOATOOLS 解析 OBO、GSEApy 执行富集。

成功计算后默认额外输出 `GO_enrichment_top10.png` / `.pdf`，按 `Adjusted P-value` 排序展示最多 10 条显著 GO 条目；无显著结果时输出提示图。

### 基因列表模式

```bash
python src/Enrichments/python/go_enrich.py run-list \
  --gene-list data/genes.txt \
  --obo ref/go-basic.obo \
  --assoc ref/gene_go.tsv \
  --out-dir results/go_python \
  --cutoff 0.05
```

### 差异表模式

```bash
python src/Enrichments/python/go_enrich.py run-table \
  --table results/contrast_DEG.csv \
  --gene-col GeneID \
  --padj-col padj \
  --lfc-col log2FoldChange \
  --padj-th 0.05 \
  --lfc-th 1 \
  --obo ref/go-basic.obo \
  --assoc ref/gene_go.tsv \
  --out-dir results/go_python
```

Python 版关联文件按“无表头、两列、每行一个关系”读取：`GeneID<TAB>GOID`。这与 R 版允许一行包含逗号分隔多个 GO ID 的关联格式不同；不要直接混用两种文件格式。差异表模式会额外保存 `filtered_gene_list.txt`，其余结果文件由 GSEApy 写入输出目录。

## 结果检查与常见问题

1. 结果为空时先区分“没有基因通过差异阈值”“基因不在背景库”还是“没有通路达到多重校正阈值”；R 版空 CSV 会记录原因和计数。
2. 检查输入基因 ID 的物种、版本号和大小写是否与关联表或 KEGG 映射一致；必要时使用 `--gene_regex` 或 `--id_map`。
3. 确认 `padj`、`log2FoldChange` 不是文本中的非法值，且列名与命令参数一致。
4. KEGG 的 `p.adjust` 使用 BH 校正；`--cutoff` 只筛选结果，不替代差异基因的 `--padj_th`/`--lfc_th`。
5. 富集分析依赖输入注释版本。发布结果时应同时保存命令、参考文件版本和校验和。
