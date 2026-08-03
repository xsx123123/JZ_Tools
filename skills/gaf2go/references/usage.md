# GO Term Annotation 使用手册

## 参数
| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `--input` | 无 | 含基因和 GO ID 列的 TSV。 |
| `--output` | 无 | 结果目录。 |
| `--obo` | `ref/go-basic.obo` | GO OBO 文件。 |
| `--gene-col` | `Gene_ID` | 基因列名。 |
| `--go-col` | `GO_ID` | GO 列名。 |
| `--include-obsolete` | 关闭 | 保留已废弃 term。 |

```bash
python /workspace/.skills/gaf2go/scripts/annotate_go_terms.py --input gene_go.tsv --output go_terms --obo ref/go-basic.obo
```

若提示列不存在，检查 TSV 表头或传入正确列名。若 `summary.json` 中 `unknown_go_ids` 非零，核对 GO ID 格式以及 OBO 数据版本。
