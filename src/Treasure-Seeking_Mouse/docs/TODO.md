# GEO寻宝鼠 · 优化 TODO

> 2026-10-05 梳理。按优先级排序，做完一条勾一条。
> 约定：改完跑 `npx tsc --noEmit`、`npx vite build`，Docker 相关改动跑 `make docker-start` 验证。

## P0 · 快速修复（半天内）

- [ ] **nginx 开 gzip**（`deploy/nginx.docker.conf`）：静态产物（JS/CSS）未压缩，首屏传输可省 60-70%。加 `gzip on; gzip_types text/css application/javascript application/json image/svg+xml; gzip_min_length 1k;` 即可
- [ ] **补 favicon**（`index.html`）：现在没有 `<link rel="icon">`，浏览器默认请求 /favicon.ico 404。用桌宠小鼠 `src/assets/pet/mouse-base.webp` 裁一张 64×64 PNG（或直接用 BrandMark 的 DNA SVG 内联 data URI），加 `<link rel="icon" ...>`
- [ ] **chat 容器健康检查改打 `/stats`**（`deploy/docker-compose.yml` healthcheck）：现在每 30s `wget /models` 会穿透到 LLM 网关，冷启动/断网时误判 unhealthy。`/stats` 是纯内存读、零外部依赖，同时能顺带验证 handler 是否活着

## P1 · 体验优化（1-2 天）

- [ ] **关于页大图暗色适配**（`src/routes/about.tsx`）：`intro.png`（1.9MB 亮色长图）在夜探矿洞主题下刺眼。方案：`.dark` 下给图片容器加 `filter: brightness(.82) saturate(.9)` 或暗色渐变遮罩；顺带 `loading="lazy"`
- [ ] **压缩 README/关于页图片**（`docs/寻宝鼠.png` 1.9MB、`docs/封面-夜探矿洞横版.png` 6.3MB、`src/assets/about/intro.png` 1.9MB）：转 webp（体积可降到 1/5-1/10），README 引用同步改。git 历史里的旧图不用清
- [ ] **统计面板加时间维度**（`functions/seqout-chat/index.ts` + `UsageStatsDialog.tsx`）：现在是累计值，可加「今日 / 本周 / 累计」三段——内存里维护按天的 ring buffer（如 30 天）即可，不引入数据库
- [ ] **统计面板空态引导**：工具列表为空时文案已有，但四宫格全 0 时（新部署）可显示一行「去问阿寻第一个问题」的快捷跳转按钮

## P2 · 架构与质量（按需）

- [ ] **前端测试从零到一**（项目目前零测试）：先给纯函数补 vitest——`SuggestionBlock.extractFollowups()`、`seqoutChat` 的 SSE 解析、`statsStore` 的跨周归零逻辑。跑在 `pnpm run typecheck` 同级
- [ ] **SSE 解析单例化/异常细化**（`src/services/seqoutChat.ts`）：流中断统一报「响应中断」，可区分「网关超时 / 服务重启 / 用户主动中止」，onError 带错误码便于排查
- [ ] **桌宠形象统一**（`src/components/BrandMark.tsx`）：空态英雄区已换针织小鼠，侧栏/折叠条/关于页顶栏的 16px 小标仍是 DNA 线稿。可画一个简化小鼠 SVG（单色、18px 内可辨识），或维持现状（线稿在小尺寸更清晰，改动需设计稿）
- [ ] **LLM 循环 token 预算**：40 轮 × 16 条历史无截断上限，长会话 prompt 膨胀快（统计面板已能观测到单轮 180K token）。可按轮次对历史做摘要压缩，或把 `history.slice(-16)` 改为按 token 数截断
- [ ] **多实例部署时的统计聚合**（`functions/seqout-chat/index.ts`）：统计是进程内存，平台模式多实例各记各的；自托管单实例无此问题。若上平台需外置存储（Supabase 表或 Redis），届时再议

## 备忘（已知限制，非 TODO）

- 平台 Deno 运行时统计仅存内存，实例重启归零——文档已注明
- 部分 LLM 网关不回传 `usage` 帧，Token 面板显示「网关未回传用量」——非 bug
- `docs/2x.x.x.x/` 日期截图目录已 gitignore，不入库
