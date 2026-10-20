# Environment

- R ≥ 4.1.0（脚本与 `tanglegram.R` 使用原生管道 `|>`）。
- R 包（wrapper 启动时逐一 `requireNamespace` 检查，缺哪个直接报哪个）：
  - `ape` — 读树、定根、拓扑统计。
  - `ggtree` — Bioconductor 安装：`BiocManager::install("ggtree")`。
  - `ggplot2` — 绘图图层与 `ggsave`。
  - `dplyr` — `my.tanglegram()` 内部数据变换（命名空间调用，无需 attach）。
  - `viridisLite` — 默认 turbo 配色。
  - `optparse`、`jsonlite` — CLI 解析与 summary.json 写出。
- 可选：`TangleR` — 提供 `pre.rotate()`，只减少连线交叉，不影响正确性；缺失时自动跳过并写 warning。
- 输入是用户自备的两棵树文件与注释 CSV，**无外部参考数据依赖**，不需要 provisioning。
- 渲染 PDF 用常规 R 图形设备；PNG 用 `ggsave(dpi = --dpi)`。
