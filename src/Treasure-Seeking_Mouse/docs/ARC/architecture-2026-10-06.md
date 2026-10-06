# GEO 寻宝鼠 · 平台架构文档

> 日期：2026-10-06
> 对象：`src/Treasure-Seeking_Mouse/`（Web 前端 + 自托管对话服务）
> 形态：单页应用（React 19 + Vite 7）+ Node 对话服务（OpenAI 兼容 LLM 网关 + seqout.org 公共组学 API），Docker Compose 双容器部署
> 姊妹篇：启动与功能基线见 `platform-kickstart.md`；样式规范见 `frontend-style-spec.md`。

## 一、总体拓扑

```
browser ──→ web(nginx:80) ──┬─ /           → 前端静态产物（构建期 VITE_CHAT_API=/chat-api 固化）
                            └─ /chat-api/  → chat:8787 (server/local.mjs)
                                              ├─ Edge Function handler（functions/seqout-chat/index.ts）
                                              │    ├─ POST /chat-api  → LLM /chat/completions（SSE，tool-calling 循环）
                                              │    ├─ GET  /chat-api/models → LLM /models 目录透传
                                              │    └─ GET  /chat-api/stats  → 内存用量聚合快照
                                              └─ Account API（server/account-api.mjs，2026-10-06 新增）
                                                   ├─ /auth/*        注册 / 登录 / me（scrypt + Bearer token）
                                                   ├─ /history       聊天历史整快照（GET/PUT）
                                                   ├─ /leaderboard   双榜聚合（登录榜 + 访客榜）
                                                   └─ /stats/*       bump / merge / nickname
                                                                    ↓
                                              seqout.org/api（26 个只读工具，纯 GET 无鉴权）
                                              LLM_BASE_URL（OpenAI 兼容：DeepSeek / vLLM / 任意网关）
```

职责分层：**web 只 serving 静态资源 + 同源反代**；**chat 是唯一有密钥的服务**（LLM_API_KEY 只存在 server/.env，前端零密钥）；**seqout.org 是公共只读数据面**，被 tool-calling 循环直接调用。

## 二、对话链路（核心数据流）

1. 前端 `src/services/seqoutChat.ts` POST SSE 到 `chatEndpoint()`，自定义下行协议逐行解析：`{"delta"}` / `{"event":"tool"}` / `{"event":"cards"}` / `{"event":"polariseq"}` / `{"event":"end"}` / `{"error"}` / `[DONE]`，10s `: ping` 心跳防代理缓冲。
2. 服务端 `index.ts` 收到请求后进入 **tool-calling 循环**（最多 40 轮）：
   - 26 个 seqout 工具以 OpenAI function schema 声明式内置（`TOOL_DEFS`），不在前端调用、不运行 Python MCP 进程；
   - 流式聚合 `tool_calls`（按 `index` 累加分片）→ `executeTool()` 直打 seqout.org → 结果 `trimForLLM`（10 万字符封顶）作为 `role:"tool"` 回传；错误也包装成 `{success:false,error}` 喂回模型自愈；
   - 数据集卡片经 `extractCards` 走独立 `cards` 事件不瘦身；文献证据链走 NCBI E-utilities + Europe PMC 降级 + 进程内 TTL 缓存，与检索工具解耦。
3. 护栏：历史截断 `slice(-16)`、seqout 请求 25s 超时、单工具 try/catch、40 轮触顶可读提示、客户端断连 `AbortController` 中止（`local.mjs` `res.on('close')`）。

**GSE→研究编号解析**（`resolveStudy`/`studyCandidates`/`hasRuns`）是数据正确性的命门：只读 relation/alias/external_id 三个权威字段、PRJ 优先 SRP 兜底、逐个 hasRuns 验证、404 区分"镜像未同步"与"项目无数据"。黄金回归用例见 `functions/seqout-chat/tests/resolveStudy.test.ts`（GSE117176→PRJNA481344 绝不可解析成 SRP349691 等），改动解析逻辑必须跑 `npm test` + `npm run test:live`。

