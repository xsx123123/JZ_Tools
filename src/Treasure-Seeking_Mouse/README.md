# GEO寻宝鼠 · 对话式组学数据检索助手

> 🚀 **在线体验**：<https://q1vj9sqopzwj.meoo.fun/>（线上部署版本可能落后于仓库最新代码）

一个把 [seqout-mcp](https://seqout.org) 的 26 个只读组学数据检索工具封装成「聊天式挖宝」体验的单页 Web 应用：用户用自然语言提问，后端大模型自动选择并调用 seqout API，结果以数据卡片 + 可折叠建议卡呈现；页面右下角常驻一只「寻宝鼠」桌宠，随检索进度挖宝、攒宝藏、解锁成就。

![封面 · 夜探矿洞](docs/寻宝鼠.png)

**界面预览**（自托管模式 + DeepSeek 模型，纯游客运行）：

![使用界面](docs/使用页面.png)

---

## 一、技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 前端框架 | React 19 + TypeScript 5.8 | 具名导出组件 |
| 构建 | Vite 7 | dev 端口锁定 3015，HMR 默认关闭 |
| 路由 | TanStack Router（文件路由） | `src/routes/` 一页一文件，`routeTree.gen.ts` 由插件自动生成、禁止手改 |
| 样式 | Tailwind CSS v4 + shadcn/ui (Radix) | 设计 token 全部在 `src/styles.css`（oklch + `@theme inline`），双套主题 |
| 动效 | 纯 CSS keyframes + `tw-animate-css` | 项目约束：禁止 framer-motion 类运行时动画库 |
| 字体 | Fraunces / Noto Sans SC / JetBrains Mono（fontsource 本地化） | 无外部 CDN 依赖 |
| 后端 | Meoo Cloud（Supabase 兼容） | PostgreSQL + Auth + Edge Functions |
| LLM | Meoo AI（OpenAI 兼容接口） | 默认模型 qwen3.8-flash，Edge Function 内 tool-calling 循环 |
| 数据源 | https://seqout.org/api | 纯 GET、无鉴权的组学数据集检索 API |

---

## 二、目录结构

```
/
├── index.html                  # 入口 + 内联主题 bootstrap 脚本（防暗色闪白）
├── vite.config.ts              # 构建配置（3015 端口 / dist 产物为硬约束，勿改）
├── package.json
├── tsconfig.json
├── src/
│   ├── main.tsx                # React 挂载 + 路由实例
│   ├── router.tsx              # TanStack Router 装配
│   ├── routeTree.gen.ts        # 【自动生成】文件路由树，禁止手改
│   ├── styles.css              # 唯一 design system：亮色 :root + 夜探矿洞 .dark 两套 token
│   ├── routes/
│   │   ├── __root.tsx          # 根布局
│   │   ├── index.tsx           # 主页面：会话栏 + 对话区 + 登录弹窗 + 桌宠接线
│   │   ├── about.tsx           # 关于页（产品介绍图 src/assets/about/intro.png）
│   │   └── reset-password.tsx  # 忘记密码重置页
│   ├── components/
│   │   ├── BrandMark.tsx       # Logo
│   │   ├── auth/AuthDialog.tsx # 注册/登录/验证码弹窗
│   │   ├── chat/               # 对话域组件
│   │   │   ├── SessionSidebar.tsx   # 左侧会话列表（PC 默认折叠）
│   │   │   ├── ChatMessage.tsx      # 消息气泡：Markdown 渲染 + 复制/重试 + 建议卡 + 文献证据链挂载
│   │   │   ├── SuggestionBlock.tsx  # 「阿寻的下一铲建议」折叠卡 + followup 围栏解析
│   │   │   ├── DatasetCard.tsx      # 数据集卡片（含 📖 文献入口，点击高亮反馈）
│   │   │   ├── ToolTrace.tsx        # 工具调用轨迹展示
│   │   │   ├── IdLink.tsx           # 正文内嵌编号链接：hover 300ms 浮层（自动预取论文 + 复制 ID / 查看证据链）
│   │   │   ├── LiteratureCard.tsx   # 文献证据链卡片：结构化摘要分段 + DOI / PubMed / OA 全文链接
│   │   │   ├── Markdown.tsx         # react-markdown 渲染 + rehypeLinkify 插件（AST 层注入编号链接）
│   │   │   ├── Composer.tsx         # 输入框
│   │   │   └── EmptyState.tsx       # 空态引导（示例池随机抽样，每次进入换一批）
│   │   ├── pet/TreasureMouse.tsx    # 桌宠状态机（idle/digging/reveal/stow/...+拖拽）
│   │   └── ui/                      # shadcn/ui 预置组件（46 个）
│   ├── services/
│   │   ├── seqoutChat.ts       # SSE 客户端：解析 Edge Function 下行协议
│   │   ├── literature.ts       # T2 文献联动客户端：非流式 JSON + 前端 TTL 缓存
│   │   ├── chatStore.ts        # 会话/消息持久化（登录后走云端，游客走 localStorage）
│   │   ├── statsStore.ts       # 排行榜统计上报（RPC bump_user_stats / bump_guest_stats）
│   │   └── petStore.ts         # 桌宠偏好 / 宝藏计数 / 成就（localStorage）
│   ├── lib/
│   │   ├── linkify.ts          # 编号模式与 URL 映射（GSE/GSM/GO:/PMID）
│   │   ├── evidenceBus.ts      # IdLink/卡片 → 消息列表层的"查看证据链"事件桥
│   │   ├── utils.ts            # cn 等
│   │   └── reveal-engine.ts    # 滚动入场
│   └── supabase/
│       ├── client.ts           # 【平台生成】Cloud 客户端单例，禁止手改
│       └── types.ts            # 【平台生成】数据库类型，禁止手改
├── crawler/                    # T1 捉虫休眠模块（最小骨架，见 §3.6）
├── functions/
│   └── seqout-chat/index.ts    # 核心 Edge Function（见下文协议，含文献联动 action）
└── migrations/                 # SQL 迁移（建表 + RLS）
    ├── 20261003_092937_create_profiles.sql
    └── 20261003_092943_create_chat_tables.sql
```

---

## 三、核心架构与数据流

### 3.1 一次提问的完整链路

```
用户输入 (Composer)
  → src/routes/index.tsx handleSend()
    → src/services/seqoutChat.ts  POST {supabaseUrl}/functions/v1/seqout-chat
      （裸 fetch，必须携带 OneDay-App-Id 头，值取自 src/supabase/client.ts 的 projectUrlId）
      → Edge Function functions/seqout-chat/index.ts
          1. 调 Meoo AI（OpenAI 兼容 /chat/completions，带 26 个 tool schema）
          2. 模型发起 tool_calls → 函数内直接 GET https://seqout.org/api/...（最多 5 轮循环）
          3. 结果回填给模型继续推理；search 响应超大时先截断再送 LLM
        ← 以 SSE 下行自定义协议推给前端
  → 前端按事件类型分发：
      {"delta"}            → 追加正文（Markdown 流式渲染）
      {"event":"tool"}     → ToolTrace 展示 + 桌宠 digging
      {"event":"cards"}    → 数据集卡片数据（流式结束后统一渲染）+ 桌宠出货计数
      {"event":"end"}      → 收尾
      {"error"} / [DONE]   → 异常 / 结束
      ": ping"             → 每 10s 心跳，防代理缓冲
```

### 3.2 尾部建议协议（followup）

模型按 SYSTEM_PROMPT 第 8 条约定，在正文末尾输出：

```
:::followup
1. 建议一（一句话、可直接作为提问发送）
2. 建议二
:::
```

前端 `SuggestionBlock.tsx` 的 `extractFollowups()` 剥离该围栏渲染成默认折叠的可点击建议卡；旧消息没有该块则正常显示纯正文。

### 3.3 认证与数据隔离

- 注册登录：邮箱验证码 + 密码。`signUp → verifyOtp(type:'signup') → getUser → upsert profiles`；忘记密码走 `resetPasswordForEmail` + `/reset-password` 回调页。
- 数据表：`profiles` / `chat_sessions` / `chat_messages`（cards、tool_logs 为 JSONB）。RLS 全部以 `auth.uid()` 本人隔离。
- 未登录也可使用：会话与消息存本浏览器 localStorage（key `seqout-local-session`），最多保留最近 50 条会话、最后活跃超过 7 天的自动清除；**侧栏会显示本地历史会话列表**（按最后活跃倒序），可恢复完整消息（含卡片/工具轨迹）、重命名、删除；侧栏底部与顶栏「临时试用」处有明确提示。
- 离线模式（无 Supabase 配置）：登录按钮隐藏、云端调用静默空转，会话/统计/排行榜全部走 localStorage 本地兜底（见 §3.8）。

### 3.4 主题系统

- 亮色 = 现代学术轻量风（teal-600 主色 + 琥珀金 accent）；暗色 = 「夜探矿洞」（深蓝灰底 + teal-400 提亮 + 亮金 accent）。
- 两套 token 全在 `src/styles.css`（`:root` / `.dark`），组件一律消费 theme utility（`bg-card` 等），禁止硬编码 `bg-white`。
- 切换偏好写 localStorage `seqout-theme`；`index.html` 内联 bootstrap 脚本在 React 加载前挂 `.dark` 类防闪白，同时支持 `?theme=dark` URL 参数（沙箱截图取证通道）。

### 3.5 v2.1 正文内嵌超链接（就地可操作）

三级信息架构：正文内嵌链接（L1 主入口）→ hover 浮层（L2）→ 文献证据链卡片（L3）。

- **模式与映射**：`src/lib/linkify.ts` 定义 GSE/GSM/GO:/PMID 四类模式与 URL 映射（模块级常量）；查不到映射的 ID 保持纯文本，不出死链。
- **AST 层注入**：`Markdown.tsx` 的 rehypeLinkify 插件在渲染树遍历 `text` 节点做切分，**跳过 `code`/`pre`/`a` 祖先链**（代码块内 ID 不可点、已有链接不套娃）；Markdown 源文本保持干净，复制出去的仍是纯文本。
- **`IdLink.tsx` hover 浮层**（300ms 延迟）：打开时自动经 T2 预取论文元数据（标题/期刊/年份，前端 TTL 缓存：命中 10 分钟 / 未命中 5 分钟），含「复制 ID / 查看证据链 / 原始页」按钮组。
- **`LiteratureCard.tsx` 文献证据链卡片**：结构化摘要分段 outline + DOI / PubMed / OA 全文链接；出现时平滑滚动到可视区；`not_found` 显示建议检索词优雅降级。
- **事件桥**：`src/lib/evidenceBus.ts` 把 IdLink/卡片深处的"查看证据链"请求多播给消息列表层（按 hostMessageId 认领），文献卡片渲染在宿主消息下方。
- 样式：`styles.css` 的 `.id-link`（teal 主色 + hover 下划线展开），双主题自适应。

### 3.6 T1 捉虫休眠模块（crawler/）

最小爬虫骨架 + 休眠一体（`crawler/` 目录）：

- `sleeper.py`：RUNNING/IDLE/SLEEP 三态状态机 + 指数退避阶梯（60/300/900/1800 秒封顶，成功执行任务后计数器清零）+ `poke()` 统一唤醒收口 + 可注入 `Clock`（单测用虚拟时钟，不真等 90 分钟）+ 资源 release/acquire 钩子（SLEEP 释放重建）+ 环境变量覆盖（`CRAWLER_HEARTBEAT=0` 等）。
- `runner.py`：主循环（命令队列优先于任务队列）；现有捉虫逻辑接入点为 `register_handler` 的任务处理函数。
- `cli.py`：`python -m crawler.cli demo` 端到端演示（入队 → 执行 → 空闲退避 → SLEEP → 命令唤醒）。
- `config/crawler.yaml` + `tests/test_sleeper.py`（8 个注入时钟单测）。
- 唤醒优先级在消费侧处理：所有唤醒源最终只做 `wake_event.set()`，唤醒后先看命令队列再看任务队列。
- 状态日志格式固定：`crawler.state <FROM> -> <TO> reason=<r> idle_cycles=<n>`——排查"捉虫是不是死了"全靠这条。
- 生产路径禁止裸 sleep：全项目仅 `Sleeper.Clock` 一处 wait。

### 3.7 T2 PubMed 文献联动

用户选中 GEO/GO 数据后，自动拉取其对应论文的结构化摘要大纲 + 原文链接（走对话后端的非流式 `action:"literature"` 分支，不消耗 LLM token、不要求 AI 凭证）：

- **检索三级策略**：① GEO 条目自带 PMID（seqout `/project/{id}` 的 `pubmed_id` 字段，精确命中；GSM 先经 `/accession/{GSM}/project` 反查所属 GSE 系列，同一系列的所有样本共享同一篇论文）→ ② NCBI esearch 标题精确匹配（`{id}[Title]`，避免命中正文顺带提及的无关文献）→ ③ Europe PMC 兜底（OA 全文覆盖更好）。
- **NCBI E-utilities 三端点**：esearch（关键词→PMID）/ esummary（PMID→标题/期刊/DOI）/ efetch（PMID→结构化摘要分段 XML，无 Label 的整段摘要降级为 "Abstract" 一段）。请求必带 `tool=go_xunbaoshu`；有 `NCBI_API_KEY` 限 10 次/秒、无 key 3 次/秒（token bucket）。
- **缓存**：后端进程内 TTL 正缓存 30 天 / 负缓存 7 天（not_found 也要负缓存，防坏 ID 反复打 NCBI）；key 带检索策略版本号，规则升级后旧缓存自然失效。
- **退避与降级**：429/5xx → 1s/2s/4s 三次后退避，仍失败整条链路降级 Europe PMC（打 WARN 日志，UI 无感知）。
- **not_found 是正常业务状态**：返回 `{"status":"not_found","suggested_queries":[...]}`，UI 显示建议检索词，不算 error。
- 前端：`src/services/literature.ts`（3s 超时、never throws）+ `DatasetCard` 的 📖 文献入口（点击高亮反馈 + 卡片自动滚动到可视区）。

### 3.8 排行榜统计与空态引导

- **统计上报**：`statsStore.ts` 在每轮对话结束后 fire-and-forget 调用 RPC（登录 `bump_user_stats` / 访客 `bump_guest_stats`），累计列与周列（`week_*` + `week_base` 周一日期，RPC 内自动跨周归零）双轨累加。注意 RPC 参数名带 `p_` 前缀（见 `src/supabase/types.ts` Functions），名字不匹配会被静默忽略——统计恒为 0 的排查入口。
- **离线模式本地统计**：无 Supabase 配置时，`statsStore.ts` 走 localStorage 本地统计层（key `seqout-local-stats`，单行 upsert、双轨字段与云端 RPC 语义一致、跨周自动归零）；排行榜直接显示本地统计行在「临时矿工」榜，改昵称也走本地。**排行榜离线模式下默认打开「临时矿工」页签**（登录榜恒为空）。配置 Supabase 后自动切回云端，无需改代码。
- **空态示例随机化**：`EmptyState.tsx` 维护三组示例池（探矿定位 12 条 / 验宝鉴宝 6 条 / 清点矿藏 6 条），每次进入空态 Fisher-Yates 洗牌随机抽样展示（组内条数 3/2/1 不变）；本次空态内稳定，重新进入会话再换一批。

### 3.9 桌宠与成就

- `TreasureMouse.tsx` 状态机 + pointer 拖拽；主形象为本地抠图 PNG（`src/assets/pet/`，构建时打包）。
- `index.tsx` 在 SSE 的 onTool/onCards/onEnd/onError 里经 `makePetEvent()`（自增 seq 去重）转发事件。
- 成就：累计挖宝 10/50/100 三档一次性庆祝动画 + 常驻徽章，领取记录存 localStorage `seqout-pet-achievements`（幂等）；cards 与 done 同轮触发时用 `countedRef` 防重复计数。

---

## 四、本地开发

```bash
# 1. 安装依赖（pnpm 为唯一包管理器）
pnpm install

# 2. 启动开发服务器（固定 3015 端口，勿改）
pnpm run dev

# 3. 类型检查 / 生产构建
pnpm run typecheck
pnpm run build          # 产物输出到 dist/（dist/index.html 为入口）
pnpm run preview        # 本地预览构建产物
```

环境变量：`.env` / `.env.local` 中的 `VITE_SUPABASE_*`、`VITE_ONEDAY_APP_ID` 等平台托管变量由云服务初始化流程生成，**不要手工编辑或删除**；丢失时通过平台的 Cloud 重新生成能力恢复。

---

## 五、部署方式

本项目托管在 Meoo 平台上，前后端分别有独立的发布通道：

### 5.1 前端（Web 应用）

1. 代码改动完成后执行 `pnpm run build`，确认无编译错误；
2. 在平台对话界面右上角点击「**发布 → 立即发布**」；
3. 发布成功后得到 `xxxx.meoo.com` 形态的公开链接（已备案、免 ICP）；同一应用重新发布时**链接不变**，内容更新到最新快照；
4. 若需要绑定自有域名（付费能力），一级域名 CNAME 主机记录填 `@`，需自行完成 ICP 备案；
5. 排查线上滞后：发布快照取点击发布那一刻的构建结果，发布后访问方需强制刷新（Ctrl/Cmd+Shift+R）绕过浏览器缓存。

### 5.2 后端 Edge Function（seqout-chat）

- 源码在 `functions/seqout-chat/index.ts`，**每次修改后必须重新部署**才会生效（本地改完 ≠ 线上生效）；
- 部署目标为 Meoo Cloud 的 Edge Functions 运行时（Deno/TypeScript），路径固定 `/functions/v1/seqout-chat`，`verify_jwt=false`（允许匿名调用，靠限流与只读 API 保证安全）；
- 部署与日志查看通过平台的云函数管理能力完成；函数内依赖的平台侧密钥（Meoo AI 鉴权）由云端 secrets 托管，不在源码里出现。

### 5.3 数据库

- 表结构变更以 `migrations/*.sql` 为准，通过平台的数据库迁移能力在云端 Supabase 实例上执行；
- 新环境上线顺序：开通云服务 → 执行迁移（建表 + RLS）→ 部署 Edge Function → 配置平台侧 secrets → 发布前端。

### 5.4 无需自备的部分

LLM 额度与网关、seqout API 代理（函数内直连公网 GET）、存储桶、Auth 邮件通道均由平台托管，部署方不需要额外配置服务器、域名证书或反向代理。

---

## 六、已知约束与踩坑清单

- `vite.config.ts` 中 `server.port=3015`、`strictPort`、`build.outDir=dist` 为沙箱硬约束，不可修改。
- 裸 fetch Edge Function 必须带 `OneDay-App-Id` 头（本项目 `client.ts` 导出了 `projectUrlId`）。
- Supabase `Json` 联合类型不能直接 spread（TS2698），需先收窄为 `Record<string, Json>`。
- seqout search 响应可能超过 9000 字符，送 LLM 前必须截断 results；卡片数据单独经 `cards` 事件给前端。
- Edge Function 冷启动首次调用可能 503，复测即恢复，非故障。
- Tailwind v4 无 `h-4.5` 这类半档刻度，自定义尺寸用任意值语法（如 `h-[18px]`）。
- 动效禁用 framer-motion（package.json 里的该依赖是模板遗留，业务代码不引用）。
- Request body 只能读一次：handler 里对 `req.json()` 的多次调用会抛 `Body has already been read`——文献 action 与对话流程共用同一次解析结果。
- Supabase RPC 参数名必须与 schema 定义精确匹配（带 `p_` 前缀），名字不对会被静默忽略且失败被 catch 吞掉——排行榜统计恒为 0 的典型根因。

---

## 七、自托管（脱离 Meoo 平台）

项目对 Meoo 平台的依赖收敛为两处：前端 `VITE_*` 环境变量，和 Edge Function 的运行时密钥（`MEOO_PROJECT_API_KEY*`，平台 secrets 托管）。对话核心（LLM tool-calling 循环）已全部环境变量化，可用**任意 OpenAI 兼容服务**自托管。

### 7.1 本地跑通对话（不需要任何 Meoo 资源）

```bash
cp server/.env.example server/.env   # 填入 LLM_API_KEY（OpenAI / DeepSeek / 硅基流动 / 本地 vLLM 均可）
pnpm run server                      # 启动本地对话服务 http://localhost:8787
```

前端 `.env.local` 加一行 `VITE_CHAT_API=http://localhost:8787`，再 `pnpm run dev`：对话、SSE 流式、工具轨迹、数据卡片全部走本地服务（Node 原生跑 `functions/seqout-chat/index.ts` 导出的 handler，零额外依赖）。

- 自托管模式下 `VITE_ONEDAY_APP_ID` 可留空（`client.ts` 已改为可选，不再发送 `OneDay-App-Id` 头）。
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 没有时会自动降级为**纯游客模式**（`client.ts` 的 `isOfflineMode`：Proxy 桩客户端让 auth 固定未登录、云端调用静默空转，登录按钮隐藏），对话/桌宠/会话（localStorage）不受影响；配上 Supabase 兼容实例则登录/云同步/排行榜恢复可用。
- dev 下推荐 `VITE_CHAT_API=/chat-api`：vite 把 `/chat-api` 代理到本地服务（`vite.config.ts` 的 `server.proxy`，目标可用 `CHAT_API_PROXY_TARGET` 覆盖），浏览器只访问 3015 单端口——同源无 CORS，局域网其他设备打开也能完整对话。
- 服务端可覆盖的环境变量见 `functions/seqout-chat/index.ts` 头部注释：`LLM_API_KEY`（必填）、`LLM_BASE_URL`（默认 Meoo AI 的 compatible-mode/v1）、`LLM_MODEL`、`SEQOUT_BASE_URL`、`CHAT_API_PORT`（默认 8787，见 `server/local.mjs`）。

### 7.2 与平台模式的切换

`.env.local` 中 `VITE_CHAT_API` 留空或删除即回到平台模式：请求走 `{supabaseUrl}/functions/v1/seqout-chat` 并携带 `OneDay-App-Id` 头，行为与改造前完全一致（Edge Function 部署到平台后仍按原方式读取 `MEOO_PROJECT_API_KEY*` secrets，本地新增的 `LLM_API_KEY` 仅为兜底）。

---

## 八、自托管生产部署（详细步骤）

### 8.1 部署形态

生产环境由**两个进程**组成，可同一台机器部署：

```
浏览器 ──► nginx（80/443）
              ├── /            → 静态文件 dist/（React 前端）
              └── /chat-api/   → 反向代理 → 对话服务 127.0.0.1:8788（server/local.mjs）
                                     │
                                     └──► 你的 LLM 网关（OpenAI 兼容）+ seqout.org 公共 API
```

- **前端是纯静态文件**（`pnpm run build` 产出 `dist/`），任何静态托管（nginx / Caddy / OSS）均可。
- **对话服务持有 LLM 密钥**，必须运行在服务器侧，永远不要暴露密钥给浏览器。
- 前端通过 `VITE_CHAT_API` 找对话服务。生产推荐**同源反代**（`/chat-api` → 8788），无 CORS、无混合内容问题；也可以把 `VITE_CHAT_API` 直接填成对话服务的公网 URL（服务端已带 CORS 头，适合前后端分机器部署）。
- 注意：`VITE_*` 变量在**构建时**固化进 bundle，改完必须重新 `pnpm run build`。

### 8.2 Docker Compose 部署（推荐）

仓库自带容器化部署（`deploy/` 下的 Dockerfile 双 target + compose + Makefile），无需在宿主机装 Node/pnpm/nginx：

```bash
cp server/.env.example server/.env   # 填 LLM_API_KEY（必填）；需要 Supabase 登录再填 VITE_SUPABASE_*
make docker-start                    # 预检 LLM 密钥 → 构建 → 启动
```

打开 `http://localhost:8090/`（端口由 `server/.env` 的 `WEB_PORT` 控制），发一条消息能看到流式回复即部署成功。

**配置只有一份**：`server/.env` 同时供本地 `pnpm run server` 和容器使用，不用重复维护。宿主机相关变量（`WEB_PORT`/`VITE_*`/NCBI key）也写在这一份里。

**启动前自动预检密钥**：`deploy/check-llm-key.py` 会先请求 `{LLM_BASE_URL}/models` 验证密钥可用、模型存在，不通过就阻止启动——避免"容器起来了、一对话才报错"。跳过：`make docker-start SKIP_LLM_CHECK=1`；单独跑：`make check-llm`。

常用命令（`make` 查看全部）：

| 命令 | 作用 |
|------|------|
| `make docker-start` | 预检 + 构建 + 启动（后台） |
| `make docker-stop` | 停止并移除容器 |
| `make docker-restart` | 重启（不重建，读最新 `server/.env`） |
| `make docker-logs` | 跟踪对话服务日志 |
| `make docker-status` | 查看容器与健康状态 |
| `make docker-clean` | 停止并删镜像（彻底重来） |

- **架构**：`web`（nginx 托管前端静态产物 + `/chat-api` 同源反代）+ `chat`（`server/local.mjs` 对话服务），与 §8.1 的同源反代形态完全一致，浏览器只访问 web 一个端口。
- **变量分两类**：chat 服务是运行时变量（改完 `make docker-restart`）；`VITE_SUPABASE_*` 是构建期变量（改完必须 `make docker-start` 重新构建）。
- **升级**：`git pull && make docker-start`。
- **端口冲突**：在 `server/.env` 改 `WEB_PORT` 即可。
- 验证：`curl http://localhost:8090/chat-api/models` 应返回模型目录 JSON。
- 不用 Docker 的情况下按 §8.4 起手动部署。

### 8.3 环境要求（手动部署）

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 22.6（推荐 24.x） | 对话服务依赖原生 type-stripping 直接跑 TS，无需 Deno |
| pnpm | 9+ | `corepack enable` 即可 |
| LLM 密钥 | 任意 OpenAI 兼容服务 | OpenAI / DeepSeek / 硅基流动 / 本地 vLLM 等 |
| Supabase 兼容实例 | 可选 | 不配则自动降级纯游客模式（登录/云同步/排行榜不可用） |

### 8.4 部署步骤（手动）

```bash
# 1) 安装依赖
pnpm install

# 2) 配置对话服务（密钥等，文件已被 gitignore）
cp server/.env.example server/.env
#    编辑 server/.env：
#      LLM_API_KEY=sk-你的密钥           # 必填
#      LLM_BASE_URL=https://xxx/v1      # 非 Meoo AI 时必填
#      LLM_MODEL=deepseek-flash         # 填 /models 目录里真实存在的 id
#      CHAT_API_PORT=8788               # 避开已占用端口

# 3) 配置前端构建变量（生产构建默认读 .env.production）
cp .env.production.example .env.production   # 同源反代部署用默认值即可，无需修改

# 4) 构建前端
pnpm run build          # 产出 dist/

# 5) 启动对话服务
pnpm run server         # 或 CHAT_API_PORT=8788 node server/local.mjs
```

### 8.5 nginx 配置示例（手动部署）

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /opt/Treasure-Seeking_Mouse/dist;
    index index.html;

    # SPA 路由回退（/about 等前端路径都落到 index.html）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 对话服务反代（SSE 流式必需的两项：关缓冲、拉长读超时）
    location /chat-api/ {
        proxy_pass http://127.0.0.1:8788/;   # 末尾斜杠 = 去掉 /chat-api 前缀
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
```

### 8.6 进程守护（systemd，手动部署）

```ini
# /etc/systemd/system/treasure-mouse-chat.service
[Unit]
Description=Treasure Mouse chat server
After=network.target

[Service]
WorkingDirectory=/opt/Treasure-Seeking_Mouse
EnvironmentFile=/opt/Treasure-Seeking_Mouse/server/.env
ExecStart=/usr/bin/node server/local.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now treasure-mouse-chat
sudo systemctl status treasure-mouse-chat   # 查看状态
journalctl -u treasure-mouse-chat -f        # 查看日志
```

### 8.7 验证清单

```bash
# 1. 对话服务正常（应返回模型目录 JSON）
curl http://127.0.0.1:8788/models

# 2. 经 nginx 代理正常（应返回同样的 JSON）
curl http://your-domain.com/chat-api/models

# 3. 页面可访问且模型下拉有值
#    浏览器打开 http://your-domain.com/ ，发一条消息能看到流式回复即全部打通
```

### 8.8 常见问题

| 现象 | 原因与解决 |
|------|-----------|
| 「AI 服务凭证未就绪」 | 对话服务没读到密钥：检查 `server/.env` 是否生效；**改完必须重启服务** |
| 「AI 服务返回 400」 | 模型名在该网关不存在：`LLM_MODEL` 必须填 `/models` 目录里的真实 id |
| 页面能开但发消息一直转圈/报错 | 浏览器访问不到对话服务：确认 `VITE_CHAT_API` 与反代路径一致；F12 Network 面板看 `/chat-api` 请求状态 |
| 只本机能用、局域网/公网不行 | `VITE_CHAT_API` 填了 `localhost`：生产一律用 `/chat-api`（同源反代）或服务器公网 IP/域名，重新构建 |
| 改了 `.env.production` / `.env.local` 没效果 | `VITE_*` 是构建期变量，必须重新 `pnpm run build` |
| 8788 端口冲突 | 改 `server/.env` 的 `CHAT_API_PORT`，nginx `proxy_pass` 同步改 |
| 想恢复登录/排行榜 | 配任意 Supabase 兼容实例的 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`，重新构建（参考 §五 的表结构迁移） |
