# GO Annotation Table Preparation 使用手册

## `gaf_extract.py`
| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--input` | 无 | GAF 2.x，或首行是列名的 TSV。 |
| `--output` | 无 | 结果目录。 |
| `--gene-col` | `DB_Object_Symbol` | 列名或零基列索引。 |
| `--go-col` | `GO_ID` | 列名或零基列索引。 |
| `--filename` | `gene_go.tsv` | 输出文件名。 |

示例：
```bash
python /workspace/.skills/go-annotation/scripts/gaf_extract.py --input annotation.tsv --output gene_go --gene-col gene --go-col go_id
```

## `uniprot_gaf_map.py`
`--to-db` 可选 `Ensembl`、`GeneID`、`Ensembl_Genomes`。例如：
```bash
python /workspace/.skills/go-annotation/scripts/uniprot_gaf_map.py --input uniprot.gaf --output mapped --to-db Ensembl_Genomes
```

服务返回失败、网络不可达或无有效 accession 时停止并保留 stderr；不要把没有返回的 accession 当作已映射。
