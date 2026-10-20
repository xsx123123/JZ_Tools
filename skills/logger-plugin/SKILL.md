---
name: Snakemake Rich Loguru 日志插件
description: 当输入 Snakemake 工作流文件且用户要求以已安装的 rich-loguru logger 执行并保留本地运行日志时触发。不用于创建远端 Loki、OmicHub 凭据或修改工作流规则。
skill_id: logger-plugin
version: 0.9.0
category: analysis
---

# Snakemake Rich Loguru 日志插件

## 何时使用（Trigger）
- 对现有 `Snakefile` 使用安装态 `snakemake --logger rich-loguru` 执行或 dry-run，并产出一次运行摘要时使用。
- 不配置远端 Loki/OmicHub sink，不接收或保存 token、密码及加密密钥。

## 输入契约（Input）
| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--input` | 是 | 存在的 `Snakefile` 路径。 |
| `--output` | 是 | Snakemake 工作目录与摘要输出目录。 |
| `--cores` | 否 | 默认 `1`。 |
| `--dry-run` | 否 | 只验证 DAG，不执行任务。 |
| `--configfile` | 否 | 传给 Snakemake 的 YAML 配置文件。 |

## 执行步骤（Workflow）
1. 检查 Snakemake 和已发现的 logger 插件；失败时不要尝试 pip 安装。
```bash
/workspace/.skills/logger-plugin/scripts/check_env.sh
```
2. 运行工作流；建议先 dry-run：
```bash
python3 /workspace/.skills/logger-plugin/scripts/run_with_logger.py --input {用户提供的Snakefile} --output {用户指定的工作目录} --cores 4 --dry-run
```
3. 非 dry-run 成功后读取 `{output}/summary.json` 汇报退出状态与日志位置；工作流失败时保留 stderr 原文，不将失败标记成成功。

## 输出契约（Output）
- Snakemake 的正常产物写入 `--output` 工作目录。
- wrapper 写入 `summary.json`，包含 `snakemake.log`、dry-run 状态和命令信息。

## 质控与限制（QC & Constraints）
- 默认 `--cores 1`；必须由用户或平台限制可用并发。
- wrapper 不修改 `Snakefile`、配置文件或环境变量，不配置网络日志 sink。
- 远端日志不可达不应替代本地日志；有凭据需求时先要求专门的安全配置流程。
