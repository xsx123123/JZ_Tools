# Snakemake Logger 增强插件：Rich-Loguru

这是一个基于 Loguru 和 Rich 开发的 Snakemake 日志插件，旨在为生物信息学流程提供极度舒适的终端输出、结构化的本地记录，以及基于 **Grafana Loki** 的远程可视化监控。

## 🌟 核心特性

- **华丽的终端输出**：利用 Rich 库优化 Snakemake 运行状态，支持进度条展示和规则高亮。
- **沉浸式启动体验**：内置系统自检风格的启动过场动画与状态面板，提供专业的 CLI 交互感。
- **结构化本地日志**：Loguru 驱动，支持自动滚动、多级别记录（JSON 或文本）。
- **Grafana Loki 远程监控深度整合**：
    - 将流程日志实时以结构化 JSON 格式推送到 Loki 服务器。
    - **智能日志清洗**：自动去除终端的高亮颜色代码（Rich Markup），确保 Loki 中展示纯净文本。
    - **自动结构化解析**：自动从日志中提取 `Snakemake_Rule` (规则名)、`Snakemake_JobId` (任务ID)、`Event_Type` (事件类型) 和 `Shell_Command` 等字段，便于精确查询。
    - **项目隔离**：日志消息自动添加 `ProjectName |` 前缀，标签中包含 `project` 字段，轻松区分不同项目。
    - **按需推送**：仅当配置了有效的 Loki URL 时才启用推送。
- **非阻塞架构**：日志发送由 Loguru 的异步 Sink 处理，确保在高并发任务下不阻塞 Snakemake 主进程。
- **零配置开销**：支持自动读取配置文件，或直接通过 Snakemake 命令行参数控制。

## 🚀 安装指南

```bash
pip install snakemake-logger-plugin-rich-loguru
```

（请根据实际包名调整安装命令，如果是本地开发，请使用 `pip install -e .`）

## 📊 远程监控配置 (Loki)

该插件支持通过多种方式加载配置，优先级如下：

1.  **命令行指定的 Analysis 配置** (`--config analysisyaml=...`)
2.  **Snakemake 配置文件** (`config.yaml` 或 `--config` 参数)
3.  **环境变量** (`SNAKEMAKE_MONITOR_CONF`)
4.  **独立配置文件** (`monitor_config.yaml`，默认查找当前目录)

### 配置参数

| 参数名 | 描述 | 示例 |
| :--- | :--- | :--- |
| `loki_url` | Loki 推送 API 地址 | `http://192.168.1.100:3100/loki/api/v1/push` |
| `project_name` | 项目名称 (作为标签和消息前缀) | `GenomicsPipeline` |

### 方式一：通过 Analysis Config 文件（新增，推荐用于动态场景）

如果您的流程通过 `--config analysisyaml=path/to/analysis.yaml` 指定了额外的分析配置文件，插件会自动读取该文件中的 `loki_url` 和 `project_name`。

**命令示例：**
```bash
snakemake --logger rich-loguru --config analysisyaml=/data/project/config.yaml ...
```

**配置文件内容 (`/data/project/config.yaml`)：**
```yaml
# 其他分析参数...
input_dir: "/data/raw"

# 监控配置
loki_url: "http://loki-server:3100/loki/api/v1/push"
project_name: "Batch_20260130"
```

### 方式二：集成到 Snakemake 主配置

直接在您的 `config.yaml` 中添加监控配置：

```yaml
# config.yaml
samples: "samples.tsv"

# === 监控配置 ===
loki_url: "http://192.168.1.100:3100/loki/api/v1/push"
project_name: "My_Analysis_Project"
```

在运行 Snakemake 时，确保显式加载插件：

```bash
snakemake --logger rich-loguru --configfile config.yaml ...
```

### 方式二：使用独立配置文件 (monitor_config.yaml)

在工作流根目录下创建 `monitor_config.yaml`：

```yaml
loki_url: "http://localhost:3100/loki/api/v1/push"
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

您的 `scripts/` 目录下的 Python 脚本也可以复用该日志配置，将分析日志也推送到 Loki。

```python
# scripts/analysis.py
from snakemake_logger_plugin_rich_loguru import get_logger, install

# 如果是独立脚本运行（非 Snakemake 规则内），可以手动初始化
# install({"loki_url": "...", "project_name": "..."})

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

## 📈 Grafana 中的查询示例

在 Grafana 的 Explore 页面中，您可以选择 Loki 数据源并使用 LogQL 进行查询：

**筛选特定项目的日志：**
```logql
{job="snakemake", project="My_Analysis_Project"}
```

**查找特定规则的日志（利用自动提取的字段）：**
```logql
{job="snakemake"} | json | Snakemake_Rule="short_read_qc_r1"
```

**统计特定任务的耗时或错误：**
```logql
count_over_time({job="snakemake"} | json | level="ERROR" [1h])
```

## 📅 后续更新计划

为了满足更广泛的监控需求，本项目计划在后续版本中引入 **多平台推送扩展 (Multi-platform Push Extensions)**，支持将关键任务状态推送到更多协作与告警平台：

- [ ] **企业级即时通讯**：支持 钉钉 (DingTalk)、飞书 (Lark)、企业微信 (WeChat Work) 的 Webhook 机器人通知。
- [ ] **多端推送服务**：集成 Bark (iOS)、PushDeer、Server酱 等移动端推送工具。
- [ ] **标准协议支持**：支持通过 SMTP 发送关键错误邮件告警。
- [ ] **日志存储优化**：提供对 ELK (Elasticsearch, Logstash, Kibana) 的支持。
- [ ] **交互式监控**：开发简单的 Web Dashboard 实时预览多个 Snakemake 实例的状态。

欢迎通过 Issue 提交您的功能需求或贡献代码！