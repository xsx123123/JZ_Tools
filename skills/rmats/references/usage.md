# 使用手册

输入根目录下每个比较结果目录至少要有 `SE.MATS.JC.txt`。其余四类事件表存在时自动合并。`summary` 输出每个比较和事件类型的总数、上调和下调数；`details` 输出筛选后的原始事件列，并增加比较和事件类型。

```bash
python /workspace/.skills/rmats/scripts/merge_rmats.py --input /workspace/input/rmats --output /workspace/output/rmats-merged --mode details --fdr 0.05 --psi 0.1 --min-reads 10
```

若报告零事件，先确认 FDR 与 `IncLevelDifference` 列存在并检查阈值；若命令失败，请确认目录中有 `SE.MATS.JC.txt`。
