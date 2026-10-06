# AGENTS.md

## 深度参考手册（docs/ARC/）
- 接到开发任务先读 **`docs/ARC/README.md`**：代码地图（任务→文件）、6 类常见任务菜谱（加工具/加文案/加桌宠状态/加设置项/加协议帧/改主题）、验证命令速查、硬红线。配套两份专题：`architecture-2026-10-06.md`（当前平台架构与数据面）、`frontend-style-spec.md`（设计令牌/组件/动效规范）。

## QMuse 平台版（迁移副本，已停止维护）
- `qmuse/qmuse-app/` 是本应用的 **QMuse 平台迁移版**（数据后端 Supabase→QMuse 云服务、Edge Function→云函数、SSE→整包+前端模拟流式、应用内邮箱登录→平台账号）。**自 2026-10-06 起停止维护：新改动不再同步过去，回归测试与构建校验也只需跑主仓库**；目录保留作历史归档，勿删。
- （存档）改 QMuse 版时遵守 `qmuse/qmuse-app/AGENTS.md` 与其内置 qmuse-cloud 技能契约；改完跑 `npm run check`、`npm run build` 与产物校验器（见 MIGRATION.md 第五节）。

## 文档与文案同步（改一处要连带改的地方）
- **README 双语**：根 `README.md` 是**英文版**（GitHub 仓库首页默认展示），`docs/README.zh-CN.md` 是**中文版**。两份顶部有互链语言切换行（`**English** | [简体中文](docs/README.zh-CN.md)` / `[English](../README.md) | **简体中文**`），且**正文前部**各有一个 `## Documentation` / `## 文档` 段互列中英 README + 详细文档入口（中文版排在前）。改功能一览、技术栈、目录、快速开始、致谢等任一章节，**两份都要同步改**，别只动一份；章节顺序也保持一致。图片/链接用各自所在目录的相对路径：根 README 写 `docs/寻宝鼠.png`、`docs/badges/*.svg`、`src/assets/pet/*`；中文版在 `docs/` 下，写 `寻宝鼠.png`、`badges/*.svg`、`../src/assets/pet/*`。代码块的命令字面量保持原样，只翻译注释。
- **关于页跟 README**：`src/routes/about.tsx` 是 README 的应用内镜像（核心亮点 / seqout-mcp 后端 / 自托管 / 技术栈 / 致谢）。README 改了这几节，关于页对应改，文案落在 `src/i18n/locales/{zh,en}.ts` 的 `about.*` 键，**中英两份字典同时加**（zh 是键的权威来源，缺 en 键会静默回退中文）。seqout-mcp 段与致谢图标行（`src/assets/badges/`，拷贝自 `docs/badges/`）易漏。
- **i18n 键约定**：新增界面文案一律走 `t("key")`，不写死在组件里；错误提示若在 service 层（非组件）用 `translate(readLang(), "key")`。改完跑 `npx tsc --noEmit`（键名打错会报错）+ `npx vite build`，并核对 zh/en 键数一致。

## 微信小程序版（Taro + React，首轮已落地）
- `weixin/` 是**微信小程序版**工作区，已落地首轮可编译工程（Taro 4.3 + React 18）。可行性调研见 `weixin/README.md`，文件级映射与踩坑见 `weixin/MIGRATION.md`，开发硬约束见 `weixin/AGENTS.md`。
- 关键结论：小程序**无 DOM**，`src/components/**`、`src/routes/**`、`src/components/ui/`（46 个 shadcn + 26 个 `@radix-ui/*`）**不能复用**；`src/i18n/`、`src/lib/linkify.ts` 等纯逻辑层已原样搬入（i18n 仅 3 个平台函数有差异）。
- ⚠️ **尚未在微信开发者工具/真机验证**：`onChunkReceived` 流式是最关键未验证项（见 `weixin/README.md` 第九节）。扩展前先实测。

