# gff2tsv.py - GFF3 文件基因信息提取工具

`gff2tsv.py` 是一个用于从 GFF3（General Feature Format Version 3）文件中提取指定特征类型（默认为基因）信息的 Python 脚本，并将提取出的数据转换为 TSV（Tab-Separated Values）格式文件。

## 特点

*   **灵活的特征提取**：可以指定要提取的特征类型（如 `gene`、`mRNA` 等）。
*   **属性解析**：自动解析 GFF3 文件的第九列属性信息，提取出 `ID`、`Name`、`Description` 等关键字段。
*   **URL 解码**：自动对属性中的 URL 编码内容进行解码，确保数据可读性。
*   **进度显示**：处理大型文件时，提供实时的处理进度日志。
*   **健壮性**：包含文件操作的错误处理，如文件未找到、权限问题等。
*   **友好的日志输出**：使用 `loguru` 库，提供带有时间戳、颜色和日志级别的清晰输出。

## 依赖

*   Python 3.x
*   `loguru` 库（用于美观的日志输出）

如果您尚未安装 `loguru`，请使用 pip 进行安装：
```bash
pip install loguru
```

## 使用方法

```bash
python gff2tsv.py -i <input_gff_file> -o <output_tsv_file> [-t <feature_type>]
```

### 参数说明

*   `-i`, `--input` (必填): 输入的 GFF3 文件路径。
*   `-o`, `--output` (必填): 输出的 TSV 文件路径。
*   `-t`, `--type` (可选): 要提取的特征类型。默认为 `gene`。

### 示例

1.  **提取所有 `gene` 特征并保存为 `genes.tsv`：**
    ```bash
    python gff2tsv.py -i your_annotation.gff3 -o genes.tsv
    ```

2.  **提取所有 `mRNA` 特征并保存为 `mrnas.tsv`：**
    ```bash
    python gff2tsv.py -i your_annotation.gff3 -o mrnas.tsv -t mRNA
    ```

## 输出格式

输出的 TSV 文件包含以下列：

*   `GeneID`: 基因的唯一标识符（从 GFF 属性的 `ID` 或 `gene_id` 字段获取）。
*   `GeneName`: 基因的名称（从 GFF 属性的 `Name`、`gene_name` 或 `symbol` 字段获取）。
*   `Chrom`: 染色体名称。
*   `Start`: 起始位置。
*   `End`: 结束位置。
*   `Strand`: 链信息（+ 或 -）。
*   `Type`: 特征类型（即 `-t` 参数指定的值，如 `gene`）。
*   `Description`: 基因的描述信息（从 GFF 属性的 `description`、`Note` 或 `product` 字段获取，并经过 URL 解码）。
