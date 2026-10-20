---
name: Conda environment software inventory
description: 当输入为一个或多个 Conda 环境 YAML 文件或目录且用户要求整理软件版本清单时触发。不安装、升级或删除软件包。
skill_id: software-manager
version: 0.9.0
category: analysis
---

# 何时使用
从 Conda/Pip 环境声明提取已安装软件版本，并按内置 RNA-seq 工具清单生成 JSON 报告。

# 输入契约
| 参数 | 说明 |
|---|---|
| `--input` | 一个或多个 YAML 文件或目录；目录仅扫描当前层的 `.yaml`/`.yml` 文件。 |
| `--output` | 结果目录。 |
| `--config` | 可选软件清单 YAML；默认使用包内 `software_list.yaml`。 |

# 执行步骤
```bash
python /workspace/.skills/software-manager/scripts/collect_versions.py \
  --input /workspace/input/environment.yml /workspace/input/envs \
  --output /workspace/output/software-versions
```

# 输出契约
- `software_versions.json`：按功能分类的软件名称与最高版本。
- `summary.json`：扫描文件数、已识别和未识别软件数及产物清单。

# 质控与限制
同一包在多个输入中出现时保留可比较的最高版本。清单未覆盖的包不写入报告；复杂 YAML 语法以常见 Conda `dependencies` 和嵌套 `pip` 列表为限。
