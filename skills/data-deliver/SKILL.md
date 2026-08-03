---
name: 数据交付
description: 当输入一个待交付目录且用户要求按项目编号复制、硬链接或软链接并生成 MD5 交付清单时触发。不用于云端上传、权限配置或分析结果解读。
skill_id: data-deliver
version: 0.9.0
category: analysis
---

# 数据交付

## 何时使用（Trigger）
- 把一个目录中的文件按安装态 `rnaflow-cli local` 交付到指定目录，并需要可追溯 MD5 清单时使用。
- 云端对象存储上传、密钥设置和远程传输不在本技能范围内。

## 输入契约（Input）
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 待交付的存在目录。 |
| `--output` | 是 | 目标交付目录；应为空或由用户明确允许复用。 |
| `--project-id` | 是 | 交付项目标识。 |
| `--mode` | 否 | `copy`、`hardlink` 或 `symlink`，默认 `copy`。 |
| `--regex` | 否 | 仅交付文件名匹配的正则。 |
| `--threads` | 否 | 交付并行数。 |

## 执行步骤（Workflow）
1. 先验证安装态命令。`hardlink` 需要输入和输出位于同一文件系统；不确定时用 `copy`。
```bash
/workspace/.skills/data-deliver/scripts/check_env.sh
```
2. 执行本地交付：
```bash
python3 /workspace/.skills/data-deliver/scripts/deliver_local.py --input {用户提供的待交付目录} --output {用户指定的交付目录} --project-id {用户提供的项目编号} --mode copy --threads 4
```
3. 成功后只读取 `{output}/summary.json`；若安装态命令、文件操作或 MD5 校验失败，停止并返回 stderr。

## 输出契约（Output）
- 安装态工具生成交付文件和 `all_files.md5`。
- wrapper 写入 `summary.json`，其中包含交付模式、项目编号、文件数、总字节数和 MD5 清单路径。

## 质控与限制（QC & Constraints）
- `--input` 必须是目录；不改输入文件。
- `symlink` 仅适合同一受控环境内的临时交付，跨主机交付使用 `copy`。
- 不接收 AK/SK、bucket 或 endpoint；这些敏感云端操作必须使用另行审批的工具。
