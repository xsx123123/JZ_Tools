# Snakemake Logger Plugin 接入 OmicHub 监控的修改设计文档

日期：2026-07-10

适用插件：

`/home/zj/zj_code_libarary/jz_tools/src/logger_plugin`

当前插件包：

`snakemake-logger-plugin-rich-loguru`

当前版本：

`0.1.8`

## 1. 修改目标

本次插件更新的目标是让 Snakemake 流程在运行时可以把结构化事件稳定、安全地推送到 OmicHub 平台，用于平台内的实时流程监控面板。

插件需要同时保留现有 Loki/Grafana 能力，并新增 OmicHub 原生监控推送能力：

- `loki_url`：继续用于推送到 Loki 或 OmicHub 的 Loki-compatible 摄取端点。
- `project_name`：第一期可以直接等于 OmicHub `task_id`，用于任务关联。
- `omichub_monitor_url`：新增，推送 OmicHub 原生事件。
- `omichub_monitor_token`：新增，用于 OmicHub 摄取端鉴权。
- 可选：`omichub_monitor_signing_key`，用于 HMAC 签名，防篡改和防重放。
- 可选：`omichub_monitor_encryption_key`，用于 payload 级 AES-GCM 加密。

最终希望插件支持两种模式：

第一期兼容模式：

```yaml
loki_url: "http://web:8000/api/v1/workflow-monitor"
project_name: "<task_id>"
```

长期原生模式：

```yaml
omichub_monitor_url: "https://omichub.example.edu/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
project_name: "<task_id>"
omichub_task_id: "<task_id>"
omichub_flow_id: "<flow_id>"
omichub_user_id: "<user_id>"
```

## 2. 关于 token 是否等于加密

`omichub_monitor_token` 本身不能实现信息加密。

它的作用是：

- 证明请求来自受信任的 Worker 或 Snakemake 插件。
- 防止未授权客户端伪造监控事件。
- 如果参与 HMAC，可以防止请求内容被篡改，并降低重放攻击风险。

它不能做到：

- 防止网络中间人读取 HTTP 明文内容。
- 隐藏 task_id、rule、shell command、错误日志等 payload 内容。

如果你“不希望相关信息被截获”，需要至少采用以下一种方式：

### 2.1 推荐方式：HTTPS/TLS

将 `omichub_monitor_url` 配置为 `https://...`，让 token 和事件 payload 都走 TLS 加密传输。

这是最推荐、最标准的方式：

```yaml
omichub_monitor_url: "https://omichub.example.edu/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
```

插件侧使用 Python 标准库 `urllib.request.urlopen()` 时，HTTPS 默认会校验证书。

适用场景：

- Worker 到 OmicHub 通过校园网、机房网络或公网访问。
- 希望防止网络链路上的旁路监听。
- 希望方案简单可靠。

### 2.2 增强方式：HMAC 签名

HMAC 不是加密，但能保证完整性和请求真实性。

它可以防止：

- 中间人篡改 payload。
- 攻击者伪造事件。
- 攻击者重放旧请求。

它不能防止：

- HTTP 明文内容被读取。

建议 Header：

```text
Authorization: Bearer <token>
X-OmicHub-Timestamp: 2026-07-10T12:00:00Z
X-OmicHub-Nonce: <random-uuid-or-random-base64>
X-OmicHub-Signature: v1=<hmac-sha256-hex>
```

签名内容：

```text
timestamp + "\n" + nonce + "\n" + sha256(request_body)
```

签名密钥：

- 可以第一期直接使用 `omichub_monitor_token`。
- 更推荐长期使用单独的 `omichub_monitor_signing_key`。

后端校验：

- timestamp 与服务器时间偏差不超过 5 分钟。
- nonce 在 Redis 中短期去重。
- HMAC 匹配。

### 2.3 最高保密方式：payload 级 AES-GCM 加密

如果即使在内网 HTTP 上也不希望事件内容被读取，可以增加 payload 级加密。

这需要插件新增依赖：

```toml
cryptography = "^42.0.0"
```

新增配置：

```yaml
omichub_monitor_encrypt_payload: true
omichub_monitor_encryption_key: "${OMICHUB_WORKFLOW_MONITOR_ENCRYPTION_KEY}"
```

其中 `omichub_monitor_encryption_key` 建议是 32 字节随机密钥的 base64 编码。

