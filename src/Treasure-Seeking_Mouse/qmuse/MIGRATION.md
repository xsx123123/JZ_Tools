# GEO寻宝鼠 · QMuse 版迁移规范与记录

本目录是把主仓库（`../`，Supabase/Meoo 平台版「GEO寻宝鼠」）迁移到 **QMuse 平台**（React 模板）的独立副本。主仓库会持续更新，本文档既是**迁移规范**（以后如何把主仓库的新改动搬过来），也是**迁移记录**（每次同步做了什么）。

- 应用目录：`qmuse/qmuse-app/`（基于 `QMuse_React_Template.zip` 解压模板，可独立 `npm install && npm run check && npm run build`）
- 迁移记录见文末「同步记录」。

---

## 一、平台差异总览

| 维度 | 主仓库（Supabase 版） | QMuse 版 |
|---|---|---|
| 数据后端 | Supabase（Postgres + RLS + RPC） | QMuse 云服务（TablesDB，行权限=平台默认：READ/SUBMIT ALL，EDIT/DELETE CREATOR） |
| 认证 | 应用内邮箱验证码 + 密码 | 平台账号（custom-token 自动建立会话；未登录=匿名会话=游客） |
| 对话后端 | Edge Function（Deno，SSE 流式） | 云函数 `seqout-chat`（node-22，整包 JSON，前端模拟流式） |
| 统计累加 | SECURITY INVOKER RPC `bump_*_stats` | 登录用户前端 RMW；游客/排行榜走云函数 action |
| 构建 | Vite + `@tanstack/router-plugin` | `@qmuse/vite-config`（已内置 router/react/tailwind/别名，**勿重复注册插件**） |
| 检查 | `tsc --noEmit` | `npm run check` = `tsr generate && oxlint src && tsc --noEmit` |

## 二、目录与文件映射规范

### 1. 原样复制（平台无关，主仓库更新后直接同步）

| 主仓库 | QMuse 版 | 说明 |
|---|---|---|
| `src/components/chat/*`（9 个文件） | 同路径 | 纯 UI，只依赖 `@/services/*` 与 `@/components/ui/*` |
| `src/components/pet/TreasureMouse.tsx` | 同路径 | 桌宠状态机 |
| `src/components/BrandMark.tsx` | 同路径 | |
| `src/lib/reveal-engine.ts` | 同路径 | 滚动渐入引擎 |
| `src/services/petStore.ts` | 同路径 | 纯 localStorage |
| `src/assets/` | 同路径 | 桌宠 PNG、about/intro.png |
| `src/styles.css` | 同路径（但有合并补充，见下） | |
| `index.html` 的防闪白 `<style>`/`<script>` | 合入模板 index.html | |
| `src/routes/about.tsx` | 同路径 | |

### 2. 改写迁移（平台适配层，**只改这几处**，见第三节规则）

| 主仓库 | QMuse 版 | 适配点 |
|---|---|---|
| `src/supabase/client.ts` | `src/services/appwrite.ts` | Runtime SDK 基线 + `executeQmuseFunction` + `getQmusePlatformUserId`；**只有此文件可 import `appwrite` SDK** |
| （新增） | `src/services/authSession.ts` | `AuthUser`/`getAuthUser()`/`subscribeAuth()`（轮询平台登录态） |
| `src/services/chatStore.ts` | 同路径 | 签名不变（`listSessions` 多一个 `userId` 参数）；Supabase 查询 → `listQmuseRows` 翻页 |
| `src/services/statsStore.ts` | 同路径 | 导出形状不变；RPC → 前端 RMW + 云函数 action |
| `src/services/seqoutChat.ts` | 同路径 | 导出签名不变；fetch+SSE → `executeQmuseFunction` + 本地模拟流式 |
| `src/components/auth/AuthDialog.tsx` | 同路径 | 平台不支持应用内邮箱密码登录 → 身份说明 + 昵称设置 |
| `src/routes/index.tsx` | 同路径 | supabase auth → `subscribeAuth`；`user.email` → `user.label`；删除 handleLogout |
| `functions/seqout-chat/index.ts` | `functions/seqout-chat/src/main.js` | Deno TS → node-22 ESM；SSE → action 路由整包返回；统计 action 并入（见记录 R1） |
| （不迁移） | — | `server/local.mjs`、`server/.env*`、`src/routes/reset-password.tsx`、自托管离线模式、`VITE_CHAT_API` |

