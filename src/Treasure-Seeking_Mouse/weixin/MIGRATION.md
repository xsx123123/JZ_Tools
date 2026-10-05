# 迁移记录 · weixin

> 记录每轮从主仓库到小程序版的同步。体例参照 `../qmuse/MIGRATION.md`：
> 每条记 `R<n> — 日期 — 源 commit`。

## R1 — 2026-10-05 首次落地（源：主仓库 commit `dc9845e`）

### 本轮做了什么

把调研结论中的「可行性验证 + 骨架搭建」一次做完，产出**可编译、可 typecheck 的小程序工程**，
核心对话链路（流式检索 → 消息渲染 → 数据卡片 → 本机持久化）已跑通代码路径。

工具链版本：Taro **4.3.0** + React **18.3.1** + webpack5 + TypeScript。

### 文件级结果

| 主仓库 | 小程序版 | 处理 |
|---|---|---|
| `src/i18n/locales/{zh,en}.ts` | `src/i18n/locales/` | ✅ 原样复制（纯 TS） |
| `src/i18n/index.ts` | `src/i18n/index.ts` | 🔧 仅改 3 个平台函数（见下） |
| `src/i18n/provider.tsx` | `src/i18n/provider.tsx` | ✅ 原样复制 |
| `src/lib/linkify.ts` | `src/lib/linkify.ts` | ✅ 原样复制（零改动） |
| `src/lib/evidenceBus.ts` | `src/lib/evidenceBus.ts` | ✅ 原样复制（零改动） |
| `src/services/seqoutChat.ts` | 同路径 | 🔧 重写请求层（fetch→wx.request） |
| `src/services/petStore.ts` | 同路径 | 🔧 localStorage→storage 适配层 + applyTheme 改造 |
| `src/services/chatStore.ts` | 同路径 | 🔧 重写：云端 Supabase → 本机存储 |
| `src/services/statsStore.ts` | 同路径 | 🔧 重写：Supabase RPC → 本机统计 |
| `src/styles.css` | `src/styles/theme.css` | 🔧 转换：114 处 oklch → rgb；剥离 Tailwind 指令 |
| `src/routes/index.tsx` | `src/pages/index/index.tsx` | 🔧 重写为小程序页面 |
| `src/components/**` | — | ❌ 未迁移（DOM/Radix 依赖） |
| （新增） | `src/services/device.ts` | 存储适配层 + 设备指纹 |

### i18n 的 3 处平台适配

1. `detectDefaultLang`：`navigator.language` → `Taro.getSystemInfoSync().language`
2. `readLang`/`writeLang`：`localStorage` → `wx.getStorageSync`/`setStorageSync`；
   **顺带去掉**了网页版的 `?lang=` URL 参数通道（小程序无此概念）
3. `applyLang`：`document.title` → `Taro.setNavigationBarTitle`

字典本体（zh/en 各 218 键）**零改动**，键数校验通过。

### 流式实现（本轮关键）

`wx.request` + `enableChunked: true` + `task.onChunkReceived()`，配 `responseType: 'arraybuffer'`。
分块用 `TextDecoder` 累积到 buffer，按 `\n` 切行、只处理完整帧（跨 chunk 的半帧留到下一块），
流结束 `flush()` 冲刷。**SSE 帧格式与后端一致，解析逻辑与网页版同构。**

### 已知未做（下一轮候选）

- [ ] **`onChunkReceived` 真机验证**：本轮只验了编译产物含该调用，**未在开发者工具/真机实跑**（见 README 第九节待确认清单）
- [ ] Markdown 渲染：当前直接渲染纯文本，未接 `rich-text`/`towxml`，**编号内嵌链接（IdLink）尚未实现**
- [ ] 文献证据链卡片、排行榜抽屉、使用统计弹窗、桌宠、会话侧栏、主题切换按钮、`?theme=dark` 等价通道
- [ ] 对话服务域名占位 `https://YOUR_DOMAIN/chat-api` 待替换为真实备案 HTTPS 域名
- [ ] `dark` 类挂载：`applyTheme` 已改为 `setData({ __theme })`，但页面根节点尚未消费该字段（需在 index.tsx 根 View 上绑定 class）

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 通过 |
| `npx taro build --type weapp` | ✅ Compiled successfully |
| 产物 | `dist/` 444KB，含 `.wxml`/`.wxss`/`app.json` |
| 主题 token | ✅ 写出为 `--primary:#009689` 等，**oklch 0 处** |
| 平台禁项（源码） | `localStorage`/`window.`/`document.`/`navigator.`/`getReader` 全 0 |
| 属性选择器 / 带参伪类 | 全 0（`nth-child` 已改显式类名） |
| i18n 字典 | ✅ 双双打包进 `common.js` |

### 踩坑记录（本轮新增）

- ❌ Taro 4.3 的 `babel-preset-taro` 依赖 `@babel/preset-react` 等，但未声明为依赖 → 需手动装 **`@babel/preset-react@^7`**（装 8.x 会与 `@babel/core@7` peer 冲突，报 ERESOLVE）
- ❌ `src/app.ts` 含 JSX → 必须命名 `.tsx`，否则 tsc 报 `TS1161: Unterminated regular expression literal`
- ❌ `wx.request` 的请求头字段是 **`header`**（单数），不是 `headers`——写错 tsc 会直接报 TS2561
- ❌ Taro 默认不认 tsconfig 的 `paths` 别名 → 需在 `config/index.ts` 加 `alias: { '@': path.resolve(...) }` 才解析 `@/xxx`
- ❌ 从主仓库拷来的 `styles.css` 头部的 Tailwind v4 指令（`@import "tailwindcss"`/`@source`/`@theme inline`）与 `@fontsource` 字体 `@import` 在小程序侧无效且会报 postcss 警告 → 整段剥离
- ⚠️ `oklch` 不只出现在 CSS：`petStore.ts` 的成就徽章渐变色是**内联 JS 字符串**，转换时易漏（本轮漏了一次，靠全类型 grep 补上）
