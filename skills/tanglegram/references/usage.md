# tanglegram 用法手册

## 端到端示例

输入目录 `/workspace/input/trees/` 内容：

```
trees/
├── TnpA_protein.aligned.fa.treefile   # 左树：IQ-TREE 输出，内部节点数字 = bootstrap
├── TnpD_protein.aligned.fa.treefile   # 右树：同上，tip 集合与左树完全一致
└── tree_info.csv                      # 注释表，含 label、family 等列
```

执行：

```bash
Rscript /workspace/.skills/tanglegram/scripts/run_tanglegram.R \
  --input /workspace/input/trees \
  --output /workspace/output/tanglegram \
  --column family \
  --outgroup "Magnolia_obovata,Magnolia_officinalis" \
  --colors family_colors.json \
  --bs-cutoff 70
```

预期产物：`tanglegram.pdf`、`tanglegram.png`、`summary.json`。

## 输入契约细节

### 树文件
- Newick 格式，`.treefile` / `.nwk` / `.tree` 均可（自动识别只认 `*.treefile`，其他扩展名请用 `--tree1/--tree2` 显式指定）。
- bootstrap 支持度放在**内部节点的数字标签**上（IQ-TREE、RAxML 默认行为）。脚本不计算支持度，只读取已有标签。
- tip.label 首尾的单引号/双引号会被自动剥掉，再做匹配。

### 注释 CSV
- 必须有 `label` 列，取值与树的 tip.label **逐字符一致**（脚本不做模糊匹配）。
- `--column` 指定的列决定连线/tip 点的颜色分组，常见取值为 `family`、`genus`、自定义分组列。
- `label` 不允许重复；树中每个 tip 必须能在 `label` 列找到，否则报错并列出缺失示例。

### 配色 JSON（`--colors`）
命名 JSON 对象，键为着色列的水平名，值为 `#RRGGBB`（或 R 颜色名）：

```json
{
  "Fabaceae": "#0072B2",
  "Poaceae": "#56B4E9",
  "Rosaceae": "#009E73",
  "Reference": "#000000"
}
```

必须覆盖该列全部水平，缺水平会在运行前直接报错列出缺哪些。路径可以是绝对路径，或 `--input` 目录内的文件名。

## 常见报错与处置

| 报错信息 | 原因与处置 |
|---|---|
| `缺少 R 包: xxx` | 按报错里给的命令安装；ggtree 走 Bioconductor。 |
| `--input 目录中 .treefile 数量不为 2` | 目录里树文件不是恰好两个，或有其他 `.treefile` 残留；用 `--tree1/--tree2` 显式指定。 |
| `无法解析树文件 ...` | 不是合法 Newick；检查文件是否截断、是否是别的格式（如 Nexus 需先转换）。 |
| `两棵树的 tip 集合不一致` | 两棵树的序列/物种集不同，或命名不一致（ID 后缀、大小写、引号）。报错会分别列出"仅在左树"和"仅在右树"的 tip。 |
| `注释 CSV 缺少 label 列` | CSV 首行列名不对；注意 `check.names=FALSE`，列名原样保留。 |
| `树中有 N 个 tip 在注释 CSV 的 label 列中找不到` | 注释表不全或命名不一致；报错会列出前 10 个缺失 tip。 |
| `--outgroup 中有 tip 不在树中` | 外群名拼写错误；报错会附树内 tip 示例。 |
| `--colors 配色未覆盖着色列 ... 缺少: Xxx` | 配色 JSON 少写了水平；按报错补全。 |
| `指定的文件不存在` | `--tree1/--tree2/--metadata/--colors` 文件名写错，或文件不在 `--input` 目录。 |

## 参数全表

| 参数 | 默认 | 说明 |
|---|---|---|
| `--input` | 必填 | 输入目录。 |
| `--output` | 必填 | 输出目录（自动创建）。 |
| `--tree1` / `--tree2` | 自动 | 左右树文件名；缺省要求目录恰有 2 个 `*.treefile`，按字母序取第 1/2 个。 |
| `--metadata` | 自动 | 注释 CSV；缺省要求目录恰有 1 个 `*.csv`。 |
| `--column` | `family` | 着色列名。 |
| `--colors` | turbo | 配色 JSON 路径。 |
| `--outgroup` | 不定根 | 逗号分隔的外群 tip。 |
| `--bs-cutoff` | `70` | bootstrap 显示阈值；`0`=全部；`Inf`=关闭。 |
| `--t2-pad` | `1.5` | 两树水平间距，连线太陡时调大。 |
| `--tip-size` | `2.5` | tip 点大小。 |
| `--t1-color` / `--t2-color` | `#C0392B` / `#2980B9` | 左右树分支颜色；**传值必须加引号**防 shell 吃掉 `#`。 |
| `--line-alpha` / `--line-lwd` | `0.55` / `0.5` | 连线透明度/线宽。 |
| `--format` | `both` | `pdf` / `png` / `both`。 |
| `--width` / `--height` / `--dpi` | `14` / `10` / `1000` | 图尺寸（英寸）与 PNG 分辨率。 |
| `--no-rotate` | 关 | 跳过 TangleR 预旋转。 |

## 注意事项

- x 轴是拼合坐标（左树分支长 + 间隙 + 镜像右树），**没有分支长含义**；建议出图后隐藏坐标轴或在图注说明。
- 镜像/预旋转只改绘图坐标不改拓扑，可用 `ape::all.equal.phylo(tree, rotated, use.edge.length = TRUE)` 验证。
- 更多图层细节（tree1/tree2 图层保留行为、bootstrap 对齐方式）见 `scripts/tanglegram.R` 的 roxygen 文档。
