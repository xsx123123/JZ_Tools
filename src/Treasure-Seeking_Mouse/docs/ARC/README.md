# ARC · Agent 开发参考手册

> 本文件夹是给 AI agent / 新开发者准备的**深度参考**，目标：接到任务后 5 分钟内定位改哪里、怎么改、怎么验。
> 运行时契约看仓库根 `AGENTS.md`（必读，含踩坑记录与回归测试红线）；本文件夹是它的"地图 + 菜谱"。
> 产品层面介绍看 `docs/README.zh-CN.md`、`docs/DETAILED_README.md` 与 `寻宝鼠_技术与工程设计白皮书_v1.docx`。如果目标是启动一个相似平台，先读 `platform-kickstart.md`；它定义可复用边界、最小启动路径和当前项目的功能基线。

## 阅读顺序（按任务类型）

| 你要做什么 | 先读 | 再读代码 |
|---|---|---|
| 启动一个相似平台/评估是否可复用 | `platform-kickstart.md` | `package.json`、`server/.env.example`、`server/`、`src/` |
| 任何任务开始前 | 本 README §1 代码地图 + 根 AGENTS.md | — |
| 改对话/工具/统计后端 | `architecture-2026-10-06.md` §二 §三 §七 | `functions/seqout-chat/index.ts` |
| 改多源文献检索/验证 API | `literature-multisource-architecture.md` | `functions/seqout-chat/index.ts`、`server/.env.example` |
| 改任何 UI/文案/主题 | `frontend-style-spec.md` 全文 | `src/styles.css` + 对应组件 |
| 改桌宠行为/造型/设置 | `frontend-style-spec.md` §5 + 架构文档 §五 | `src/components/pet/*` |
| 评估当前架构与启动可行性 | `platform-kickstart.md`（准备清单、功能基线与验收表） | — |

## 1. 代码地图（任务 → 位置 → 关键文件）

| 领域 | 位置 | 关键文件 | 备注 |
|---|---|---|---|
| 对话编排后端 | `functions/seqout-chat/index.ts` | TOOL_DEFS / executeTool / tool 循环 / resolveStudy / 用量统计；SYSTEM_PROMPT 从 `prompts.generated.ts` 导入 | 平台可移植（Deno/Node），禁 Node-only API |
| 对话提示词 | `functions/seqout-chat/prompts/system-{zh,en}.md` | **唯一可编辑来源**（中英双份平行，改一条必须两份同步） | 改完跑 `npm run sync:prompts` 重新生成 `prompts.generated.ts`；`tests/prompts-sync.test.ts` 守漂移，禁手改生成文件 |
| 自托管服务壳 | `server/` | `local.mjs`（端口/CORS/统计落盘）、`account-api.mjs`（账号/历史/榜单） | DATA_DIR 卷持久化 |
| 前端入口编排 | `src/routes/index.tsx` | handleSend / 会话切换 / effUser 分支 / petEvent 转发 | 748 行，改动前先通读相关段 |
| SSE 客户端 | `src/services/seqoutChat.ts` | chatEndpoint / 协议帧解析 / authHeaders | 加协议帧要前后端同步改 |
| 账号（自托管） | `src/services/localAuth.ts` + `src/components/auth/AuthDialog.tsx` | token 存取 / 登录合并 | 云端模式走 supabase，勿混 |
| 排行榜统计 | `src/services/statsStore.ts` | bumpStats / fetchLeaderboard / mergeLocalStatsToAccount | 双模式（云端 RPC / 离线服务端） |
| 桌宠 | `src/components/pet/` | TreasureMouse（状态机）/ PetSettingsPanel（行式面板） | 跨层通信走 `src/lib/petBus.ts` |
| 主题与样式 | `src/styles.css` | `:root` token / `.dark` 覆盖 / keyframes / reduced-motion 清单 | 改色只动这里 |
| 文案 | `src/i18n/locales/{zh,en}.ts` | 扁平键字典，zh 权威 | 新键中英同步加 |
| 部署 | `deploy/` + `Makefile` | docker-compose / Dockerfile 双 target / nginx | `make docker-start` 全权负责 |

## 2. 常见任务菜谱

### 2.1 新增一个 seqout 检索工具
1. `index.ts` `TOOL_DEFS` 加 schema（description 写清参数约束与空结果预期，模型靠它决策）；
2. `executeTool` 加 case（GSE 入参先过 `resolveStudy`；只读权威字段，禁整树递归）；
3. `labelOf`（中文标签）补名；
4. 若动了 `resolveStudy`/`studyCandidates`/`hasRuns`/`describeSeqoutError`：**必须** `npm test` + `npm run test:live` 全绿（黄金用例在 `tests/resolveStudy.test.ts`）；
5. QMuse 副本已停维护，**不要**同步。

