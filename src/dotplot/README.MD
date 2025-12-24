# plot_nucmer_dotplot.r

这是一个专门的 R 函数，旨在利用 `ggplot2` 将 **NUCmer** 比对结果（`.delta` 文件）可视化为高质量的点图。此工具通过显示比对坐标、链方向和自动单位缩放来帮助比较基因组序列。

## 特点

- **直接解析**：无需外部转换工具，直接读取标准的 NUCmer `.delta` 文件。
- **智能过滤**：根据比对长度过滤，减少噪音（`minl_filter` 参数）。
- **自动缩放**：根据基因组大小自动调整坐标轴标签为 Kbp 或 Mbp。
- **链可视化**：使用不同的颜色表示正向链（`+`，红色/橙色）和反向链（`-`，蓝色）比对。
- **出版就绪**：生成清晰、基于矢量的图，适用于论文和报告。

## 依赖项

请确保您已安装以下 R 包：

```r
install.packages(c("tidyverse", "ggplot2", "ggpubr"))
```

## 函数文档

### `plot_nucmer_dotplot`

```r
plot_nucmer_dotplot(
  deltafile_path,
  minl_filter = 10000,
  flanks_size = 10000,
  alpha = 0.3,
  size = 0.3,
  shape = 0
)
```

#### 参数

| 参数 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `deltafile_path` | **必需** | `nucmer` 生成的 `.delta` 文件的路径。 |
| `minl_filter` | `10000` | 要显示的比对最小长度。小于此长度的片段将被过滤掉。 |
| `flanks_size` | `1e4` (10k) | 用于确定绘图轴范围的最小/最大坐标的侧翼区域大小。 |
| `alpha` | `0.3` | 点/线段的透明度（0 到 1 之间）。 |
| `size` | `0.3` | 绘制点的大小。 |
| `shape` | `0` | 点的形状（0 为空心方块，防止填充重叠）。 |

## 使用示例

以下是如何使用此脚本生成并保存点图的示例。

```r
# 1. 加载必要的库
library(ggpubr)
source('plot_nucmer_dotplot.r') # 加载函数

# 2. 定义输入文件路径
delta_data_dir <- '../../data/NC_056623.2_nucmer.delta'

# 3. 生成点图
p <- plot_nucmer_dotplot(delta_data_dir)

# 4. 保存输出
# 保存为 PNG
ggsave('/home/zj/analysis/dotplot/NC_056623.2_nucmer.delta.png',
       width = 6, height = 5, dpi = 1000, plot = p)

# 保存为 PDF
ggsave('/home/zj/analysis/dotplot/NC_056623.2_nucmer.delta.pdf',
       width = 6, height = 5, dpi = 1000, plot = p)
```

### 输出预览

![nucmer dotplot Example](../../docs/NC_056623.2_nucmer.delta.png)
