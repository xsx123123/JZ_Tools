# GEO寻宝鼠 · 对话式组学数据检索助手

一个把 [seqout-mcp](https://seqout.org) 的 26 个只读组学数据检索工具封装成「聊天式挖宝」体验的单页 Web 应用：用户用自然语言提问，后端大模型自动选择并调用 seqout API，结果以数据卡片 + 可折叠建议卡呈现；页面右下角常驻一只「寻宝鼠」桌宠，随检索进度挖宝、攒宝藏、解锁成就。

![封面 · 夜探矿洞](docs/寻宝鼠.png)

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
│   │   │   ├── ChatMessage.tsx      # 消息气泡：Markdown 渲染 + 复制/重试 + 建议卡
│   │   │   ├── SuggestionBlock.tsx  # 「阿寻的下一铲建议」折叠卡 + followup 围栏解析
│   │   │   ├── DatasetCard.tsx      # 数据集卡片（缩小版，流式结束后才渲染）
│   │   │   ├── ToolTrace.tsx        # 工具调用轨迹展示
│   │   │   ├── Markdown.tsx         # 自研轻量 Markdown 渲染
│   │   │   ├── Composer.tsx         # 输入框
│   │   │   └── EmptyState.tsx       # 空态引导
│   │   ├── pet/TreasureMouse.tsx    # 桌宠状态机（idle/digging/reveal/stow/...+拖拽）
│   │   └── ui/                      # shadcn/ui 预置组件（46 个）
│   ├── services/
│   │   ├── seqoutChat.ts       # SSE 客户端：解析 Edge Function 下行协议
│   │   ├── chatStore.ts        # 会话/消息持久化（登录后走云端，游客走 localStorage）
│   │   └── petStore.ts         # 桌宠偏好 / 宝藏计数 / 成就（localStorage）
│   ├── lib/                    # utils（cn）、reveal-engine（滚动入场）
│   └── supabase/
│       ├── client.ts           # 【平台生成】Cloud 客户端单例，禁止手改
│       └── types.ts            # 【平台生成】数据库类型，禁止手改
├── functions/
│   └── seqout-chat/index.ts    # 核心 Edge Function（见下文协议）
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
- 未登录也可使用：消息仅存 localStorage（key `seqout-local-session`）。

### 3.4 主题系统

- 亮色 = 现代学术轻量风（teal-600 主色 + 琥珀金 accent）；暗色 = 「夜探矿洞」（深蓝灰底 + teal-400 提亮 + 亮金 accent）。
- 两套 token 全在 `src/styles.css`（`:root` / `.dark`），组件一律消费 theme utility（`bg-card` 等），禁止硬编码 `bg-white`。
- 切换偏好写 localStorage `seqout-theme`；`index.html` 内联 bootstrap 脚本在 React 加载前挂 `.dark` 类防闪白，同时支持 `?theme=dark` URL 参数（沙箱截图取证通道）。

### 3.5 桌宠与成就

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
