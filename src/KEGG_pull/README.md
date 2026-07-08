# KEGG Pull

`kegg-pull` 是一个用于从 KEGG REST API 下载指定物种 KEGG 注释数据，并生成离线富集分析资源的 Python 包。它适合在 OmicHub、RNA-seq/ATAC-seq 分析流程或本地批处理环境中构建可复用的 KEGG 离线数据库。

项目会保留 KEGG 原始下载文件，同时生成 GSEApy、clusterProfiler、GSEA 等工具可直接使用的 GMT 文件，以及便于数据库导入和审计的 TSV/JSON/README 元数据。

## 功能概览

- 按 KEGG 物种代码下载注释数据，例如 `ath`、`hsa`、`mmu`、`osa`。
- 下载 5 类核心数据：基因列表、基因-通路映射、基因-KO 映射、通路名称、BRITE 层级。
- 自动生成 pathway GMT 和 KO GMT。
- 自动生成基因信息表、基因-通路映射表、基因-KO 映射表、通路注释表。
- 支持物种代码在线校验、失败重试、请求限速和批量物种下载。
- 提供 `rich`、`rich-argparse`、`loguru` 美化后的命令行和日志。
- 兼容旧入口 `download_kegg_annotations.py`，也支持 `python -m kegg_pull` 和安装后的 `kegg-pull` 命令。

## 目录结构

```text
src/KEGG_pull/
├── README.md
├── pyproject.toml
├── download_kegg_annotations.py          # 兼容旧入口，转发到 kegg_pull.cli
├── KEGG_离线注释数据库下载指南.md
├── KEGG_database_download_spec.md
└── kegg_pull/
    ├── __init__.py
    ├── __main__.py                       # python -m kegg_pull
    ├── cli.py                            # rich/rich-argparse CLI
    ├── core.py                           # 下载、解析、转换核心逻辑
    ├── config/
    │   ├── default.yaml                  # 默认网络、日志配置
    │   └── software.yaml                 # 软件名称、版本、logo 信息
    └── utils/
        ├── configuration.py              # YAML 配置加载
        ├── logo.py                       # rich logo
        └── log_utils.py                  # loguru + rich logging
```

## 安装

推荐在 `src/KEGG_pull` 目录下使用可编辑安装，便于本地开发：

```bash
cd src/KEGG_pull
pip install -e .
```

安装后会注册两个等价命令：

```bash
kegg-pull --help
download-kegg-annotations --help
```

依赖项由 `pyproject.toml` 管理：

```text
loguru
PyYAML
rich
rich-argparse
```

如果没有安装 `rich-argparse`，程序仍可运行，会自动降级到标准 argparse 帮助格式；安装包时会按依赖自动补齐。

## 快速开始

下载拟南芥 KEGG 注释并生成离线资源：

```bash
kegg-pull ath -o kegg_annotations
```

一次下载多个物种：

```bash
kegg-pull ath hsa mmu osa -o kegg_annotations
```

使用物种列表文件：

```bash
cat > species.txt <<'EOF'
ath
hsa
mmu
osa
EOF

kegg-pull --species-file species.txt -o kegg_annotations
```

只下载原始 KEGG 文件，不生成 TSV/GMT：

```bash
kegg-pull ath --raw-only -o kegg_annotations
```

跳过下载，只基于已有原始文件重新生成 TSV/GMT：

```bash
kegg-pull ath --skip-download -o kegg_annotations
```

旧脚本入口仍然可用：

```bash
python3 src/KEGG_pull/download_kegg_annotations.py ath -o kegg_annotations
```

包模块入口也可用：

```bash
cd src/KEGG_pull
python3 -m kegg_pull ath -o kegg_annotations
```

## 命令行参数

### 必填输入

`kegg-pull` 至少需要一个物种代码，或通过 `--species-file` 提供物种列表。

无参运行时会打印错误并显示帮助：

```text
ERROR: At least one species code is required.
```

常见物种代码：