加密算法建议：

```text
AES-256-GCM
```

加密 envelope：

```json
{
  "schema_version": "omichub.monitor.envelope.v1",
  "alg": "A256GCM",
  "kid": "default",
  "nonce": "base64-12-byte-random-nonce",
  "ciphertext": "base64-ciphertext-with-tag",
  "timestamp": "2026-07-10T12:00:00Z"
}
```

注意：

- token 仍用于鉴权。
- HMAC 仍建议保留，用于 envelope 完整性和防重放。
- AES-GCM 已经提供密文完整性，但 HMAC Header 仍能帮助后端在解密前做轻量鉴权。
- 不建议把 `omichub_monitor_token` 同时当作加密密钥。鉴权 token 和加密 key 应该分开。

## 3. 推荐安全等级

### 等级 A：内网开发环境

适合本地 Docker 网络、单机部署验证：

```yaml
omichub_monitor_url: "http://web:8000/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
```

风险：

- Docker 内网或宿主机上有高权限进程时，HTTP 内容理论上可能被捕获。

### 等级 B：生产推荐

适合正式部署：

```yaml
omichub_monitor_url: "https://omichub.example.edu/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
omichub_monitor_sign_requests: true
```

效果：

- TLS 防截获。
- Bearer token 做鉴权。
- HMAC 防篡改、防重放。

### 等级 C：高敏感环境

适合日志中可能包含样本路径、客户名、shell command、错误堆栈等敏感信息，且不完全信任传输链路的场景：

```yaml
omichub_monitor_url: "https://omichub.example.edu/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
omichub_monitor_sign_requests: true
omichub_monitor_encrypt_payload: true
omichub_monitor_encryption_key: "${OMICHUB_WORKFLOW_MONITOR_ENCRYPTION_KEY}"
```

效果：

- TLS 保护传输层。
- payload 加密保护应用层。
- HMAC 保护请求完整性和防重放。

推荐正式环境至少使用等级 B。

## 4. 新增配置项

### 4.1 配置文件字段

建议插件支持以下字段：

```yaml
# Loki / Grafana 兼容推送
loki_url: "http://loki:3100"
project_name: "task-id-or-project-name"

# OmicHub 原生监控推送
omichub_monitor_url: "https://omichub.example.edu/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
omichub_task_id: "<task_id>"
omichub_flow_id: "<flow_id>"
omichub_user_id: "<user_id>"

# 安全增强
omichub_monitor_sign_requests: true
omichub_monitor_signing_key: "${OMICHUB_WORKFLOW_MONITOR_SIGNING_KEY}"
omichub_monitor_encrypt_payload: false
omichub_monitor_encryption_key: "${OMICHUB_WORKFLOW_MONITOR_ENCRYPTION_KEY}"
omichub_monitor_tls_verify: true

# 可靠性
omichub_monitor_timeout: 5
omichub_monitor_queue_size: 10000
omichub_monitor_retry_count: 3
omichub_monitor_retry_backoff: 0.5
```

### 4.2 环境变量

建议支持环境变量兜底：

```text
SNAKEMAKE_OMICHUB_MONITOR_URL
SNAKEMAKE_OMICHUB_MONITOR_TOKEN
SNAKEMAKE_OMICHUB_TASK_ID
SNAKEMAKE_OMICHUB_FLOW_ID
SNAKEMAKE_OMICHUB_USER_ID
SNAKEMAKE_OMICHUB_MONITOR_SIGN_REQUESTS
SNAKEMAKE_OMICHUB_MONITOR_SIGNING_KEY
SNAKEMAKE_OMICHUB_MONITOR_ENCRYPT_PAYLOAD
SNAKEMAKE_OMICHUB_MONITOR_ENCRYPTION_KEY
SNAKEMAKE_OMICHUB_MONITOR_TLS_VERIFY
SNAKEMAKE_OMICHUB_MONITOR_TIMEOUT
SNAKEMAKE_OMICHUB_MONITOR_QUEUE_SIZE
SNAKEMAKE_OMICHUB_MONITOR_RETRY_COUNT
SNAKEMAKE_OMICHUB_MONITOR_RETRY_BACKOFF
```

### 4.3 配置优先级

维持当前插件思路，但需要修正一个点。

当前 `install()` 只在配置文件中存在 `loki_url` 时才认为配置有效：

