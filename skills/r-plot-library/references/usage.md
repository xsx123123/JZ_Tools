# 使用手册

## Venn JSON

顶层必须是四个唯一命名的数组；数组元素会按字符 ID 去重。示例：

```json
{"Treatment A":["Gene1","Gene2"],"Treatment B":["Gene2"],"Treatment C":["Gene3"],"Treatment D":["Gene1","Gene3"]}
```

`--label` 可为 `both`、`count` 或 `none`。`--label-size` 为数字。集合名称用于右侧图例，图中的短标识固定为 A、B、C、D。

## Volcano 表

输入可为逗号分隔 CSV 或制表符分隔 TSV。`padj` 或 `pvalue` 为零时脚本以最小正浮点值替代，仅影响对数坐标。标签分别从上调和下调的显著基因中各取 padj 最小的 `--label-n-top` 个。

## ATAC UpSet 表

每行对应一个 `geneId` 与一个 `annotation`；同一基因可有多个注释。`--order-by` 只能是 `freq` 或 `degree`。空表、缺列、或 top-n 小于 1 会失败。

## 常见错误

- `there is no package called ...`：按照 `references/environment.md` 安装到运行镜像后重试。
- `Input must contain ...`：在上游导出中补齐所列必需列，不要猜测列含义。
- Venn 报集合数量错误：检查 JSON 顶层是否正好有四个键。