## 三、数据面与持久化

| 数据 | 存储 | 位置 |
|---|---|---|
| LLM 密钥 / 运行时配置 | `server/.env`（唯一来源，vite envDir 同指此处） | 容器 `--env-file` 注入 |
| 账号（邮箱/scrypt 哈希/token/统计） | `DATA_DIR/accounts.json` | `server/account-api.mjs`，默认 `server/data`、容器 `/app/data` 命名卷 |
| 访客设备统计 | `DATA_DIR/guests.json` | 同上 |
| 每用户聊天历史快照 | `DATA_DIR/history/<urlencoded-email>.json` | 同上，tmp+rename 原子落盘、400ms 防抖 |
| 用量统计（对话/token/工具/人数去重） | `DATA_DIR/stats.json` | `local.mjs` 每 15s 有变化才写盘，启动恢复 |
| 游客会话 / 游客统计 / 宠物偏好 / 主题 | localStorage（键前缀 `seqout-*`） | 前端 `chatStore`/`statsStore`/`petStore` |
| 云端模式（可选，配 Supabase 时启用） | `profiles`/`chat_sessions`/`chat_messages`/`user_stats`/`guest_stats`，RLS 全 `auth.uid()` 本人隔离 | 未配置则 `isOfflineMode` 降级 |

**双模式账号体系**：配 `VITE_SUPABASE_URL/ANON_KEY` 走 Supabase 邮箱验证码 + 密码；不配则走自托管 Account API（注册即登录、无邮箱验证，熟人场景定位）。前端以 `effUser = supabaseUser ?? localUser` 统一驱动"登录/游客"分支（`src/routes/index.tsx`）。

**登录后的同步语义**（自托管路径）：
- 聊天记录：localStorage 仍是消息状态唯一来源，登录后整快照 800ms 防抖推送 `PUT /history`；登录时拉服务端历史与本地方按 id 合并（同 id 取较新）。
- 排行榜：游客期本机累计成绩在登录时经 `POST /stats/merge` 并入账号行，随后清零本地镜像防重复合并；此后 bump 带 token 记账号行、不带记设备访客行；服务端维护周列（week_base 跨周归零，语义与云端 RPC 一致）。

## 四、前端架构（src/）

- **路由**：TanStack Router 文件式路由——`/`（对话主页）+ `/about`（README 镜像页）+ `/reset-password`（云端恢复页）。`src/router.tsx` 汇总。
- **页面编排** `src/routes/index.tsx`：组合侧栏、对话区、登录弹窗、排行榜、统计、桌宠；流式回调里用 `makePetEvent()`（自增 seq 去重）把 onTool/onCards/onEnd/onError 转发给桌宠。
- **服务层**（`src/services/`）：`seqoutChat.ts`（SSE 封装 + 统计拉取）、`localAuth.ts`（自托管账号/历史/榜单 API）、`chatStore.ts`（Supabase 会话存取）、`statsStore.ts`（双模式统计，离线回退本机镜像）、`petStore.ts`（宠物偏好）。
- **跨层通信**：迷你 pub/sub 三件套——`petBus`（设置/召回/复位/输入联动）、`hintBus`（编号发现提示⇆桌宠台词）、`evidenceBus`。路由层与深组件不直传 props。
- **i18n**：`src/i18n/locales/{zh,en}.ts` 扁平键字典（zh 权威，键名 typo 由 `tsc` 的 MessageKey 模板类型兜住）；新增文案两字典同步。
- **视觉系统**：见 `frontend-style-spec.md`（token 亮暗双套、CSS keyframes only、桌宠 12 状态机、行式设置面板）。

## 五、桌宠与游戏化子系统