```python
if "loki_url" in loaded_config:
    config = loaded_config
```

更新后应改成：

```python
MONITOR_CONFIG_KEYS = {
    "loki_url",
    "project_name",
    "omichub_monitor_url",
    "omichub_monitor_token",
    "omichub_task_id",
    "omichub_flow_id",
    "omichub_user_id",
}

if MONITOR_CONFIG_KEYS.intersection(loaded_config):
    config = loaded_config
```

否则如果某个任务只配置 `omichub_monitor_url` 而不配置 `loki_url`，插件会错误地忽略这个配置文件。

建议配置优先级：

1. `--config monitor_conf=...`
2. `--config analysisyaml=...`
3. Snakemake config dict。
4. 环境变量 `SNAKEMAKE_MONITOR_CONF`。
5. 当前目录 `monitor_config.yaml`。
6. 当前目录 `config/monitor_config.yaml`。

## 5. 第一阶段兼容方案：project_name 等于 task_id

第一阶段可以不新增 OmicHub 原生事件接口，只使用现有插件的 Loki 推送能力。

OmicHub 后端实现一个 Loki-compatible 摄取端点：

```text
POST /api/v1/workflow-monitor/loki/api/v1/push
```

任务工作目录生成：

```yaml
loki_url: "http://web:8000/api/v1/workflow-monitor"
project_name: "<task_id>"
```

插件会自动拼接为：

```text
http://web:8000/api/v1/workflow-monitor/loki/api/v1/push
```

因为 `project_name = task_id`，OmicHub 后端可以直接从 Loki label 中拿到 task_id：

```json
{
  "stream": {
    "project_id": "<task_id>",
    "job": "snakemake",
    "level": "INFO"
  }
}
```

第一阶段插件侧只需要确保：

- `project_name` 支持被平台强制注入。
- 日志 payload 中保留 `progress_percent` 和 `progress_details`。
- 不把 token、密钥、Webhook URL 打到日志中。

第一阶段的不足：

- Loki payload 不是 OmicHub 业务原生结构。
- 鉴权较弱，除非后端只开放内网或插件支持 header/token。
- 如果用 HTTP，内容仍然是明文传输。

## 6. 第二阶段原生方案：新增 OmicHubMonitorHandler

### 6.1 新增模块建议

建议在插件中新增：

```text
snakemake_logger_plugin_rich_loguru/omichub_utils.py
snakemake_logger_plugin_rich_loguru/security_utils.py
```

职责：

- `omichub_utils.py`：构建 OmicHub 原生事件 payload，发送 HTTP 请求。
- `security_utils.py`：生成 HMAC 签名、AES-GCM 加密、nonce、时间戳。

### 6.2 抽取公共事件解析器

当前 `LokiHandler._process_message()` 已经能解析：

- Rule。
- Jobid。
- Finished jobid。
- Shell command。

建议抽成公共函数：

```python
def extract_snakemake_event(message: str) -> tuple[str, dict]:
    ...
```

`LokiHandler` 和 `OmicHubMonitorHandler` 共用它，避免两个 handler 解析结果不一致。

### 6.3 OmicHubMonitorHandler 类

新增类：

```python
class OmicHubMonitorHandler:
    def __init__(
        self,
        monitor_url: str,
        token: str | None = None,
        project_name: str | None = None,
        task_id: str | None = None,
        flow_id: str | None = None,
        user_id: str | None = None,
        sign_requests: bool = False,
        signing_key: str | None = None,
        encrypt_payload: bool = False,
        encryption_key: str | None = None,
        timeout: float = 5.0,
        queue_size: int = 10000,
        retry_count: int = 3,
        retry_backoff: float = 0.5,
    ):
        ...

    def write(self, message: str) -> None:
        ...

    def close(self) -> None:
        ...
```

实现原则：

- 使用 Queue + Worker Thread，和现有 LokiHandler 一致。
- 发送失败不能阻塞 Snakemake 主流程。
- 默认只向 stderr 输出简短错误，不打印 token 和完整敏感 payload。
- 进程退出时尽量 flush 队列。

### 6.4 OmicHub 原生事件 payload

推荐结构：