### 2.2 新增界面文案
1. zh 加键 → en 同步加同义键；2. 组件里 `t("key")`（service 层用 `translate(readLang(), …)`）；
3. 验证：`npx tsc --noEmit`（MessageKey 模板类型会兜错键名）+ 脚本核对中英键数一致。

### 2.3 新增桌宠造型/状态
1. 512px webp 进 `src/assets/pet/`（原图归档进同目录 PNG）；2. `PetState` 加状态 + `imgSrc` 映射 + `animCls`；
3. `styles.css` 加 keyframes（并进 reduced-motion 清零清单）；4. 触发点（事件 effect / 闲置剧场 / 戳）；
5. 更新 `frontend-style-spec.md` §5.1 映射表与 AGENTS.md。

### 2.4 新增一个阿寻设置项
1. `petStore` 加 read/write（key 进 `seqout-*` 家族，注释写清语义）；
2. `PetSettingsPanel` 加行（switch 用自绘 Switch，步进/按钮照现有行式）；
3. `TreasureMouse` 订阅 settingsChanged 重读 + 实际行为门控；
4. 需要新总线通道时加 `src/lib/petBus.ts`；5. i18n 三键起步（标题/描述/控件）。

### 2.5 新增对话协议帧
1. 服务端 `send({ event: "xxx", … })`；2. `seqoutChat.ts` 解析分发 + `StreamHandlers` 加回调；
3. `index.tsx` handleSend 挂回调。注意 `trimForLLM` 只瘦身 LLM 输入，给用户的数据走独立事件。

### 2.6 改 SYSTEM_PROMPT（对话提示词）
1. 只改 `functions/seqout-chat/prompts/system-zh.md` / `system-en.md`（**唯一可编辑来源**，两份平行，逐条同步）；
2. 跑 `npm run sync:prompts` 重新生成 `prompts.generated.ts`（JSON.stringify 嵌入，免转义坑）；
3. `npm test` 必须全绿：`tests/prompts-sync.test.ts` 会比对 md 与实际导入字符串，改了 md 忘 sync 立即红；
4. `prompts.generated.ts` 是生成物，**禁手改**。

### 2.7 改主题/加色
1. `:root` 加 token → `@theme` 映射 `--color-*`；2. `.dark` 必须同步给值；
3. 组件消费 token utility，**禁 hex / Tailwind 内置色**；4. 图标描边禁透明度修饰符（oklab alpha 渲染 bug，用纯色 token）。

## 3. 验证命令速查

| 场景 | 命令 |
|---|---|
| 每次提交前 | `npx tsc --noEmit && npx vite build` |
| 改了 GSE 解析 | `npm test` + `npm run test:live`（全绿才可提交） |
| 改了提示词 | `npm run sync:prompts` + `npm test`（prompts-sync 守卫比对 md 与生成物） |
| 改了 i18n | tsc + 键数比对（zh === en） |
| 本地起全栈 | `pnpm run server`（8787）+ `pnpm run dev`（3015） |
| 部署/更新部署 | `make docker-start`（带构建，勿只 restart 容器） |
| 视觉验证 | 浏览器开 `?theme=dark` 可直取暗色态；截图用 puppeteer 元素级截图 + 灰度极值取证 |

## 4. 硬红线（违反必出事）

1. 解析权威映射只读 `relation/alias/external_id`，**绝不整树递归 / 读 neighbors / 读自由文本**；
2. 底纹/遮罩类效果**禁止整面 `::before` 蒙板**——透明度画进素材本身；
3. 新增 keyframes 必须进 `prefers-reduced-motion` 清零清单；
4. 前端不得出现任何密钥（LLM key 只在 `server/.env`）；
5. 改 `functions/seqout-chat/index.ts` 的解析逻辑必跑测试（见 2.1-4）；
6. 中英 i18n 键数保持相等；
7. `qmuse/` 目录是历史归档，不改不同步不删；
8. SYSTEM_PROMPT 只改 `prompts/*.md` 并跑 `sync:prompts`，**禁手改 `prompts.generated.ts`**。

## 5. 文档维护约定

- 改了架构（新服务/新数据面/新部署形态）→ 更新 `architecture-2026-10-06.md` 并往 §七"近期演进"加一行；
- 改了视觉规范（新 token/新组件范式/新动效）→ 更新 `frontend-style-spec.md`；
- 发现新坑 → 记根 `AGENTS.md` 踩坑记录（比记在这里优先，agent 每轮必读）；
- 本 README 的菜谱失效（代码重构后路径/流程变了）→ 顺手改，保持"照着做就能跑通"。

相似平台的准备清单、启动路径、功能基线与验收表见 `platform-kickstart.md`。
