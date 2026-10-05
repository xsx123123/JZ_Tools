# GEO寻宝鼠 · 微信小程序可行性调研

> 2026-10-05 调研。**本文只做技术可行性判断与方案取舍，尚未落地任何小程序代码。**
> 结论先说：**可行，但不是「转换」，而是「重写一个平台适配版」**——与 `../qmuse/` 迁移副本同性质，只是目标平台从 QMuse 云换成了微信小程序。

---

## 一、结论速览

| 维度 | 判断 |
|---|---|
| 能否做 | ✅ 能。核心能力（对话检索、数据卡片、文献证据链、排行榜、统计）均可平移 |
| 工作量 | ⚠️ 大。约 **6000 行**前端 + 46 个 shadcn/Radix UI 组件 + 703 行含 115 处 `oklch()` 的 CSS **不能直接复用** |
| 推荐路线 | **Taro + React 重写**（复用 `src/services/`、`src/i18n/`、`src/lib/` 等纯逻辑层） |
| 最大障碍 | ① UI 层需整体重写（Radix 是 DOM 组件库，小程序无 DOM）② 主题 CSS 的 `oklch` 需降级为 hex/rgb ③ 实时流式需走 `onChunkReceived` |
| 不推荐 | 把现有 Vite 产物塞进 `web-view`——见第七节，体验与合规都过不去 |

---

## 二、平台约束（已核实）

以下均为查证过的平台事实，是后面所有方案的前提。

### 2.1 没有 DOM，只有 WXML/WXSS/JS

小程序是**双线程架构**：逻辑层（JSCore，无 DOM/BOM）+ 渲染层（WebView 或 Skyline）。因此：

- `window.` / `document.` / `localStorage` / `navigator` / `requestAnimationFrame` **全部不存在**
- 当前代码里这些 API 的分布（实测）：

  | API | 涉及文件 | 命中次数 |
  |---|---|---|
  | `localStorage` | 7 | 36 |
  | `window.` | 11 | 19 |
  | `document.` | 6 | 14 |
  | `navigator.` | 3 | 3 |
  | `pointer` 事件 | 22 | 53 |
  | `matchMedia` / `innerWidth` | 4 | 7 |
  | `clipboard` | 2 | 2 |

- 对应替代：`localStorage` → `wx.getStorageSync/setStorageSync`；`document.title`/`<html lang>` → `wx.setNavigationBarTitle` / 页面配置；`pointer` 拖拽 → `touchstart/move/end`；`matchMedia` → `wx.getSystemInfoSync().windowWidth` 判断；`clipboard` → `wx.setClipboardData`。

### 2.2 网络请求

- 必须**预先在微信公众平台配置 request 合法域名**，且**仅支持 HTTPS**。当前对话服务走 `/chat-api` 同源反代，小程序里没有「同源」概念，需要**独立域名 + 备案 + 证书**。
- 流式：`wx.request` 的 `RequestTask` 提供 `onChunkReceived`（已核实该 API 存在），可接收分块数据，配合 `enableChunked: true` 实现**伪流式**。这是把现有 SSE 体验搬过来的关键，但**需要后端改造**（见第五节）。

### 2.3 WXSS 的坑（对本项目影响最大）

微信官方文档明确 WXSS「具有 CSS 大部分特性」，但本项目重度使用的几项恰好是重灾区：

| 特性 | 本项目用量 | 小程序支持 | 处理 |
|---|---|---|---|
| `oklch()` 颜色 | **115 处** | ⚠️ 官方文档未承诺；低版本安卓 WebView 不认，会**整条声明失效**（退化为默认色） | **必须**降级为 hex/rgb |
| CSS 自定义属性 `--x` | 大量（主题 token） | 实际可用，但 Skyline 下有差异 | 保留，需实测 |
| 属性选择器 `[attr]` | 有（`data-reveal-delay` 等） | ❌ **官方明确不支持** | 改为类选择器 |
| 带参伪类/伪元素 | 有 | ❌ **官方明确不支持** | 移除或改写 |
| `linear-gradient` / `radial-gradient` | 有（宝石、光环） | ✅ 支持 | 保留 |

样式总盘子：`src/styles.css` **703 行**，其中 `oklch` 115 处——**这一项就是主题层重写的主要工作量**。

### 2.4 分包与包体积