```json
{
  "schema_version": "omichub.workflow_event.v1",
  "task_id": "uuid",
  "flow_id": "rna_seq",
  "user_id": "uuid",
  "project_name": "uuid-or-project-name",
  "timestamp": "2026-07-10T12:00:00Z",
  "timestamp_ns": "1783675200000000000",
  "level": "info",
  "source": "snakemake",
  "message": "Finished jobid: 12 (Rule: trim_fastq)",
  "caller": "snakemake_logger_plugin_rich_loguru:emit:...",
  "snakemake": {
    "rule": "trim_fastq",
    "job_id": 12,
    "event_type": "JobFinished",
    "shell_command": null,
    "progress_percent": 42.5,
    "progress_details": "17/40"
  },
  "runtime": {
    "host": "worker-host",
    "pid": 12345,
    "cwd": "/data/omichub/users/.../results/rna_seq/<task_id>",
    "command": "snakemake -s ..."
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `schema_version` | 后端按版本解析，便于未来升级 |
| `task_id` | OmicHub 任务 ID，第一关键字段 |
| `flow_id` | 流程 ID，如 `rna_seq`、`atac_seq` |
| `user_id` | 任务归属用户 |
| `project_name` | 展示名或兼容字段，第一期可等于 task_id |
| `level` | `debug/info/warning/error/critical` |
| `message` | 清洗后的纯文本消息 |
| `snakemake.rule` | 当前 rule |
| `snakemake.job_id` | Snakemake jobid |
| `snakemake.event_type` | 事件类型 |
| `snakemake.progress_percent` | 0 到 100 |
| `snakemake.progress_details` | 如 `17/40` |
| `runtime` | 运行环境信息 |

### 6.5 加密 envelope payload

当 `omichub_monitor_encrypt_payload=true` 时，不直接发送事件明文，而发送 envelope：

```json
{
  "schema_version": "omichub.monitor.envelope.v1",
  "alg": "A256GCM",
  "kid": "default",
  "nonce": "base64",
  "ciphertext": "base64",
  "timestamp": "2026-07-10T12:00:00Z"
}
```

HTTP Header 仍保留：

```text
Authorization: Bearer <token>
X-OmicHub-Timestamp: ...
X-OmicHub-Nonce: ...
X-OmicHub-Signature: v1=...
X-OmicHub-Encrypted: A256GCM
```

注意：

- 加密前的明文就是 `omichub.workflow_event.v1`。
- 后端解密后再做 task_id 权限和状态更新。
- 如果要让网关层按 task_id 限流，才考虑把 task_id 放在 envelope 外层；但这会泄露 task_id。默认不建议外放。

## 7. HTTP 请求规范

### 7.1 明文 JSON 请求

```text
POST /api/v1/workflow-monitor/events HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>
X-OmicHub-Event-Schema: omichub.workflow_event.v1
X-OmicHub-Timestamp: 2026-07-10T12:00:00Z
X-OmicHub-Nonce: <nonce>
X-OmicHub-Signature: v1=<hex>
```

Body：

```json
{
  "schema_version": "omichub.workflow_event.v1",
  "task_id": "...",
  "message": "...",
  "snakemake": {
    "progress_percent": 42.5
  }
}
```

### 7.2 加密 JSON 请求

```text
POST /api/v1/workflow-monitor/events HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token>
X-OmicHub-Event-Schema: omichub.monitor.envelope.v1
X-OmicHub-Encrypted: A256GCM
X-OmicHub-Timestamp: 2026-07-10T12:00:00Z
X-OmicHub-Nonce: <nonce>
X-OmicHub-Signature: v1=<hex>
```

Body：

```json
{
  "schema_version": "omichub.monitor.envelope.v1",
  "alg": "A256GCM",
  "kid": "default",
  "nonce": "...",
  "ciphertext": "...",
  "timestamp": "..."
}
```

## 8. install() 修改设计

当前 `install(snakemake_config)` 负责：

- 判断 dry-run。
- 查找配置文件。
- 读取 `loki_url` 和 `project_name`。
- 初始化 LokiHandler。

建议改成：

```python
def install(snakemake_config):
    if is_dry_run():
        disable_remote_push()
        return {}

    config = load_monitor_config(snakemake_config)
    config = merge_env_config(config)
    config = resolve_env_placeholders(config)

    setup_loki_if_enabled(config)
    setup_omichub_monitor_if_enabled(config)

    return config