## 依赖
- `@supabase/supabase-js`：云服务客户端（Auth / Database），仅通过 `src/supabase/client.ts` 生成的单例使用。
- 无其他第三方运行时依赖；Markdown 渲染为 `react-markdown` + GFM + rehype-highlight（`src/components/chat/Markdown.tsx`，memo 化防止流式时重复解析），动效全部 CSS keyframes（遵守禁 framer-motion 约束）。

## 架构
- 单页聊天应用：`src/routes/index.tsx` 组合会话栏、对话区、登录弹窗；子组件在 `src/components/chat/`、`src/components/auth/`。
- 消息尾部「继续寻宝」建议：模型按 SYSTEM_PROMPT 第 8 条约定在正文末尾输出 `:::followup ... :::` 围栏，前端 `SuggestionBlock.tsx` 的 `extractFollowups()` 解析（剥列表符号/加粗），正文渲染剥离后的 main，建议渲染成默认折叠卡片，点击条目直接 handleSend。旧消息无该块时正常显示纯正文。
- 复制/重试：ChatMessage 悬停浮现按钮组（用户气泡=复制提问；助手=复制正文+重新挖一次）；handleRegenerate 截断到该助手消息前、取其前最近一条用户提问重发。
- 后端逻辑集中在 Edge Function `functions/seqout-chat`（verify_jwt=false）：
  - GET → 透传 LLM `/models` 目录（默认模型 **qwen3.8-flash**，非 qwen3.6-plus）。
  - POST → LLM tool-calling 循环（最多 40 轮，触顶提示文案在 round===39），直接 fetch `https://seqout.org/api`（纯 GET、无鉴权），把 seqout-mcp 的 26 个只读工具以 OpenAI function schema 声明式移植进函数内，不在前端调用、不运行 Python MCP 进程。SYSTEM_PROMPT 双语文本外置 `prompts/system-{zh,en}.md`（唯一可编辑来源），改后跑 `npm run sync:prompts` 生成 `prompts.generated.ts`（tests/prompts-sync.test.ts 守漂移，详见 docs/ARC/README.md §2.6）。
  - 下行 SSE 自定义协议：`{"delta"}` / `{"event":"tool"}` / `{"event":"cards"}` / `{"event":"end"}` / `{"error"}` / `[DONE]`，每 10s `: ping` 心跳防缓冲；前端 `src/services/seqoutChat.ts` 解析。
  - 自托管：handler 已导出且去 Deno 化（envGet 同时读 Deno/Node 环境），`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `SEQOUT_BASE_URL` 可覆盖；`pnpm run server`（`server/local.mjs`，Node≥22.6 原生跑 .ts + CORS）本地起服务，前端配 `VITE_CHAT_API` 直连即脱离 Meoo 平台；不配则走平台 Edge Function + `MEOO_PROJECT_API_KEY*` secrets，行为不变。
- 数据：`profiles` / `chat_sessions` / `chat_messages`（cards、tool_logs 为 JSONB），RLS 全部 `auth.uid()` 本人隔离；未登录时消息仅存 localStorage（key `seqout-local-session`，每条会话记 `ts` 最后活跃时间，最多留 50 条、超过 7 天未活跃的会话读取时过滤；游客策略经侧栏 `storageNote` + 顶栏「临时试用」标题提示）。
- 排行榜：`user_stats`（登录用户，auth.uid 本人 upsert）/ `guest_stats`（访客按匿名 device_id upsert，localStorage key `seqout-device-id`），两表 RLS 公开可读、仅本人可写；每表含累计列（treasures/digs/chats）+ 周列（week_treasures/week_digs/week_chats + week_base 周一日期，写入方 RPC 内自动跨周归零）+ display_name 自定义昵称。累加走 SECURITY INVOKER RPC `bump_user_stats` / `bump_guest_stats`（前端 `src/services/statsStore.ts` 在 handleSend 结束后 fire-and-forget 调用，treasures=出土卡片数、digs=工具回合数、chats=每轮+1）。面板 `src/components/chat/Leaderboard.tsx`（右滑抽屉 z-50，Tab 切登录榜/访客榜 + 本周/累计时间维度切换 + 行内铅笔/虚线按钮打开昵称浮层，前 3 名奖牌，当前身份——登录经 ownUserId、访客经设备指纹——高亮「我」并可改名），入口为顶栏 Trophy 图标。
- 认证：邮箱验证码 + 密码（signUp → verifyOtp type:'signup' → getUser → upsert profiles），忘记密码走 resetPasswordForEmail + `/reset-password` recovery 页。
- 桌宠「寻宝鼠」：`src/components/pet/TreasureMouse.tsx` 状态机（idle/digging/reveal/stow/miss/poke/spin/walk/look/celebrate/peek/sleep）+ pointer 拖拽，造型为本地抠图（`src/assets/pet/`，Vite 打包；用户提供的 2048² PNG 原图已压成 512px webp，文件名即行为，如 `mouse-shovel`=挖土、`mouse-night`=夜探矿洞（暗色主题 digging 专用，经 MutationObserver 跟随 `<html>.dark`）、`mouse-sleep`=45s 无互动入睡，互动即醒）；`src/routes/index.tsx` 在 handleSend 的 onTool/onCards/onEnd/onError 里经 `makePetEvent()`（自增 seq 去重）转发事件；偏好/宝藏计数/成就存 localStorage（`src/services/petStore.ts`）。z-30，低于抽屉/dialog z-50；设置面板最上层（z-[60]，顶栏入口经 createPortal 挂 body + 触发按钮 rect 定位——header 的 backdrop-blur 是 z-auto 层叠上下文，留在 header 内会被主内容/抽屉压住）。设置双入口（hover 宠物浮现的齿轮 + 顶栏 PawPrint 按钮）共用 `src/components/pet/PetSettingsPanel.tsx`（行式设计，参考 docs/2026-10-06_14.04.23.png：标题+关闭 / 体型步进 ±12px 显示百分比（72–240 连续值，`seqout-pet-size`）/ 从桌面收起（=quiet 开关，`seqout-pet-quiet`）/ 闲置时自己活动（`seqout-pet-idle-alive`，关闭则闲置剧场整体停演）/ 一直存在（`seqout-pet-always`，关闭则闲置 15s 自动隐藏）/ 位置复位（petBus `resetPos` 通道回默认右下角）/ 找回阿寻），面板 ⇆ 桌宠双向同步走 `src/lib/petBus.ts`（settingsChanged/recall/quiet/resetPos 迷你 pub-sub；桌宠 toggleQuiet 后也会 emit 供面板回读）。
- 成就系统：累计挖宝 10/50/100 三档（ACHIEVEMENTS 常量），跨档一次性 celebrate 小剧场（星尘爆发+光环+横幅），领取记录存 localStorage `seqout-pet-achievements`（幂等去重）；存量高计数用户初始化时经 `earnedAchievements()` 直接补徽章、不播动画。cards 与 done 事件同轮可能都触发出货，用 `countedRef` 防止重复累加计数。
- 主题：亮色 `:root` + 夜探矿洞 `.dark` 双套 token（`src/styles.css`），组件一律消费 theme utility（`bg-card` 等），禁止再写 `bg-white` 类硬编码。切换由顶栏/折叠边条按钮触发，偏好写 localStorage `seqout-theme`；`index.html` 内联 bootstrap 脚本在 React 加载前挂 `.dark` 类防闪白（同时支持 `?theme=dark` URL 参数——这是沙箱截图取证通道，因为截图工具的 DOM 探针不支持 oklch，无法替我们点按钮）。暗色下 `--pet-amber-deep` 反转为亮金文字档，桌宠周边（土堆/气泡/尘埃/网格）均有 `.dark` 覆盖段。
- 自托管离线模式：未配置 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 时 `client.ts` 创建 Proxy 桩客户端（导出 `isOfflineMode`）——auth 固定未登录、任意调用链 await 得 `{data:null, error:null}`；应用以游客 + localStorage 运行，**但登录不缺席**：自托管账号体系由 `server/account-api.mjs` 挂在对话服务同端口（`/auth/*` `/history` `/leaderboard` `/stats/*`），scrypt 口令哈希 + Bearer token，数据落盘 `DATA_DIR`（默认 `server/data`，容器内 `/app/data` 命名卷，与统计同卷）。前端 `src/services/localAuth.ts` + `AuthDialog` 离线分支；聊天记录整快照防抖同步（登录时合并服务端与本地方，同 id 取较新），排行榜登录时把游客期本机累计 `mergeLocalStatsToAccount()` 并入账号行后清零本地镜像；`Leaderboard` 默认页签按 `ownUserId` 有无选榜。环境变量唯一来源 `server/.env`（vite `envDir` 指向 `server/`，Makefile 起容器带 `--env-file server/.env`；`.dockerignore` 排除该文件，容器构建只认 Dockerfile 注入的构建期变量）。dev 默认 `VITE_CHAT_API=http://localhost:<CHAT_API_PORT>` 直连本地对话服务；改成 `/chat-api` 则走 `vite.config.ts` `server.proxy` 同源代理（`CHAT_API_PROXY_TARGET` 可覆盖目标），单端口且局域网可用。⚠️ local.mjs 的 CORS 必须允许 `PUT`（历史快照同步）与 `X-Stats-Actor` 头，否则前端推送静默失败。

## 回归测试（改平台后必须通过）
- **命令**：根目录 `npm test`（离线，用 fixtures，秒级）；`npm run test:live`（额外打真实 seqout API 校验，需联网）。（QMuse 版已停止维护，不再要求其测试。）
- **触发条件**：任何改动 `functions/seqout-chat/index.ts` 里的 **GSE→研究编号解析**（`resolveStudy` / `studyCandidates` / `hasRuns` / `describeSeqoutError`）后，**必须跑测试，全绿才可提交/部署**。
- **测试位置**：主仓库 `functions/seqout-chat/tests/resolveStudy.test.ts`（fixtures 为真实 seqout 响应，gzip 存于 `tests/fixtures/`）。
- **黄金用例（期望值来自 NCBI/ENA 人工核实，勿随意修改）**：

  | GSE | 正确研究号 | runs | 关键约束 |
  |---|---|---|---|
  | **GSE117176** | **PRJNA481344** | 5 | `SRR7526393..97` ↔ `GSM3272966..70`（lnATM/obATM/M0/M1/M2_BMDM）。**绝不可解析成 `SRP349691` / `PRJNA786951`** —— 那是 `neighbors[207]` 里的**另一个项目**（小鼠肝巨噬细胞），曾导致整条链路报"空矿" |
  | GSE151530 | PRJNA636285 | 0 | ENA 核实上游确无公开 raw（GEO-only 加工矩阵），返回 0 run 是正确结果 |
  | GSE62944 | PRJNA266377 | 0 | 同上；其 `overall_design` 里嵌了带 SRP 的 URL，**不得**被吞成假编号 `SRP33` |

- **不变量（改解析逻辑时守住这几条，否则测试会红）**：
  1. 只读 `relation[].@target`（`@type` 为 BioProject/SRA）、`alias`、`external_id` 三个权威字段；**禁止**递归整棵 JSON、**禁止**读 `neighbors` / 自由文本（`overall_design`/`abstract`）。
  2. `alias` / `external_id` 同时支持 字符串/数组/对象 三种形态。
  3. 候选 `PRJ` 优先、`SRP` 兜底，并逐个 `hasRuns` 验证；全为 0 时如实返回、不抛异常、不回退到任意 SRP。
  4. 404 要区分"镜像库未同步"与"项目无数据"。

## 踩坑记录
- ❌ **`.bg-grid::before` 整面蒙板把普通内容洗成幽灵（2026-10-06 定位并修复）**：视觉重设计为调淡点阵底纹，加了 `inset:0` + `background:var(--background)` + `opacity:0.955` 的 pointer-events-none 蒙板。它能被 hit-test 忽略（elementFromPoint 完全正常），但绘制层压在所有**不建堆叠上下文**的子内容之上——侧栏图标、普通文本全部被罩成 95.5% 背景色（连强制 `#FF0000` 描边都只剩淡粉 ghosts）。有 backdrop-filter/transform 的元素（顶栏、卡片）不受影响，所以极难排查。**修法：底纹要淡就直接把透明度画进底纹本身**（`rgb(120 113 108 / 0.045)` 画点），禁用整面蒙板手法。教训：排查"颜色不对"先做像素级取证（元素截图+灰度 min/max），别信 computed style。
- ⚠️ **GEO-only 项目的「无数据」被 seqout 表达成 404（2026-10-06 定位并修复）**：`/project/{PRJ}/metadata/download` 对无实验项目返回 404 "No experiments found"，`/runs/download` 则返回 200 空表头——同一事实两种表达。曾导致 `get_metadata_csv` 全灭并被统计为工具失败。修法：两个下载类工具把这类 404/空表统一转为 `emptyStudyResult`（success + `data.empty: true` + 中文 note），统计单列 `empties`（「空矿」）与真错误分开；`resolve_prj` 前置 `/^PRJ[A-Z]+\d+$/` 校验，挡住 seqout 的 422 原始英文报文。QMuse 版无统计子系统，empties 为其 no-op 平价副本。
- ❌ **GSE→SRA 解析的 neighbors 污染（2026-10-05 定位并修复）**：`resolveStudy` 曾递归搜索整棵项目详情 JSON，因 JSON 键序 `neighbors` 在 `relation` 之前，会先命中 `neighbors[].accession`（300 条相似数据集里**别的项目**的真实编号）就返回。实测 GSE117176 被解析成 `SRP349691`（真身 `PRJNA786951`，另一个项目）→ `runs/download` 报空矿或指向错误项目；正确映射 `PRJNA481344` 在 `relation` 里从未被读到。修法见 `docs/gse-resolution-fix.md`，回归测试见上节。**教训：解析权威映射只读专用字段，绝不整树递归。**
- ❌ Edge Function preflight TS2698（`Spread types may only be created from object types`）：Supabase `Json` 联合类型不能直接 spread → 先显式收窄为 `Record<string, Json>` 再展开。
- ❌ web-fetch / curl raw.githubusercontent 超时失败 → 用 `api.github.com/repos/.../contents/<path>` + base64 解码取证 GitHub 文件。
- ⚠️ 当前项目 `client.ts` 导出 `projectUrlId`，所有裸 fetch Edge Function 必须携带 `OneDay-App-Id` 头。
- ⚠️ seqout search 响应可能超大，送 LLM 前经 `trimForLLM` 截断（上限 100000 字符）；卡片数据单独经 `cards` 事件给前端渲染、不瘦身。
- ❌ Tailwind v4 默认刻度没有 `h-4.5` → 自定义尺寸用任意值语法 `h-[18px]`。
- ❌ index.html 旧版有 iframe postMessage 主题监听 + html.light 强制样式，与新主题体系冲突 → 整体重写为极简防闪白 bootstrap。
- ⚠️ `meoo-cli read-browser-screenshot` 的预览页探针会因 "unsupported color function oklch" 失败并降级到独立沙箱浏览器（localStorage 不共享）——降级截图只能验静默渲染，验交互态要用 `?theme=dark` 之类 URL 参数直入。
- 🎨 UI 主题：现代学术轻量亮色风（Perplexity/Claude 质感）+ 夜探矿洞暗色套。亮色：background=gray-50、card=white、primary/helix=teal-600、琥珀金 accent；暗色：深蓝灰底、teal-400 提亮主色、亮金 accent。统一轻投影 class `.shadow-soft` / `.shadow-soft-lg`（`.dark` 下有替换）。改主题只动 styles.css + 点名硬编码类，勿在组件里写 hex/Tailwind 内置色。
