# AGENTS.md · weixin（微信小程序版）

本目录是 **GEO寻宝鼠微信小程序版**的工作区。**当前状态：仅有调研文档，尚未落地代码。**
落地方案见 [`README.md`](README.md)，本文件是给后续开发者的**硬约束**。

## 状态

- `README.md` — 可行性调研报告（平台约束 / 选型 / 资产映射 / 步骤 / 待确认清单）
- 代码：**尚未创建**。动手前请先复核 README 第九节「待确认清单」中的项，尤其是流式与 `oklch` 两项。

## 与主仓库的关系

- 主仓库（`../`）仍在迭代，小程序版是其**平台适配副本**，性质等同于 `../qmuse/`。
- 主仓库改动是否需要同步到小程序版，按 [`README.md`](README.md) 第四节的**资产映射表**判断：
  - **纯逻辑层可原样复用**：`src/i18n/`、`src/lib/linkify.ts`、`src/lib/evidenceBus.ts`
  - **需适配**：`src/services/*`（请求层 / 存储层）
  - **必须重写**：`src/components/**`、`src/routes/**`、`src/styles.css`、`src/components/ui/`
- ⚠️ **不要把主仓库的 React/DOM 组件直接拷进来**——小程序无 DOM，`@radix-ui/*` 全部不可用。

## 硬约束（动手后必须遵守）

1. **禁止 `oklch()`**：`src/styles.css` 现有 115 处，小程序低版本 WebView 不认，会整条声明失效。新增样式一律用 hex/rgb，亮暗双套走 CSS 自定义属性。
2. **禁止属性选择器 `[attr]` 与带参伪类**：官方明确不支持。只用类选择器。
3. **禁止 `window` / `document` / `localStorage`**：改用 `wx.*` 等价 API。存储用 `wx.getStorageSync` / `wx.setStorageSync`。
4. **网络**：合法域名必须 **HTTPS + 已备案**；不存在「同源反代」，接口需独立域名。
5. **分包意识**：主包上限 2MB。Markdown 渲染、高亮库等重依赖必须分包/按需加载。
6. **i18n 沿用主仓库约定**：文案走 `t("key")`，中英字典同步加，键数保持一致（主仓库现为 218 键，见 `../AGENTS.md`）。

## 体例参考

平台迁移的写法与「同步记录」体例，参照 `../qmuse/MIGRATION.md`：每轮同步记一条 `R<n> — 日期 — 源 commit`。