| 物种 | 学名 | KEGG Code |
|---|---|---|
| 拟南芥 | Arabidopsis thaliana | `ath` |
| 人 | Homo sapiens | `hsa` |
| 小鼠 | Mus musculus | `mmu` |
| 大鼠 | Rattus norvegicus | `rno` |
| 水稻 | Oryza sativa japonica | `osa` |
| 番茄 | Solanum lycopersicum | `sly` |
| 生菜 | Lactuca sativa | `lsa` |
| 玉米 | Zea mays | `zma` |
| 大豆 | Glycine max | `gma` |

如果不确定物种代码，可以查询 KEGG organism 列表：

```bash
kegg-pull ath --raw-only -o kegg_annotations
```

程序默认会先下载或复用 `kegg_annotations/kegg_organism.list` 做物种代码校验。

### 输入输出参数

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `species` | 无 | 一个或多个 KEGG 物种代码 |
| `-o, --outdir` | `kegg_annotations` | 输出根目录，每个物种写入 `<outdir>/<species>/` |
| `--species-file` | 无 | 物种列表文件，每行一个物种代码，支持 `#` 注释行 |
| `--log-dir` | `<outdir>/logs` | 日志输出目录 |

### 工作流参数

| 参数 | 说明 |
|---|---|
| `--skip-download` | 不访问 KEGG，只基于已有 raw 文件重新生成衍生文件 |
| `--raw-only` | 只下载 raw 文件，不生成 TSV/GMT |
| `--force` | 覆盖已存在的物种 raw 文件 |
| `--force-organism-list` | 覆盖已缓存的 `kegg_organism.list` |
| `--no-validate` | 跳过 `/list/organism` 物种代码校验 |
| `--keep-going` | 某个物种失败后继续处理剩余物种 |
| `--keep-species-suffix` | 保留 KEGG pathway 名称中的物种后缀 |

### KEGG REST 参数

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `--delay` | `1.0` | 每次 KEGG 请求之间的等待秒数 |
| `--timeout` | `60.0` | HTTP 超时时间 |
| `--retries` | `3` | 单个文件下载重试次数 |
| `--backoff` | `2.0` | 重试指数退避基数 |
| `--user-agent` | `jz-tools-kegg-downloader/1.0` | HTTP User-Agent |

KEGG REST API 不建议高频请求。批量下载时建议保持默认 `--delay 1.0`，不要把间隔调得过低。

### 显示和日志参数

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `--no-logo` | `False` | 不打印启动 logo |
| `--log-level` | `INFO` | 控制台日志级别 |
| `--log-style` | `default` | 日志样式，可选 `default`、`minimal`、`detailed`、`plain` |
| `--more-info` | `False` | 显示更详细的 logger path/function/line 信息 |

## KEGG REST 接口

每个物种会下载以下原始文件：

| 输出文件 | KEGG API | 用途 |
|---|---|---|
| `<org>_gene.list` | `/list/<org>` | 物种基因列表和描述 |
| `<org>_pathway.list` | `/link/pathway/<org>` | 基因到 pathway 的映射 |
| `<org>_ko.list` | `/link/ko/<org>` | 基因到 KO 的映射 |
| `<org>_pathway_name.list` | `/list/pathway/<org>` | pathway ID 和名称 |
| `<org>_brite.txt` | `/get/br:<org>00001` | BRITE 层级分类 |

例如 `ath` 对应：

```text
https://rest.kegg.jp/list/ath
https://rest.kegg.jp/link/pathway/ath
https://rest.kegg.jp/link/ko/ath
https://rest.kegg.jp/list/pathway/ath
https://rest.kegg.jp/get/br:ath00001
```

## 输出文件

以 `ath` 为例，命令：

```bash
kegg-pull ath -o kegg_annotations
```

会生成：

```text
kegg_annotations/
├── kegg_organism.list
├── logs/
│   └── kegg_pull_<timestamp>.log
└── ath/
    ├── ath_gene.list
    ├── ath_pathway.list
    ├── ath_ko.list
    ├── ath_pathway_name.list
    ├── ath_brite.txt
    ├── ath_kegg.gmt
    ├── ath_ko.gmt
    ├── ath_gene_info.tsv
    ├── ath_gene_pathway.tsv
    ├── ath_gene_ko.tsv
    ├── ath_pathway_annotation.tsv
    ├── ath_summary.json
    └── README_ath.md
```