### 3. QMuse 模板自有（勿动）

`src/router.tsx`、`src/routes/__root.tsx`、`src/routeTree.gen.ts`（生成物）、`src/config/router.json`、`.qmuse/project.json`、`vite.config.ts`（保持 `defineConfig()` 空配置）、`src/components/ui/*`（模板 shadcn 全集，比主仓库多，保留模板的）。

## 三、适配规则（改写字段的强制约定）

同步主仓库新功能时，按以下规则落到平台适配层：

1. **数据表**：在 `src/config/.appwrite_schema.json` 声明。column 类型只用 `string`(必带 size)/`integer`/`double`/`boolean`/`datetime`；JSONB → `string` 大 size 列存 JSON 字符串；**append-only**：已 READY 的 column/index 不可改，只允许新增 `required:false` 且无 `default` 的列；需破坏式变更时走 `qmuse-cli cloud schema request-table-replacement`。
2. **查询**：一律 `src/services/appwrite.ts` 的 facade（`listQmuseRows/getQmuseRow/createQmuseRow/updateQmuseRow/deleteQmuseRow`）。`limit` 1..20，翻页用上一页末行 `$id` 作 `cursor`；facade 固定 `$createdAt` 降序，**不支持自定义排序**——升序需求（如消息历史）= 翻页拉全后内存反转；排行榜类排序必须放云函数服务端做。
3. **时间**：行创建/修改时间读 `$createdAt`/`$updatedAt`；业务时间（如 `updated_at`/`week_base`）仍是显式列。
4. **鉴权**：登录态只认 `getQmusePlatformUserId()`（`__TERN__.user.clientUser.userId`）非空；禁止在应用内做邮箱/密码/OAuth 登录链路。昵称等业务资料写 `user_stats.display_name`/`guest_stats.display_name`。
5. **密钥**：LLM 等第三方密钥只进云函数 `process.env.XXX` 字面量直读（禁别名/解构/动态键），经 `qmuse-cli cloud set-secret "LLM_API_KEY"` 注入；浏览器代码零密钥。
6. **流式**：云函数不支持 SSE。`requestSeqoutChat` 保持原 `StreamHandlers` 签名，内部整包返回后本地分片喂 `onDelta`；`onTool` 的 running/done 瞬时连发。新增"流式"功能时沿用此模式。
7. **命名**：对外/用户可见文案仍称「QMuse 云服务」；源码标识符、依赖名、API 路径用契约原始名（appwrite 等），不为改名而改名。
8. **校验门禁**：任何同步完成后必须通过：`npm run check`（0 error）、`npm run build`、`node .agents/skills/qmuse-cloud/scripts/validate_appwrite_artifacts.mjs .`。

## 四、已知行为差异（相对主仓库）

- 回复不是逐 token 到达：云函数整包返回，前端按 ~8 字符/12ms 模拟打字；「停止」按钮只中断本地打字，云函数仍在跑。
- 工具执行过程（onTool 的 running→done 间隔）是瞬时回放，非真实耗时。
- 应用内无退出登录（平台账号管理）；侧栏「登录/注册」按钮打开身份说明弹窗。
- 未登录游客无法使用应用内邮箱注册；排行榜/云同步需平台账号。
- 消息历史按 `$createdAt` 降序翻页拉取（上限 10 页=200 条）后内存反转，与原 `order by created_at asc limit 200` 语义等价。
- 40 轮触顶提示在耗尽后追加于文末（原版为第 40 轮 SSE delta），文案相同。
- 本地 `npm run dev` 预览因无 `window.__MUSE__` 运行时无法连接云服务（模板固有约束）；功能验证要在 `qmuse import` 后的预览 URL 做。

## 五、上线步骤（每轮同步后）

```bash
cd qmuse/qmuse-app
npm run check && npm run build
node .agents/skills/qmuse-cloud/scripts/validate_appwrite_artifacts.mjs .
qmuse import .          # 首次或更新云资源；密钥：qmuse-cli cloud set-secret "LLM_API_KEY"
```

---

## 同步记录

### R1 — 2026-10-04 首次全量迁移（源：主仓库 commit `a586184`）