- `src/components/pet/TreasureMouse.tsx`：12 状态机（idle/digging/reveal/stow/miss/poke/spin/walk/look/celebrate/peek/sleep），10 个行为造型 webp + 暗色专属提灯形象（MutationObserver 跟随 `.dark`），pointer 拖拽 + 戳一戳连击彩蛋。
- 闲置剧场（冒泡轮播/散步/张望/探头/45s 入睡）由 `seqout-pet-idle-alive` 总开关控制；`seqout-pet-always` 关闭时闲置 15s 自动隐藏；45s 无互动入睡，互动即醒。
- 设置面板 `PetSettingsPanel.tsx` 双入口（hover 齿轮 + 顶栏 🐾）共用，行式设计，面板⇆桌宠经 petBus 双向同步。
- 成就三档（10/50/100 宝藏）跨档一次性庆祝小剧场，领取记录 localStorage 幂等。

## 六、部署与运维

- **Docker Compose 双容器**（`deploy/docker-compose.yml`）：`web`（nginx 静态 + 反代，构建期 `VITE_CHAT_API=/chat-api` 固化）+ `chat`（Node 24 原生跑 Edge Function 的 TS handler，零依赖）。`make docker-start` 一条命令：LLM 密钥预检 → build → up。
- **nginx 流式要点**：`proxy_buffering off` + `proxy_read_timeout 600s` + `proxy_http_version 1.1` + `Connection ""`，`location = /chat-api` 精确匹配规避 301 丢端口；`X-Accel-Buffering: no`。
- **CORS**：`local.mjs` 允许 `GET,POST,PUT,DELETE,OPTIONS` 与 `X-Stats-Actor` 头（历史快照 PUT 与统计上报必需）。
- **持久化卷**：`/app/data` 单卷承载统计 + 账号 + 历史 + 访客数据，`compose down` 不丢。
- **配置面**：除 `server/.env` 外无第二配置源；`CHAT_API_PORT/HOST`、`DATA_DIR`、`STATS_FILE`、`SEQOUT_BASE_URL`、`NCBI_API_KEY`、`CHAT_SHARED_SECRET`（可选共享密钥防 casual 滥用）均可覆盖。

## 七、近期演进（2026-10-05 审计之后）

| 日期 | 变更 | 要点 |
|---|---|---|
| 10-06 | 自托管账号体系 | Account API + localAuth + AuthDialog 离线分支；登录合并历史、游客成绩并入账号榜；顶栏 guest 徽标移除，登录入口文案改为「登录 / 注册」+「不登录，先试试」 |
| 10-06 | 设置面板行式重做 | 体型步进百分比（72–240 连续值）、从桌面收起/闲置活动开关、位置复位通道（petBus resetPos） |
| 10-06 | 工具空矿口径 | GEO-only 项目 metadata 404 / 空表头统一转成功空态（`data.empty`），统计新增 `empties` 与真错误分列；`resolve_prj` 前置 PRJ 格式校验挡 422 原始报文 |
| 10-06 | `.bg-grid` 对比度修复 | 撤掉 95.5% 整面蒙板（会把无堆叠上下文内容洗成背景色），底纹改为直接绘制 4.5% 透明点阵 |
| 10-06 | 关于页同步 README | 新增「阿寻能挖的数据库」七库一节、页脚版本号 |
| 10-06 | 样式规范成文 | `docs/ARC/frontend-style-spec.md`，token/组件/动效/硬约束全收录 |

## 八、已知取舍与边界

- **安全定位**：自托管面向熟人场景——scrypt + token 无速率限制；`CHAT_SHARED_SECRET` 只挡爬虫级滥用。公网开放部署前应叠加反代限流（审计报告 §三-F/E 的宿主机 nginx 模板可直接用）。
- **Meoo/Deno 平台**：Edge Function 保持平台可移植（`envGet` 双读 Deno/Node 环境），但文件系统类能力（统计/账号持久化）仅自托管 Node 路径可用，平台实例重启归零。
- **纯游客模式**：消息仅存 localStorage（50 条 / 7 天滚动），跨设备不可用——这是产品取舍而非缺陷，登录即解。
- **QMuse 迁移副本**（`qmuse/qmuse-app/`）已停止维护（2026-10-06 起），保留作历史归档，新改动不再同步。
