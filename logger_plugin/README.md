# Snakemake Rich Loguru Plugin

一个基于 `Rich` 和 `Loguru` 的 Snakemake 日志插件，提供美观的控制台输出和详细的结构化文件日志。

## ✨ 特性

- **终端美化 (Rich)**：
  - 启动标题居中显示，视觉体验更佳。
  - 关键信息（Rule, Jobid, Inputs）自动着色高亮。
  - 进度条和状态信息清晰易读。

- **详细环境记录**：
  - 每次运行自动记录：启动时间、系统信息、主机名、Python/Snakemake 版本、工作目录及完整执行命令。
  - 方便后续排查问题和复现环境。

- **结构化文件日志 (Loguru)**：
  - 采用清晰的 `时间 | 等级 | 消息` 格式。
  - 自动轮转日志文件（支持设置大小限制），防止日志无限增长。
  - 线程安全，高性能。

## 📸 日志示例

**控制台启动信息：**
```text
                       Snakemake Pipeline Initialized                       
[14:35:48] INFO     Start Time: 2026-01-08 14:35:48
           INFO     System: Linux 5.4.0-generic
           INFO     User: zhangsan | Host: server01
           INFO     Python Version: 3.12.0
           INFO     Snakemake Version: 8.0.0
           INFO     Log File: logs/snakemake_2026-01-08_14-35-48.log
           INFO     Working Directory: /home/zhangsan/projects/rna-seq
           INFO     Command: snakemake --cores 16
           INFO     ------------------------------------------------------------
```

## 📦 安装

在项目根目录下执行：

```bash
pip install -e .
```

## 🚀 使用方法

### 命令行方式

在运行 Snakemake 时指定该插件：

```bash
snakemake --logger rich-loguru --cores 1
```

### 配置文件方式

在 `config.yaml` 或 `snakemake` 配置文件中指定：

```yaml
logger: rich-loguru
logger_settings:
  log_dir: "logs"              # 日志存储目录
  log_file_prefix: "snakemake" # 日志文件前缀
  max_file_size: "100 MB"      # 单个日志最大大小
```

## ⚙️ 插件设置说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `log_dir` | 日志文件存储的文件夹路径 | `logs` |
| `log_file_prefix` | 日志文件名的前缀 | `snakemake` |
| `max_file_size` | 日志轮转阈值，支持 KB, MB, GB | `100 MB` |

## 🛠️ 开发与测试

测试用例位于 `tests/` 目录下：

```bash
cd tests
snakemake --logger rich-loguru --cores 1
```