```

### 8.1 环境变量插值

配置中可能出现：

```yaml
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
```

插件应支持解析 `${ENV_NAME}`：

```python
def resolve_env_placeholders(config: dict) -> dict:
    ...
```

如果环境变量不存在：

- token/encryption key 这类敏感配置应报 warning。
- 不要把 `${...}` 原样当 token 发送。

### 8.2 敏感字段脱敏

任何日志中都不要输出以下字段原文：

```text
omichub_monitor_token
omichub_monitor_signing_key
omichub_monitor_encryption_key
notification_url
```

只允许打印：

```text
OmicHub monitor enabled: https://.../events
```

不要打印：

```text
Authorization
token
signature key
encryption key
webhook url token
```

## 9. 可靠性设计

### 9.1 队列

建议：

```python
queue.Queue(maxsize=10000)
```

当队列满时：

- 不阻塞 Snakemake。
- 丢弃低优先级日志。
- error/critical 尽量保留。
- stderr 输出简短提示：`[OmicHubMonitor] queue full, dropped event`。

### 9.2 重试

建议：

- 默认 `retry_count=3`。
- 默认 `retry_backoff=0.5` 秒。
- 只对网络错误、5xx 重试。
- 4xx 不重试，避免 token 错误导致大量请求。

### 9.3 超时

默认：

```text
timeout=5s
```

不要无限等待。

### 9.4 退出 flush

当前 daemon thread 可能在进程退出时丢最后几条事件。

建议：

- handler 提供 `close()`。
- 注册 `atexit.register(handler.close)`。
- `close()` 做：
  - put sentinel。
  - `queue.join()`。
  - join worker thread，最大等待 3 到 5 秒。

## 10. 进度追踪修改建议

当前 `format_payload_for_loki()` 内部负责更新 progress state。

新增 OmicHub 原生推送时有两种选择：

### 10.1 简单方案

OmicHubMonitorHandler 自己维护一份 state：

```python
self._state = {
    "current": 0,
    "real_total": 0,
    "finished_ids": set(),
}
```

优点：

- 改动小。
- 与 LokiHandler 相互独立。

缺点：

- 两个 handler 各自计算进度，存在重复逻辑。

### 10.2 推荐方案

抽出公共进度追踪器：

```python
class SnakemakeProgressTracker:
    def update(raw_log: dict) -> dict:
        return {
            "progress_percent": 42.5,
            "progress_details": "17/40",
            "current": 17,
            "total": 40,
        }
```

`LokiHandler` 和 `OmicHubMonitorHandler` 共用。

优点：

- 行为一致。
- 单元测试更清晰。

建议第二阶段采用推荐方案。

## 11. 测试计划

### 11.1 单元测试

新增测试：

```text
tests/test_omichub_utils.py
tests/test_security_utils.py
```

覆盖：

- `Rule: xxx, Jobid: 1` 解析。
- `Finished jobid: 1 (Rule: xxx)` 解析。
- `Shell command: ...` 解析。
- `Job stats` total 解析。
- progress_percent 计算。
- payload schema 生成。
- HMAC 签名一致性。
- timestamp/nonce 生成。
- AES-GCM 加密后可解密。
- token/key 不出现在日志消息中。

### 11.2 集成测试

使用插件自带 `tests/Snakefile`：

```bash
snakemake --logger rich-loguru --config monitor_conf=tests/monitor_config.yaml --cores 1
```

模拟 OmicHub 接收端：

- 启动一个本地 FastAPI 或 http.server mock。
- 记录收到的请求。
- 验证 header、body、signature。
- 验证失败时 Snakemake 不被阻塞。

### 11.3 安全测试

需要验证：

- HTTP 明文模式下 payload 可读，文档明确该模式只适合内网开发。
- HTTPS 模式证书校验默认开启。
- `omichub_monitor_tls_verify=false` 仅允许开发环境使用，并输出 warning。
- HMAC timestamp 超过窗口时后端拒绝。
- nonce 重放时后端拒绝。
- token 错误时后端返回 401，插件不无限重试。
- AES key 错误时后端解密失败并返回 400。

## 12. 版本升级建议

当前版本是 `0.1.8`。

建议：

- `0.1.9`：增加 OmicHub 原生推送、token 鉴权、配置加载修正。
- `0.2.0`：增加 HMAC 签名、AES-GCM payload 加密、退出 flush。

如果希望一次性完成安全能力，也可以直接发布：

```text
0.2.0
```

## 13. 推荐提交顺序

### 提交 1：配置加载修正

- 支持只含 `omichub_monitor_url` 的配置文件。
- 支持环境变量插值。
- 增加敏感字段脱敏。

### 提交 2：OmicHub 原生 payload

- 新增 `omichub_utils.py`。
- 新增 `OmicHubMonitorHandler`。
- 支持 `Authorization: Bearer`。
- 保持 LokiHandler 不变。

### 提交 3：签名与安全

- 新增 HMAC 签名。
- 新增 timestamp/nonce。
- 增加单元测试。

### 提交 4：payload 加密

- 新增 `cryptography` 依赖。
- 实现 AES-256-GCM。
- 增加加密 envelope。

### 提交 5：可靠性

- 增加 bounded queue。
- 增加 retry/backoff。
- 增加 `close()` 和 `atexit` flush。

## 14. OmicHub 任务配置示例

OmicHub 在每个任务工作目录生成：

```yaml
# monitor_config.yaml
project_name: "8c9f1a8e-7e3b-4c6b-9a4b-9b8b1b0c2d3e"

