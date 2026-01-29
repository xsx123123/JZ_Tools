# Snakemake Logger 增强插件：Rich-Loguru

这是一个基于 Loguru 和 Rich 开发的 Snakemake 日志插件，旨在为生物信息学流程提供极度舒适的终端输出、结构化的本地记录，以及基于 **Seq** (https://datalust.co/seq) 的远程可视化监控。

## 🌟 核心特性

- **华丽的终端输出**：利用 Rich 库优化 Snakemake 运行状态，支持进度条展示和规则高亮。
- **沉浸式启动体验**：内置系统自检风格的启动过场动画与状态面板，提供专业的 CLI 交互感。
- **结构化本地日志**：Loguru 驱动，支持自动滚动、多级别记录（JSON 或文本）。
- **Seq 远程监控深度整合**：
    - 将流程日志实时以结构化 JSON 格式推送到 Seq 服务器。
    - **自动附加时间戳**：项目名称自动追加 `_YYYY-MM-DD_HH-mm` 后缀，轻松区分不同运行批次。
    - **智能日志清洗**：自动去除终端的高亮颜色代码（Rich Markup），确保 Seq 中展示纯净文本。
    - **项目标识增强**：日志消息体自动添加 `[ProjectName]` 前缀，便于快速识别。
    - **噪声过滤**：自动屏蔽无意义的 "None" 日志。
    - 支持 HTTP/HTTPS 协议及 API Key 鉴权。
- **非阻塞架构**：日志发送由 Loguru 的异步 Sink 处理，确保在高并发任务下不阻塞 Snakemake 主进程。
- **零配置开销**：支持自动读取配置文件，或直接通过 Snakemake 命令行参数控制。

## 🚀 安装指南

```bash
pip install snakemake-logger-plugin-rich-loguru
```

（请根据实际包名调整安装命令，如果是本地开发，请使用 `pip install -e .`）

## 📊 远程监控配置 (Seq)

该插件支持通过多种方式加载 Seq 配置，优先级如下：

1.  **Snakemake 配置文件** (`config.yaml` 或 `--config` 参数)
2.  **环境变量** (`SNAKEMAKE_MONITOR_CONF`)
3.  **独立配置文件** (`monitor_config.yaml`，默认查找当前目录)

### 配置参数

| 参数名 | 描述 | 示例 |
| :--- | :--- | :--- |
| `seq_server_url` / `seq_url` | Seq 服务器地址 | `http://192.168.1.10:5341` |
| `api_key` | (可选) Seq API Key | `SecretKey123` |
| `project_name` | 项目名称 (会自动追加时间戳) | `GenomicsPipeline` |

### 方式一：集成到 Snakemake 主配置（推荐）

直接在您的 `config.yaml` 中添加监控配置：

```yaml
# config.yaml
samples: "samples.tsv"
genome: "hg38"

# === 监控配置 ===
seq_server_url: "http://192.168.1.10:5341"
project_name: "My_Analysis_Project"
```

在运行 Snakemake 时，确保显式加载插件：

```bash
snakemake --logger rich-loguru --configfile config.yaml ...
```

### 方式二：使用独立配置文件 (monitor_config.yaml)

在工作流根目录下创建 `monitor_config.yaml`：

```yaml
seq_server_url: "http://localhost:5341"
project_name: "Debug_Run"
```

插件会在启动时自动检测并加载该文件。

## 🛠 使用方法

### 基础运行

只需指定 logger 插件即可：

```bash
snakemake --logger rich-loguru --cores 4
```

### 进阶：在 Python 脚本中使用

您的 `scripts/` 目录下的 Python 脚本也可以复用该日志配置，将分析日志也推送到 Seq。

```python
# scripts/analysis.py
from snakemake_logger_plugin_rich_loguru import get_logger, install

# 如果是独立脚本运行（非 Snakemake 规则内），可以手动初始化
# install({"seq_server_url": "...", "project_name": "..."})

logger = get_logger()

def analyze_data():
    logger.info("开始处理样本...", extra={"sample_id": "S1"})
    try:
        # ... 业务逻辑 ...
        logger.success("样本 S1 处理完成")
    except Exception as e:
        logger.exception("处理失败")

if __name__ == "__main__":
    analyze_data()
```

## 📈 Seq 中的展示效果

在 Seq 仪表盘中，您可以通过以下过滤器查看特定批次的日志：

```sql
Project = 'My_Analysis_Project_2026-01-29_16-45'
```

日志会自动包含以下字段：
- `@t`: 时间戳
- `@m`: 消息内容（自动去除颜色代码，并添加 `[ProjectName]` 前缀）
- `@l`: 日志级别 (INFO, ERROR, etc.)
- `Project`: 项目名称 + 运行时间戳
- 以及您在 Python 代码中通过 `extra={...}` 传递的任何额外字段。

## 📅 后续更新计划

为了满足更广泛的监控需求，本项目计划在后续版本中引入 **多平台推送扩展 (Multi-platform Push Extensions)**，支持将关键任务状态推送到更多协作与告警平台：

- [ ] **企业级即时通讯**：支持 钉钉 (DingTalk)、飞书 (Lark)、企业微信 (WeChat Work) 的 Webhook 机器人通知。
- [ ] **多端推送服务**：集成 Bark (iOS)、PushDeer、Server酱 等移动端推送工具。
- [ ] **标准协议支持**：支持通过 SMTP 发送关键错误邮件告警。
- [ ] **日志存储优化**：提供对 ELK (Elasticsearch, Logstash, Kibana) 或 Loki 的原生导出支持。
- [ ] **交互式监控**：开发简单的 Web Dashboard 实时预览多个 Snakemake 实例的状态。

欢迎通过 Issue 提交您的功能需求或贡献代码！
