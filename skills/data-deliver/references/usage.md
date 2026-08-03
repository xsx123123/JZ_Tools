# 本地结果交付运行手册

先检查沙盒预置的交付命令：

```bash
bash /workspace/.skills/data-deliver/scripts/check_env.sh
```

```bash
python /workspace/.skills/data-deliver/scripts/deliver_local.py \
  --input /workspace/input/results \
  --output /workspace/output/delivery \
  --project-id project-001 --mode copy --threads 4
```

`--input` 是待交付目录；`--output` 是本次交付清单和摘要的唯一写入目录。可用 `--regex` 限制纳入的文件。认证、远端地址和权限由安装态 `rnaflow-cli` 管理；环境检查失败时停止并联系管理员。