小程序主包上限 **2MB**、总包 **20MB**（官方限制）。当前前端产物单个 JS chunk **1.12MB**（gzip 后 343KB）已接近临界，加上 Markdown 渲染、高亮库需要**分包 + 按需加载**。

---

## 三、框架选型

| 方案 | 能否复用现有代码 | React 支持 | 评价 |
|---|---|---|---|
| **Taro** | 逻辑层可复用，UI 层重写 | ✅ 官方支持 React | **推荐**。生态最成熟；且官方提示小程序开发者工具需关掉「ES6 转 ES5 / 样式自动补全 / 代码压缩」，否则编译报错 |
| **uni-app** | 逻辑层可复用，UI 层重写 | ✅ 但 Vue 更主流 | 可选。Vue 生态更强，React 支持相对次要 |
| **原生小程序** | 几乎全重写 | ❌ | 工作量最大，不推荐 |
| **web-view 套壳** | 100% 复用 | — | ❌ 见第七节 |

**选 Taro 的关键理由**：本项目的资产是**平台无关的逻辑**——`src/services/`（数据流）、`src/i18n/`（中英双语，218 键）、`src/lib/`（编号识别、文献联动）、`functions/`（对话后端）。这些与框架绑定很弱，Taro 下能近乎原样搬走；真正要重写的是「皮肤」而非「骨架」。

---

## 四、代码资产盘点与映射

| 主仓库位置 | 行数 | 小程序处理 | 说明 |
|---|---|---|---|
| `src/i18n/` | 822 | ✅ **原样复用** | 纯 TS 字典 + 纯函数，零平台依赖 |
| `src/lib/linkify.ts` | 66 | ✅ **原样复用** | 正则识别 GSE/GSM/GO/PMID |
| `src/lib/evidenceBus.ts` | — | ✅ 可复用 | 纯事件总线 |
| `src/services/seqoutChat.ts` | 172 | 🔧 **改请求层** | `fetch`+`getReader` → `wx.request`+`onChunkReceived` |
| `src/services/chatStore.ts` / `statsStore.ts` | 365 | 🔧 **换存储/后端** | Supabase → 小程序「云开发」数据库 或 自建 API |
| `src/services/petStore.ts` | 146 | 🔧 **换存储** | `localStorage` → `wx.setStorageSync` |
| `src/lib/reveal-engine.ts` | — | ❌ **废弃** | IntersectionObserver 不可用 |
| `src/components/**/*.tsx` | — | ❌ **重写** | Radix/DOM 依赖，见下 |
| `src/components/ui/`（46 个 shadcn） | — | ❌ **不迁移** | 26 个 `@radix-ui/*` 是 DOM 组件库，小程序无 DOM；改用 Taro UI / NutUI |
| `src/styles.css` | 703 | ❌ **重写** | `oklch` 降级 + 属性选择器改写 |
| `src/routes/*.tsx` | — | ❌ **重写** | TanStack Router 不适用；改用小程序页面栈 |

**UI 层逐组件重写清单**（12 个业务组件 + 桌宠）：

`ChatMessage` / `Composer` / `SessionSidebar` / `EmptyState` / `DatasetCard` / `IdLink` / `LiteratureCard` / `Markdown` / `SuggestionBlock` / `ToolTrace` / `Leaderboard` / `UsageStatsDialog` / `pet/TreasureMouse`

其中 **`Markdown.tsx` 是硬骨头**：`react-markdown` + `remark-gfm` + `rehype-highlight` 依赖 DOM 渲染，小程序里需换成 `rich-text`（不支持 `rehype` AST 注入）或 `towxml` 这类第三方解析库，而**正文内嵌编号链接**（rehype 插件注入 `<idlink>`）这一核心特性需要重新实现方案。

**`pet/TreasureMouse`（477 行）** 依赖 `pointer` 拖拽 + `requestAnimationFrame` + 大量 CSS keyframes，需要整体改造为 `touch` 事件 + `wx.createAnimation`/CSS 动画。

---

## 五、后端改造（关键）

现有后端 `functions/seqout-chat` 输出的是 **SSE**（`text/event-stream`）。小程序端两种接法：