### GMT 文件

`<org>_kegg.gmt` 是 pathway 基因集文件，每行一个 pathway：

```text
<pathway_id>    <pathway_name>    <gene1>    <gene2>    ...    <geneN>
```

`<org>_ko.gmt` 是 KO 基因集文件，每行一个 KO：

```text
<ko_id>    <ko_id>    <gene1>    <gene2>    ...    <geneN>
```

GMT 文件可直接用于 GSEApy、clusterProfiler 的 `read.gmt()` 或 GSEA 桌面软件。

### TSV 文件

`<org>_gene_info.tsv` 字段：

| 字段 | 说明 |
|---|---|
| `species_code` | KEGG 物种代码 |
| `gene_id` | 去除物种前缀后的基因 ID |
| `kegg_gene_id` | KEGG 原始基因 ID |
| `gene_name` | 基因名 |
| `description` | KEGG 描述 |
| `ko_ids` | 该基因关联的 KO，多个值用 `;` 分隔 |

`<org>_gene_pathway.tsv` 字段：

| 字段 | 说明 |
|---|---|
| `species_code` | KEGG 物种代码 |
| `gene_id` | 标准化基因 ID |
| `kegg_gene_id` | KEGG 原始基因 ID |
| `pathway_id` | pathway ID |
| `pathway_name` | pathway 名称 |
| `ko_ids` | 基因关联 KO |

`<org>_gene_ko.tsv` 字段：

| 字段 | 说明 |
|---|---|
| `species_code` | KEGG 物种代码 |
| `gene_id` | 标准化基因 ID |
| `kegg_gene_id` | KEGG 原始基因 ID |
| `ko_id` | KO ID |

`<org>_pathway_annotation.tsv` 字段：

| 字段 | 说明 |
|---|---|
| `species_code` | KEGG 物种代码 |
| `pathway_id` | pathway ID |
| `pathway_name` | pathway 名称 |
| `brite_level1` | BRITE 一级分类 |
| `brite_level2` | BRITE 二级分类 |
| `brite_level3` | BRITE 三级分类 |
| `gene_count` | pathway 中的基因数量 |

### JSON 和 README

`<org>_summary.json` 记录本次构建的统计信息，包括基因数、映射数、pathway 数、KO 数和文件名。

`README_<org>.md` 是每个物种目录内的自动生成说明文件，方便归档和数据交付。

## 在 Python 中调用

可以直接导入核心函数：

```python
from argparse import Namespace

from kegg_pull.core import run_pipeline

args = Namespace(
    species=["ath"],
    species_file=None,
    outdir="kegg_annotations",
    log_dir=None,
    skip_download=False,
    raw_only=False,
    force=False,
    force_organism_list=False,
    no_validate=False,
    keep_going=False,
    keep_species_suffix=False,
    delay=1.0,
    timeout=60.0,
    retries=3,
    backoff=2.0,
    user_agent="jz-tools-kegg-downloader/1.0",
)

exit_code = run_pipeline(args)
```

对于一般使用，推荐走 CLI；直接调用 Python API 时，需要保证 `Namespace` 中字段齐全。

## 配置文件

包内默认配置位于：

```text
kegg_pull/config/default.yaml
kegg_pull/config/software.yaml
```

运行时会自动查找当前目录下的项目级配置：

```text
kegg_pull.yaml
kegg_pull.local.yaml
```

后者会覆盖前者，适合写本机或项目特定参数。示例：

```yaml
logs:
  log_level: DEBUG
  Label: kegg_pull
  style: detailed

kegg:
  delay: 1.5
  timeout: 90
  retries: 5
  backoff: 2.0
  user_agent: "my-lab-kegg-downloader/1.0"
```

配置会通过 `kegg_pull.utils.configuration` 读取，并和包内默认配置递归合并。

## 日志

默认日志目录：

```text
<outdir>/logs/
```

每次运行会生成类似：

