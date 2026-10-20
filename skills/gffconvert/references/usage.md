# GFF Feature Table Conversion 使用手册

## 参数
| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `--input` | 无 | GFF3 文件。 |
| `--output` | 无 | 结果目录。 |
| `--feature-type` | `gene` | 仅保留第三列等于此值的记录。 |
| `--filename` | `features.tsv` | 输出表文件名；不可包含目录分隔符。 |

## 示例
```bash
python /workspace/.skills/gffconvert/scripts/gff_to_tsv.py --input genes.gff3 --output gff_table --feature-type mRNA --filename transcripts.tsv
```

输出目录包含 `transcripts.tsv` 和 `summary.json`。当结果为空时先核对第三列的真实 feature 名称；当异常行数较高时核对文件是否为制表符分隔的 GFF3。
