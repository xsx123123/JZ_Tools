# KEGG 注释获取运行手册

先检查运行环境：

```bash
bash /workspace/.skills/kegg-pull/scripts/check_env.sh
```

下载一个或多个物种代码：

```bash
python /workspace/.skills/kegg-pull/scripts/run_kegg_pull.py \
  --input /workspace/input/organisms.txt \
  --output /workspace/output/kegg --delay 0.5 --timeout 60
```

输入文件每行一个 KEGG organism code，例如 `hsa`、`mmu`。`--raw-only` 只保留原始下载；`--skip-download` 仅检查已有输出。该操作需要管理员允许的网络出口，环境检查或请求失败时停止并保留 stderr；每次运行都写入 `summary.json`。
