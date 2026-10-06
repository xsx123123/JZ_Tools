# AGENTS.md · weixin（微信小程序版）

本目录是 **GEO寻宝鼠微信小程序版**的工作区。
落地方案见 [`README.md`](README.md)；**已落地的内容与踩坑见 [`MIGRATION.md`](MIGRATION.md)**；
本文件是给后续开发者的**硬约束**。

## 状态

- `README.md` — 可行性调研报告（平台约束 / 选型 / 资产映射 / 步骤 / 待确认清单）
- `MIGRATION.md` — **迁移记录**：文件级映射、已做/未做清单、实测结果、踩坑（已落地 R1 + R2）
- 代码：**已落地六轮**（Taro 4.3 + React 18），可 `npm run typecheck` / `npm run build:weapp`
- R2 已交付：dark 主题类绑定 + 顶栏切换、Markdown 渲染 + 编号内嵌链接（点击复制）、
  流式解析纯函数 `sseParse.ts` + `scripts/verify-stream.mjs`（10 case 全过）
- R3 已交付：文献证据链卡片（evidenceBus 全链路）、会话侧栏、使用统计弹窗、
  本机版排行榜抽屉（数据源差异见 MIGRATION.md R3）、桌宠（10 行为造型 webp + 入睡/探头状态 + CSS 帧动画，见 MIGRATION.md R6）。
  Web 版功能组件仅剩登录/云端同步未移植（待后端），`?theme=dark` 通道不需要（无 URL 概念）
- ⚠️ **尚未在微信开发者工具/真机跑过**：流式收帧、覆盖层手势、桌宠动画仍是最关键的未验证项
  （流式解析已被 Node harness 覆盖，见 MIGRATION.md R2），动手扩展前先跑一次。

## 常用命令

```bash
npm install
npm run build:weapp   # 编译到 dist/，再用微信开发者工具打开本目录
npm run dev:weapp     # watch 模式
npm run typecheck     # 必跑：键名/API 名写错会直接报错
```

## 与主仓库的关系

- 主仓库（`../`）仍在迭代，小程序版是其**平台适配副本**，性质等同于 `../qmuse/`。
- 同步时按 [`MIGRATION.md`](MIGRATION.md) 的文件级映射表判断「原样复制 / 改写 / 不迁移」。
- `src/i18n/locales/`、`src/lib/linkify.ts`、`src/lib/evidenceBus.ts` 是**可直接覆盖**的；
  `src/i18n/index.ts` 仅 3 个平台函数有差异，覆盖后需**回改这 3 处**（见 MIGRATION.md）。
- ⚠️ **不要把主仓库的 React/DOM 组件直接拷进来**——小程序无 DOM，`@radix-ui/*` 全部不可用。
- 每轮同步在 `MIGRATION.md` 追加一条 `R<n> — 日期 — 源 commit`。

## 硬约束（动手后必须遵守）

1. **禁止 `oklch()` / `color-mix()`**：⚠️ 不只在 CSS——`petStore.ts` 的成就渐变是**内联 JS 字符串**，
   容易漏（首次迁移就漏过一次）。改完用 `grep -rn "oklch(\|color-mix(" src/` 全类型扫一遍。
2. **禁止属性选择器 `[attr]` 与带参伪类**：官方明确不支持。只用类选择器；
   `:nth-child(even)` 这类改成渲染层打显式类名（如 `.row-even`）。
3. **禁止 `window` / `document` / `localStorage`**：存储一律走 `src/services/device.ts`；
   主题切换走 `applyTheme`（不要直接操作 DOM）。
4. **禁止 `fetch` / `getReader`**：网络走 `Taro.request`；流式走 `enableChunked` + `onChunkReceived`。
   注意请求头字段是 **`header`**（单数）。
5. **网络**：合法域名必须 **HTTPS + 已备案**；不存在「同源反代」，接口需独立域名。
6. **分包意识**：主包上限 2MB。当前 dist 约 444KB，接 Markdown 渲染库后需重新评估。
7. **i18n 沿用主仓库约定**：文案走 `t("key")`，中英字典同步加，键数保持一致（当前 225 键）。

## 踩坑速查（详见 MIGRATION.md「踩坑记录」）

- `babel-preset-taro` 未声明 `@babel/preset-react` 依赖 → 需手动装 **7.x**（8.x 会 ERESOLVE）
- 含 JSX 的文件必须是 `.tsx`（`app.ts` → `app.tsx`）
- Taro 不认 tsconfig `paths` → 需在 `config/index.ts` 配 `alias`
- 从主仓库拷 CSS 时，必须剥离 Tailwind v4 指令与 `@fontsource` 导入