loki_url: "http://web:8000/api/v1/workflow-monitor"

omichub_monitor_url: "https://omichub.example.edu/api/v1/workflow-monitor/events"
omichub_monitor_token: "${OMICHUB_WORKFLOW_MONITOR_TOKEN}"
omichub_monitor_sign_requests: true
omichub_monitor_encrypt_payload: false

omichub_task_id: "8c9f1a8e-7e3b-4c6b-9a4b-9b8b1b0c2d3e"
omichub_flow_id: "rna_seq"
omichub_user_id: "5d8b7c4a-0000-0000-0000-000000000000"
```

Snakemake 命令：

```bash
snakemake \
  -s /home/zj/pipeline/RNAFlow/snakefile \
  --cores 8 \
  --use-conda \
  --directory /data/omichub/users/<uid>/results/rna_seq/<task_id> \
  --logger rich-loguru \
  --config analysisyaml=/data/omichub/users/<uid>/results/rna_seq/<task_id>/config.yaml \
           monitor_conf=/data/omichub/users/<uid>/results/rna_seq/<task_id>/monitor_config.yaml
```

正式接入前必须验证 logger 名称。插件 `pyproject.toml` entry point 当前是：

```toml
[tool.poetry.plugins."snakemake.loggers"]
rich_loguru = "snakemake_logger_plugin_rich_loguru:LogHandler"
```

但 README 中使用的是：

```bash
snakemake --logger rich-loguru
```

需要在实际 Snakemake 环境中确认到底使用 `rich-loguru` 还是 `rich_loguru`。

## 15. 验收标准

插件更新完成后，应满足：

- 不配置 OmicHub 字段时，原 Loki/Grafana 功能不受影响。
- 配置 `omichub_monitor_url` 后，Snakemake 运行中能持续推送事件。
- `project_name = task_id` 时，OmicHub 能准确关联任务。
- `progress_percent` 与 `progress_details` 能出现在 OmicHub payload 中。
- token 不会被打印到终端、日志文件或 Loki。
- OmicHub 接收端不可用时，Snakemake 主流程不被阻塞。
- dry-run 时默认不推送远程监控事件。
- HTTPS 模式可正常校验证书。
- HMAC 开启时，后端能拒绝篡改或重放请求。
- AES-GCM 开启时，抓包只能看到 envelope 和密文，看不到 rule、路径、错误消息。

## 16. 最终建议

建议插件更新按“两步走”：

第一步先做兼容和低风险能力：

- 修正配置加载。
- 支持 `omichub_monitor_url`。
- 支持 `omichub_monitor_token`。
- 支持 `project_name = task_id`。
- 保留现有 Loki 推送。

第二步再做安全增强：

- HTTPS 作为生产默认要求。
- 增加 HMAC 签名。
- 对高敏感环境增加 AES-GCM payload 加密。

需要特别明确的是：`omichub_monitor_token` 是鉴权凭据，不是加密机制。真正防止信息被截获，生产环境必须使用 HTTPS/TLS；如果还希望即使传输链路被抓包也看不到日志内容，则需要启用 payload 级 AES-GCM 加密。
