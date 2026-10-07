# GEO寻宝鼠 · 优化 TODO

> 2026-10-07 更新。已完成本轮部署稳定性修复，后续待办重新登记在这里。

## 已完成

- [x] **nginx 开 gzip**（`deploy/nginx.docker.conf`）：压缩 CSS、JavaScript、JSON 和 SVG 文本资源。
- [x] **chat 容器健康检查改打 `/stats`**（`deploy/docker-compose.yml`）：健康检查不再依赖外部 LLM 网关。

## 已知限制

- 平台 Deno 运行时统计仅存内存，实例重启归零。
- 部分 LLM 网关不回传 `usage` 帧，Token 面板显示「网关未回传用量」。
- `docs/2x.x.x.x/` 日期截图目录已 gitignore，不入库。