```text
kegg_pull_2026-07-08_23-54-31.log
```

控制台日志使用 RichHandler，美化显示时间、级别和消息。文件日志保留完整 DEBUG 信息，适合排查下载失败、网络超时和数据解析问题。

## 常见工作流

### 重新生成 GMT

如果 raw 文件已经存在，只想重新生成 TSV/GMT：

```bash
kegg-pull ath --skip-download -o kegg_annotations
```

### 强制更新某个物种

```bash
kegg-pull ath --force -o kegg_annotations
```

### 跳过物种校验

如果 KEGG 刚新增物种，缓存的 organism list 还不包含它，可以跳过校验：

```bash
kegg-pull neworg --no-validate -o kegg_annotations
```

### 批量下载时不中断

```bash
kegg-pull ath hsa mmu osa sly --keep-going -o kegg_annotations
```

## 常见问题

### 1. 无参运行报错

这是预期行为：

```text
ERROR: At least one species code is required.
```

请提供物种代码或 `--species-file`。

### 2. 物种代码未知

如果出现 unknown organism code，先确认 KEGG 是否收录该物种。可以删除或强制更新 `kegg_organism.list`：

```bash
kegg-pull ath --force-organism-list -o kegg_annotations
```

如果确认代码正确但校验仍失败，可临时使用：

```bash
kegg-pull <org> --no-validate -o kegg_annotations
```

### 3. 输出文件为空或很小

某些非模式物种在 KEGG 中注释覆盖度较低，`pathway.list` 或 `ko.list` 可能为空或数据很少。建议检查：

```bash
wc -l kegg_annotations/<org>/<org>_pathway.list
wc -l kegg_annotations/<org>/<org>_ko.list
```

### 4. 下载失败或 429

可能是网络波动或请求过快。建议：

```bash
kegg-pull ath --delay 2 --retries 5 --timeout 120 -o kegg_annotations
```

### 5. rich-argparse 未安装

程序会自动降级到普通 argparse help。安装包依赖即可启用美化：

```bash
cd src/KEGG_pull
pip install -e .
```

## 与富集分析工具集成

### GSEApy

```python
import gseapy as gp

enr = gp.enrich(
    gene_list=["AT1G01010", "AT1G01020", "AT1G01030"],
    gene_sets="kegg_annotations/ath/ath_kegg.gmt",
    outdir="enrichment_results",
)
```

### clusterProfiler

```r
library(clusterProfiler)

gmt <- read.gmt("kegg_annotations/ath/ath_kegg.gmt")

res <- enricher(
  gene = c("AT1G01010", "AT1G01020", "AT1G01030"),
  TERM2GENE = gmt
)
```

## 开发说明

本包的主要边界：

- `kegg_pull.cli` 负责命令行参数、logo、日志和错误提示。
- `kegg_pull.core` 负责 KEGG 下载、文件解析、ID 标准化、TSV/GMT/JSON/README 生成。
- `kegg_pull.utils.configuration` 负责包内 YAML 与项目级 YAML 合并。
- `kegg_pull.utils.log_utils` 负责 loguru + rich 日志。
- `kegg_pull.utils.logo` 负责启动 logo。

语法检查：

```bash
python3 -m py_compile \
  download_kegg_annotations.py \
  kegg_pull/__init__.py \
  kegg_pull/__main__.py \
  kegg_pull/cli.py \
  kegg_pull/core.py \
  kegg_pull/utils/configuration.py \
  kegg_pull/utils/logo.py \
  kegg_pull/utils/log_utils.py
```

查看 CLI：

```bash
python3 -m kegg_pull --help
kegg-pull --help
```

## KEGG 引用和使用注意

KEGG REST API 数据由 KEGG 提供。使用前请确认数据用途符合 KEGG 许可要求。商业用途通常需要购买 KEGG FTP 或相应授权。

发表使用 KEGG 数据的结果时，请引用 KEGG 官方文献。详见 KEGG 官方说明：

```text
https://www.kegg.jp/kegg/rest/keggapi.html
https://www.kegg.jp/kegg/legal.html
```
