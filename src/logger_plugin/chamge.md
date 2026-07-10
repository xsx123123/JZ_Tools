# Changelog

## 0.2.1

### Fixed

- 将 `LokiHandler` 与 `OmicHubMonitorHandler` 的后台 worker thread 改为 `daemon=True`，修复 Snakemake 主流程在任务完成后因等待后台线程而无法退出的问题。
- 明确 Snakemake CLI 实际使用的 logger 名称为 `rich-loguru`（带连字符）。

### Added

- 新增 `tests/mock_omichub_server.py`：本地 http.server mock，用于集成测试验证 OmicHub 事件接收。
- 新增 `tests/monitor_config.yaml`：集成测试示例配置，包含 OmicHub 原生监控、Bearer Token 与 HMAC 签名。

## 0.2.0

### Added

- OmicHub 原生工作流监控推送能力：
  - 新增 `OmicHubMonitorHandler`（`omichub_utils.py`），异步 Queue + Worker 模式推送结构化事件。
  - 支持 `Authorization: Bearer <token>` 鉴权。
  - 支持 HMAC-SHA256 请求签名（`X-OmicHub-Timestamp` / `X-OmicHub-Nonce` / `X-OmicHub-Signature`）。
  - 支持 AES-256-GCM payload 级加密（`X-OmicHub-Encrypted: A256GCM`）。
- 新增 `security_utils.py`：timestamp/nonce 生成、HMAC 签名、AES-GCM 加解密。
- 新增公共事件解析器 `extract_snakemake_event()` 与公共进度追踪器 `SnakemakeProgressTracker`（`utils.py`），`LokiHandler` 与 `OmicHubMonitorHandler` 共用，确保进度计算一致。
- 配置加载增强：
  - 支持仅配置 `omichub_monitor_url` 而不配置 `loki_url` 的配置文件。
  - 支持 `${ENV_NAME}` 环境变量占位符解析。
  - 支持 `SNAKEMAKE_OMICHUB_*` 系列环境变量兜底。
  - 敏感字段（token、signing key、encryption key、notification_url）自动脱敏，不打印原文。
- 可靠性增强：
  - 有界队列，满时丢弃低优先级事件并 stderr 提示。
  - 可配置重试次数/退避，仅对网络错误/5xx 重试，4xx 不重试。
  - 默认 5 秒超时。
  - `close()` + `atexit` flush，进程退出时尽量排空队列。
- 新增单元测试：`tests/test_omichub_utils.py`、`tests/test_security_utils.py`。
- 新增依赖：`cryptography ^42.0.0`、`pyyaml ^6.0.3`。

### Changed

- `loki_utils.py` 改为接收 `SnakemakeProgressTracker` 实例，不再内部维护状态。
- `__init__.py` 中 `install()` 重构，分别初始化 Loki 与 OmicHub handler；dry-run 时禁用远程推送。
- 版本升级至 `0.2.0`。
