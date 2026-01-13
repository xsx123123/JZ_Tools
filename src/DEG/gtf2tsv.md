# 🧬 GTF Gene Info Extractor

这是一个高效、灵活的 Python 脚本，用于从 GTF (Gene Transfer Format) 基因组注释文件中提取特定的基因信息（如 `gene_id`, `gene_name` 等）。

它能够将复杂的 GTF 文件转换为易于阅读和分析的 TSV 表格（Tab 分隔），常用于 RNA-seq 下游分析（如 ID 转换、注释文件准备）。

## ✨ 主要功能

* **⚡ 高效处理**：逐行读取，内存占用低，支持处理 GB 级别的大型 GTF 文件。
* **🎨 交互友好**：集成 `Rich` 库，提供实时进度条、剩余时间预测和美观的结果摘要。
* **🛠 高度自定义**：
    * 支持提取任意 GTF 属性（如 `gene_type`, `mgi_id`, `exon_number` 等）。
    * 支持自定义输出文件的列名。
* **🧹 智能清洗**：
    * 自动过滤非 `gene` 类型的行（避免转录本/外显子冗余）。
    * 默认自动去除 Ensembl ID 的版本号（如 `ENSMUSG...2` -> `ENSMUSG...`），方便数据库匹配。
* **📝 日志记录**：使用 `Loguru` 提供清晰的运行日志。

## 📦 安装依赖

该脚本依赖 Python 3，并需要安装以下第三方库：

```bash
pip install loguru rich
```

## 🚀 快速开始

### 1. 基础用法 (默认提取 gene_id 和 gene_name)

最简单的用法，只需指定输入文件。默认会提取 gene_id 和 gene_name，并去除 ID 版本号。

```bash
python gtf2gene.py -i gencode.vM38.annotation.gtf
```

**输出**: 在同级目录下生成 gencode.vM38.annotation.gene_info.tsv。

### 2. 自定义提取属性

如果你需要提取更多信息，例如基因类型 (gene_type) 和 MGI 编号 (mgi_id)：

```bash
python gtf2gene.py \
  -i gencode.vM38.annotation.gtf \
  -a gene_id,gene_name,gene_type,mgi_id
```

### 3. 自定义输出列名

你可以指定输出文件的表头名称（需要与提取属性的数量一致）：

```bash
python gtf2gene.py \
  -i gencode.vM38.annotation.gtf \
  -a gene_id,gene_name,gene_type \
  -c Ensembl_ID,Symbol,Biotype
```

### 4. 指定输出文件路径 & 保留版本号

如果你希望保留 ENSMUSG...2 这种带版本号的 ID，请添加 --keep-version 参数：

```bash
python gtf2gene.py \
  -i input.gtf \
  -o /path/to/output/my_gene_map.tsv \
  --keep-version
```

## ⚙️ 参数说明

| 参数 | 长参数 | 是否必选 | 默认值 | 说明 |
|------|--------|----------|--------|------|
| -i | --input | ✅ | - | 输入的 GTF 文件路径。 |
| -o | --output | ❌ | [输入文件名].gene_info.tsv | 输出的 TSV 文件路径。 |
| -a | --attributes | ❌ | gene_id,gene_name | 指定要提取的属性列表（逗号分隔）。 |
| -c | --columns | ❌ | 与属性名一致 | 指定输出文件的列名（逗号分隔）。 |
| --keep-version | --keep-version | ❌ | False (自动去除) | 是否保留 gene_id 的版本后缀（如 .2）。 |
| -h | --help | ❌ | - | 显示帮助信息。 |

## 📊 输出示例

生成的 TSV 文件格式如下：

| Gene_ID | Gene_Symbol | Type |
|---------|-------------|------|
| ENSMUSG00000102693 | 4933401J01Rik | TEC |
| ENSMUSG00000064842 | Gm26206 | snRNA |
| ENSMUSG00000051951 | Xkr4 | protein_coding |

## 📝 注意事项

* **过滤机制**：脚本只会处理第 3 列为 gene 的行。这意味着每个基因 ID 在输出文件中只会出现一次，不会因为有多个转录本而重复。
* **属性匹配**：如果某一行没有你指定的属性（例如有的基因没有 gene_name），脚本会在该列自动填充 NA。
* **正则匹配**：脚本使用正则表达式提取属性，支持 key "value" 格式，对空格不敏感。