**方案 A：保留 SSE + `onChunkReceived`（推荐）**
- `wx.request` 加 `enableChunked: true`，用 `onChunkReceived` 收 `ArrayBuffer` 分块，自行按 `\n\n` 切帧解析
- 后端**几乎不用改**（现有 SSE 协议已是 `data: {...}` 逐行帧，前端 `seqoutChat.ts` 的解析逻辑可以平移）
- 需确认：`onChunkReceived` 的**基础库版本要求**与**分块边界**处理（跨 chunk 的半帧要缓冲）——这一点查证时官方文档页被截断，**建议在开发者工具实测确认**

**方案 B：改整包返回 + 前端模拟流式**
- 与 `qmuse/` 迁移版的做法一致（那次是云函数不支持真流式）
- 后端把 SSE 改为一次性 JSON，前端用定时器把文本「吐」出来
- 体验略逊（首字节要等全量），但实现最稳

> 建议：**先按方案 A 试**，开发者工具里实测 `onChunkReceived` 可用就走 A；不可用再退回 B。两条路的**前端解析层可以共用**，改造成本低。

登录态：小程序天然有 `wx.login` → `code` → 自建后端换 `openid`，可**替换掉 Supabase Auth**，比网页版还简单（无需邮箱验证码）。排行榜改用「云开发数据库」或自建 API。

---

## 六、合规与上线

- **类目**：AI 对话类小程序涉及「生成式人工智能服务」，微信侧需要相关资质/备案；这是**非技术环节里最容易被卡的一步**，建议先确认主体资质再投入开发。
- **域名**：request 合法域名需 HTTPS + 备案。
- **隐私协议**：需在「小程序管理后台」配置用户隐私保护指引（涉及收集设备信息做访客去重时尤其要写清楚）。

---

## 七、为什么不用 web-view 套壳

看似最省事的「把现有 Vite 产物塞进 `web-view`」实际上不可行：

1. `web-view` 仅支持**已认证主体**，且个人主体不可用；
2. 业务域名需校验文件 + 备案；
3. `web-view` 内的网页与小程序的通信受限，**无法接微信登录/分享/支付**；
4. 审核对「纯套壳网页」的通过率低，属于明确不受欢迎的形态；
5. 微信 Agent 类能力（如未来的小程序 AI 能力）无法接入。

结论：套壳省下的是重写 UI 的成本，但换来的是**合规死路**，不划算。

---

## 八、建议的实施步骤

按「先验证风险点，再铺量」的顺序：

1. **可行性验证（1-2 天）** — 建 Taro 空项目，跑通三件事：
   - `wx.request` + `enableChunked` + `onChunkReceived` 收到流式分块并解析
   - 把 `src/i18n/` + `src/lib/linkify.ts` 原样拷进去跑通
   - 写一个最小 WXSS，验证 `--自定义属性` 在真机（尤其低版本安卓）上的表现
2. **主题层重写** — 把 `styles.css` 的 115 处 `oklch` 转成 hex/rgb（亮暗双套），属性选择器改类选择器
3. **后端** — 加小程序专用 adapter（方案 A 或 B），配置 HTTPS 域名
4. **UI 逐个重写** — 从 `ChatMessage` + `Markdown` + `Composer` 核心链路开始
5. **桌宠** — 最后做，`touch` 事件 + CSS 动画重写
6. **合规** — 并行确认类目资质与隐私协议

---

## 九、待确认清单（调研时未能查证的）

以下是写文档时**没有拿到确凿官方结论**的点，落地前需实测：

- [ ] `enableChunked` 的**基础库最低版本**要求（官方文档页被截断，未取到）
- [ ] WXSS 对 `oklch()` 的具体支持情况（官方只承诺「大部分 CSS 特性」，未点名现代颜色函数）——**低版本安卓必测**
- [ ] Skyline 渲染引擎下 CSS 自定义属性与动画的差异
- [ ] `rich-text` / `towxml` 能否满足现有 Markdown 渲染 + 编号内嵌链接的实际效果
- [ ] 小程序类目资质：AI 对话类是否需要额外备案

---

## 参考

- [wx.request 官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html) — `RequestTask.onChunkReceived` 存在性已核实
- [WXSS 官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html) — 「具有 CSS 大部分特性」+ 属性选择器/带参伪类不支持的明确限制
- [Taro 官方文档](https://docs.taro.zone/docs/GETTING-STARTED) — 支持 React，编译至微信小程序
- 本仓库 `../qmuse/MIGRATION.md` — 同性质的平台迁移先例，体例可参照
