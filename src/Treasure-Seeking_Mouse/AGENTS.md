# AGENTS.md

## 依赖
- `@supabase/supabase-js`：云服务客户端（Auth / Database），仅通过 `src/supabase/client.ts` 生成的单例使用。
- 无其他第三方运行时依赖；Markdown 渲染为自研轻量组件（`src/components/chat/Markdown.tsx`），动效全部 CSS keyframes（遵守禁 framer-motion 约束）。

## 架构
- 单页聊天应用：`src/routes/index.tsx` 组合会话栏、对话区、登录弹窗；子组件在 `src/components/chat/`、`src/components/auth/`。
- 消息尾部「继续寻宝」建议：模型按 SYSTEM_PROMPT 第 8 条约定在正文末尾输出 `:::followup ... :::` 围栏，前端 `SuggestionBlock.tsx` 的 `extractFollowups()` 解析（剥列表符号/加粗），正文渲染剥离后的 main，建议渲染成默认折叠卡片，点击条目直接 handleSend。旧消息无该块时正常显示纯正文。
- 复制/重试：ChatMessage 悬停浮现按钮组（用户气泡=复制提问；助手=复制正文+重新挖一次）；handleRegenerate 截断到该助手消息前、取其前最近一条用户提问重发。
- 后端逻辑集中在 Edge Function `functions/seqout-chat`（verify_jwt=false）：
  - GET → 透传 LLM `/models` 目录（默认模型 **qwen3.8-flash**，非 qwen3.6-plus）。
  - POST → LLM tool-calling 循环（最多 40 轮，触顶提示文案在 round===39），直接 fetch `https://seqout.org/api`（纯 GET、无鉴权），把 seqout-mcp 的 26 个只读工具以 OpenAI function schema 声明式移植进函数内，不在前端调用、不运行 Python MCP 进程。
  - 下行 SSE 自定义协议：`{"delta"}` / `{"event":"tool"}` / `{"event":"cards"}` / `{"event":"end"}` / `{"error"}` / `[DONE]`，每 10s `: ping` 心跳防缓冲；前端 `src/services/seqoutChat.ts` 解析。
  - 自托管：handler 已导出且去 Deno 化（envGet 同时读 Deno/Node 环境），`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `SEQOUT_BASE_URL` 可覆盖；`pnpm run server`（`server/local.mjs`，Node≥22.6 原生跑 .ts + CORS）本地起服务，前端配 `VITE_CHAT_API` 直连即脱离 Meoo 平台；不配则走平台 Edge Function + `MEOO_PROJECT_API_KEY*` secrets，行为不变。
- 数据：`profiles` / `chat_sessions` / `chat_messages`（cards、tool_logs 为 JSONB），RLS 全部 `auth.uid()` 本人隔离；未登录时消息仅存 localStorage（key `seqout-local-session`）。
- 排行榜：`user_stats`（登录用户，auth.uid 本人 upsert）/ `guest_stats`（访客按匿名 device_id upsert，localStorage key `seqout-device-id`），两表 RLS 公开可读、仅本人可写；每表含累计列（treasures/digs/chats）+ 周列（week_treasures/week_digs/week_chats + week_base 周一日期，写入方 RPC 内自动跨周归零）+ display_name 自定义昵称。累加走 SECURITY INVOKER RPC `bump_user_stats` / `bump_guest_stats`（前端 `src/services/statsStore.ts` 在 handleSend 结束后 fire-and-forget 调用，treasures=出土卡片数、digs=工具回合数、chats=每轮+1）。面板 `src/components/chat/Leaderboard.tsx`（右滑抽屉 z-50，Tab 切登录榜/访客榜 + 本周/累计时间维度切换 + 行内铅笔/虚线按钮打开昵称浮层，前 3 名奖牌，当前身份——登录经 ownUserId、访客经设备指纹——高亮「我」并可改名），入口为顶栏 Trophy 图标。
- 认证：邮箱验证码 + 密码（signUp → verifyOtp type:'signup' → getUser → upsert profiles），忘记密码走 resetPasswordForEmail + `/reset-password` recovery 页。
- 桌宠「寻宝鼠」：`src/components/pet/TreasureMouse.tsx` 状态机（idle/digging/reveal/stow/miss/poke/spin/walk/look/celebrate）+ pointer 拖拽，主形象为本地抠图 PNG（`src/assets/pet/`，Vite 打包，原 CDN 链接带 auth_key 已废弃）；`src/routes/index.tsx` 在 handleSend 的 onTool/onCards/onEnd/onError 里经 `makePetEvent()`（自增 seq 去重）转发事件；偏好/宝藏计数/成就存 localStorage（`src/services/petStore.ts`）。z-30，低于抽屉 z-40/dialog z-50。
- 成就系统：累计挖宝 10/50/100 三档（ACHIEVEMENTS 常量），跨档一次性 celebrate 小剧场（星尘爆发+光环+横幅），领取记录存 localStorage `seqout-pet-achievements`（幂等去重）；存量高计数用户初始化时经 `earnedAchievements()` 直接补徽章、不播动画。cards 与 done 事件同轮可能都触发出货，用 `countedRef` 防止重复累加计数。
- 主题：亮色 `:root` + 夜探矿洞 `.dark` 双套 token（`src/styles.css`），组件一律消费 theme utility（`bg-card` 等），禁止再写 `bg-white` 类硬编码。切换由顶栏/折叠边条按钮触发，偏好写 localStorage `seqout-theme`；`index.html` 内联 bootstrap 脚本在 React 加载前挂 `.dark` 类防闪白（同时支持 `?theme=dark` URL 参数——这是沙箱截图取证通道，因为截图工具的 DOM 探针不支持 oklch，无法替我们点按钮）。暗色下 `--pet-amber-deep` 反转为亮金文字档，桌宠周边（土堆/气泡/尘埃/网格）均有 `.dark` 覆盖段。
- 自托管离线模式：未配置 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 时 `client.ts` 创建 Proxy 桩客户端（导出 `isOfflineMode`）——auth 固定未登录、任意调用链 await 得 `{data:null, error:null}`；`SessionSidebar` 的 `onLogin` 改可选，离线时隐藏登录按钮，应用以纯游客 + localStorage 运行。dev 下同源代理 `/chat-api` → 本地对话服务（`vite.config.ts` `server.proxy`，`CHAT_API_PROXY_TARGET` 可覆盖目标），`.env.local` 配 `VITE_CHAT_API=/chat-api` 即单端口同源访问。

## 踩坑记录
- ❌ Edge Function preflight TS2698（`Spread types may only be created from object types`）：Supabase `Json` 联合类型不能直接 spread → 先显式收窄为 `Record<string, Json>` 再展开。
- ❌ web-fetch / curl raw.githubusercontent 超时失败 → 用 `api.github.com/repos/.../contents/<path>` + base64 解码取证 GitHub 文件。
- ⚠️ 当前项目 `client.ts` 导出 `projectUrlId`，所有裸 fetch Edge Function 必须携带 `OneDay-App-Id` 头。
- ⚠️ seqout search 响应可能超大，送 LLM 前经 `trimForLLM` 截断（上限 100000 字符）；卡片数据单独经 `cards` 事件给前端渲染、不瘦身。
- ❌ Tailwind v4 默认刻度没有 `h-4.5` → 自定义尺寸用任意值语法 `h-[18px]`。
- ❌ index.html 旧版有 iframe postMessage 主题监听 + html.light 强制样式，与新主题体系冲突 → 整体重写为极简防闪白 bootstrap。
- ⚠️ `meoo-cli read-browser-screenshot` 的预览页探针会因 "unsupported color function oklch" 失败并降级到独立沙箱浏览器（localStorage 不共享）——降级截图只能验静默渲染，验交互态要用 `?theme=dark` 之类 URL 参数直入。
- 🎨 UI 主题：现代学术轻量亮色风（Perplexity/Claude 质感）+ 夜探矿洞暗色套。亮色：background=gray-50、card=white、primary/helix=teal-600、琥珀金 accent；暗色：深蓝灰底、teal-400 提亮主色、亮金 accent。统一轻投影 class `.shadow-soft` / `.shadow-soft-lg`（`.dark` 下有替换）。改主题只动 styles.css + 点名硬编码类，勿在组件里写 hex/Tailwind 内置色。