- 按上述规范完成三大切片：云资源声明 + 数据层（`appwrite.ts`/`authSession.ts`/`chatStore.ts`/`statsStore.ts`）、云函数 + 对话服务、UI 层（路由/组件/样式/资源）。
- 5 张表（profiles/chat_sessions/chat_messages/user_stats/guest_stats）+ 1 个云函数（`seqout-chat`，5 个 action：models/chat/leaderboard/bump_guest/set_guest_name）。
- 合并记录：初版设计为 seqout-chat + stats-board 两个函数；产物校验器要求 scopes 非空，而纯 LLM 代理函数没有任何诚实的 Appwrite scope，故按「同一游戏后端域、相同信任边界」合并为单函数 action 路由。
- 依赖：模板 `@qmuse/appwrite-runtime-sdk` 由 ^1.0.2 升至 ^1.2.0（基线含文件存储 helper 的硬性要求）；新增 `@fontsource-variable/noto-sans-sc`、`@fontsource/fraunces`、`@fontsource/jetbrains-mono`、`react-markdown`、`remark-gfm`、`rehype-highlight`。
- `src/types/global.d.ts` 按契约补 `__MUSE__.appwrite` 可选类型（5 行）。
- 验证：`npm run check` 0 error（1 条 warning 为 SRC 原样复制件既有）、`npm run build` 通过、产物校验器通过。
- 未执行（需平台环境）：`qmuse import .`、真实云资源联调、`qmuse-cli cloud set-secret "LLM_API_KEY"`。

### R2 — 2026-10-04 同步 v2.0 冲刺四特性 + 测试反馈修复（源：主仓库 commit `c8bac95`）

**同步内容（按 §二 映射规范）：**

- **v2.1 正文内嵌超链接**：
  - 原样复制：`src/lib/linkify.ts`、`src/lib/evidenceBus.ts`、`src/components/chat/IdLink.tsx`、更新的 `Markdown.tsx`/`ChatMessage.tsx`/`DatasetCard.tsx`/`EmptyState.tsx`、`styles.css`（.id-link 样式）。
  - 适配修正：Markdown.tsx 的 idlink 渲染器抽成大写开头组件 `IdLinkRenderer`（oxlint rules-of-hooks 不允许 hook 在小写开头的匿名函数里调用；主仓库同步修复）。
- **T2 PubMed 文献联动**：
  - 新增 `src/services/literature.ts`（改写迁移：Supabase Edge Function fetch → `executeQmuseFunction`，responseBody JSON 解析；前端 TTL 缓存 10/5 分钟不变）。
  - 云函数 `functions/seqout-chat/src/main.js` 新增 `literature` action（node-22 ESM 改写：NCBI esearch/esummary/efetch + Europe PMC 兜底 + token bucket + 30d/7d 正负缓存 + GSM 反查 GSE 系列策略，与主仓库同一检索策略版本 `v1`）；放在 LLM 凭证检查之前（文献 action 不需要 AI 凭证）。
- **测试反馈修复**：
  - 本地历史会话侧栏展示（`index.tsx`：localSessions 状态 + displaySessions 数据源 + 未登录删除/恢复分支；注意 `localSessions` useState 须在消息加载 effect 之前声明，否则 TDZ）。
  - EmptyState 示例池 12/6/6 条随机抽样（原样复制件自动带过来）。
- **不迁移**（QMuse 无此概念）：statsStore 的 isOfflineMode 本地统计层、Leaderboard 离线默认页签（QMuse 平台账号体系不同，游客统计走云函数 bump_guest action）。

**踩坑记录（迁移规范 §三 的补充）：**

- **产物校验器的字符串掩码与正则字面量冲突**：`efetchOutline` 里 `/Label="([^"]*)"/` 的 `"` 被校验器 analyzeSource 误判为字符串边界，连锁吞掉后续 ~3000 字符代码，导致「必须直接读取 process.env.QMUSE_APPWRITE_DATABASE_ID」检查失败（实际代码没问题）。修法：正则里用 `\x22` 代替 `"` 字面量。**以后在云函数源码里写含 `"` 的正则一律用 `\x22`。**
- QMuse SDK 字段名是 `responseBody`（不是 `body`）——`executeQmuseFunction` 返回的 Execution 对象解析时注意。

**验证**：`npm run check` 0 error（2 条 warning 为 R1 既有）、`npm run build` 通过、产物校验器通过。
**未执行（需平台环境）**：`qmuse import .`（重新导入云函数使 literature action 生效）、`qmuse-cli cloud set-secret "NCBI_API_KEY"`（可选，提升限速）、真实云资源联调。
