# 迁移记录 · weixin

> 记录每轮从主仓库到小程序版的同步。体例参照 `../qmuse/MIGRATION.md`：
> 每条记 `R<n> — 日期 — 源 commit`。

## R8 — 2026-10-06 桌宠设置面板行式重设计 + 连续体型/闲置自活动（源：主仓库 PetSettingsPanel 重写，参考 docs/2026-10-06_14.04.23.png）

### 本轮做了什么

对齐 Web 版设置面板的行式重设计：三档分段改为连续体型步进（72–240 步进 ±12，百分比读数），
新增「从桌面收起」（= 静默，switch 直控）与「闲置时自己活动」（idleAlive，关闭则闲置剧场
整体停演）两行，面板自身经 petBus 回同步桌宠侧改动（长按静默等）。i18n `pet.settings.*`
由 11 键变为 19 键（删 sizeS/sizeM/sizeL 与旧 quiet 文案，新增 close/sizeDesc/shrink/grow/
quiet(从桌面收起)/quietDesc/idle/idleDesc/reset/resetDesc/resetBtn/note），与主仓库逐字一致。

### 文件级结果

| 文件 | 处理 |
|---|---|
| `src/services/petStore.ts` | 删 `PET_SIZES` 三档常量；新增 `PET_SIZE_MIN/MAX/STEP/DEFAULT = 72/240/12/144`，`readPetSize`/`writePetSize` 改 clamp [72,240]（不再校验档位）；新增 `readPetIdleAlive`/`writePetIdleAlive`（key `seqout-pet-idle-alive`，默认 true）；`readPetAlways` 不变 |
| `src/lib/petBus.ts` | 加 `emitPetResetPos`/`onPetResetPos`（位置复位通道）。主仓库另有 typing 输入联动通道，属另一轮改造，本轮不同步 |
| `src/components/PetSettingsPanel.tsx` | 🔧 整体重写为行式设计（参考图同款）：标题栏 🐾+关闭 / 体型行（‹ › 步进 + 百分比读数，边界禁用）/ 从桌面收起 switch（on→emitPetQuiet / off→emitPetRecall）/ 闲置时自己活动 switch / 一直存在 switch / 底部找回阿寻通栏 + 宝藏计数 + 本机说明小字；面板 `useEffect` 订阅 settingsChanged 回同步 size/always/idleAlive/quiet |
| `src/components/TreasureMouse.tsx` | 加 `idleAlive` state + `idleAliveRef`；settingsChanged 监听加 `setIdleAlive(readPetIdleAlive())`；闲置剧场 effect 早退改 `quiet || !idleAliveRef.current`（整个闲置 interval 停演，含闲置自藏/入睡，与 Web 版单 effect 行为一致），deps 加 `idleAlive`；`toggleQuiet` 末尾加 `emitPetSettingsChanged()`（长按静默后面板「从桌面收起」开关回同步） |
| `src/components/pet.css` | `.petset*` 全部重写为行式体系（head/row/icon/main/divider/steppers/pct/foot/note，宽 600rpx ≈ 300px）；删三档分段与旧 always/quiet 样式；switch 尺寸微调（80×44rpx，行程 38rpx）；`.petset-dialog` 容器 max-width 620rpx |
| `src/i18n/locales/{zh,en}.ts` | `pet.settings.*` 块整段替换为与主仓库逐字一致（各 19 键；字典总数各 236 → 247，键数保持一致） |
| `src/pages/index/index.tsx` | 无改动（面板组件 API 不变，顶栏 ⚙️ 与弹层骨架复用 R7） |

### 差异决策（相对 Web 版）

- **「位置复位」行省略**：Web 版复位的是 pointer 拖拽产生的 pos（存 localStorage）；小程序版 R3 起
  桌宠位置固定在 CSS（right:24rpx/bottom:240rpx），无拖拽、无 pos 消费方，复位无可作用对象。
  `petBus` 仍保留 resetPos 通道与主仓库同名同形，日后加拖拽可无缝接上；i18n 三个 reset 键保留（键 parity）。
- **typing 输入联动不同步**：主仓库 petBus 的 `emitPetTyping`/`onPetTyping`（输入时桌宠竖耳跃动
  `pet-ears-perk`）与气泡轮播（cycleBubble/idleLineIdx）属另一轮改造，本轮不在清单内，未同步。
- **闲置自活动关闭时连带停掉闲置自藏**：Web 版隐藏/入睡/冒泡/探头在同一个闲置 interval 里，
  `!idleAlive` 早退整 effect——小程序版逐字对齐该行为（不是只停冒泡）。
- 面板宽 300px → 600rpx（750rpx 设计屏宽下 1:1）；宠物上方锚定，右缘对齐宠物右缘，手机屏不溢出。
- 步进按钮用字符 ‹ ›（Web 版 lucide Minimize2/Maximize2 无小程序等价），边界禁用用 `.petset__step--off`（opacity 0.35）。

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **776KB**（+8KB < 30KB 验收线） |
| 产物资源 | ✅ `index.wxss` 含 `petset__row` 新体系；`dist/common.js` 含「从桌面收起」/「Wander when idle」文案 |
| `node scripts/verify-stream.mjs` | ✅ 仍 11 case 全过 |
| `grep oklch(/color-mix(` | ✅ 0 |
| `grep window./document./localStorage/navigator./getReader` | ✅ 0 |
| i18n 字典 | ✅ zh/en 各 247 键（236+11），键数一致；`pet.settings.*` 19 键与主仓库逐字一致（脚本比对 identical） |

### 踩坑记录（本轮新增）

- 无新坑。注意与主仓库 locales 全量 diff 里有 about/auth/sidebar.compass 等 20+ 键差异，
  均为其他轮次的功能（关于页/自托管账号/侧栏指南等），勿在桌宠轮顺手「补齐」。

## R7 — 2026-10-06 桌宠设置面板（尺寸三档 / 一直存在 / 找回与静默）（源：主仓库 `src/components/pet/PetSettingsPanel.tsx` + `petBus.ts` + 桌宠 R7 改造）

### 本轮做了什么

对齐 Web 版桌宠「设置面板」功能：`petStore` 新增尺寸档位（96/144/192）与「一直存在」偏好，
新增迷你 pub/sub `petBus.ts`（设置变更 / 找回阿寻 / 静默三通道），新组件 `PetSettingsPanel`。
桌宠侧接入尺寸动态化（rpx 内联）、闲置 15s 自动隐藏（关闭「一直存在」时）、
常驻齿轮（替代 Web 版 hover 显现）与设置面板；顶栏加 ⚙️ 入口开同款面板（找回/静默经 petBus
直达桌宠，宠物被遮罩盖住也能响应）。i18n 新增 11 键 `pet.settings.*`（中英各 225 → 236）。

### 文件级结果

| 文件 | 处理 |
|---|---|
| `src/services/petStore.ts` | 加 `PET_SIZES`/`readPetSize`/`writePetSize`（key `seqout-pet-size`，默认 144）/`readPetAlways`/`writePetAlways`（key `seqout-pet-always`，默认 true），存储走 device 层，与 Web 版键名/默认值/校验口径一致（单位注释为 rpx） |
| `src/lib/petBus.ts` | ✅ 新增：与主仓库逐字一致（纯 TS 零平台依赖），on* 返回退订函数 |
| `src/components/PetSettingsPanel.tsx` | 🔧 改写：Taro View/Text；lucide 图标 → emoji（🐾/🔇）；原生 checkbox → 自绘 switch（View + `--on` 类切换，避免 CheckboxGroup 重量）；找回/大小/一直存在/静默/宝藏计数布局对齐 Web 版 |
| `src/components/TreasureMouse.tsx` | 🔧 接入 R7：`sizePref`/`always`/`hidden`/`panelOpen` state + `alwaysRef`；挂 onPetSettingsChanged（重读 size/always，always 为真清 hidden，更新 lastAct）/onPetRecall（清 stateTimer + 退出 quiet/hidden 回 idle）/onPetQuiet（进 quiet）；「有剧情开演收起面板」effect；事件 effect 开头 `setHidden(false)`；闲置 interval 加 `!always && 闲置>15s → hidden` 分支；`hidden` 时 return null；常驻 ⚙️ 齿轮挂宠物右上角（点开面板锚在宠物正上方，点开时顺带清气泡避免遮挡） |
| `src/pages/index/index.tsx` | 🔧 顶栏加 ⚙️ icon-btn；面板走既有弹层模式（`.dialog-wrap` + `.mask` 遮罩点击关闭，z-50），找回/静默不依赖宠物可见性 |
| `src/components/pet.css` | 加 `.pet__gear`（常驻半透，`:active` 全亮）/`.pet__panel`（锚宠物上方）/`.petset*` 全套（分段/自绘 switch/底部计数）；色值全走 var token |
| `src/i18n/locales/{zh,en}.ts` | 各加 11 键 `pet.settings.{gear,title,size,sizeS,sizeM,sizeL,always,alwaysDesc,quiet,recall,treasure}`，文案与主仓库逐字一致 |

### 差异决策（相对 Web 版）

- **hover → 常驻**：Web 版齿轮 `opacity-0 group-hover:opacity-100`；小程序无 hover → 常驻半透（0.85），`:active` 全亮。
- **尺寸单位与移动端封顶**：Web 版尺寸为 px 且移动端 `min(sizePref, 120)`；小程序版尺寸为 rpx（96/144/192rpx，
  CSS 默认 144rpx 不变），rpx 本就随屏宽缩放，标准屏 192rpx ≈ 96px < 120px 封顶线，故不再额外 cap
  （平板大屏可能略超，可接受）。
- **clampPos/拖拽**：Web 版 `clampPos(p, size)` 为 pointer 拖拽服务，小程序版 R3 起无拖拽，无调用点可补，省略。
- **checkbox → 自绘 switch**：小程序 Checkbox 需包 CheckboxGroup 才有样式语义，自绘 switch（仅类选择器）更轻。
- **顶栏面板形态**：Web 版顶栏是「点击捕捉层 + 按钮下方下拉」；小程序版复用 R3 既有 `.dialog-wrap`+`.mask`
  居中弹层模式（z-50），交互等价且与统计/排行榜弹窗一致。
- 宠物静默态（🐭 角落唤回钮）维持 R3 形态，与 Web 版 quiet 小圆钮语义一致。

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **768KB**（+8KB < 30KB 验收线） |
| 产物资源 | ✅ `dist/pages/index/index.wxss` 含 `petset`/`pet__gear`；`dist/common.js` 与 `index.js` 含「找回阿寻」/「treasures stashed」文案 |
| `node scripts/verify-stream.mjs` | ✅ 仍 11 case 全过 |
| `grep oklch(/color-mix(` | ✅ 0 |
| `grep window./document./localStorage/navigator./getReader` | ✅ 0 |
| i18n 字典 | ✅ zh/en 各 236 键（225+11），键数一致；`pet.settings.*` 11 键逐字对齐主仓库 |

### 踩坑记录（本轮新增）

- 无新坑。注意 rpx 内联样式写字符串（`` `${size}rpx` ``）直接透传，Taro 不做单位转换。

## R6 — 2026-10-06 桌宠 10 新造型 + 入睡/探头状态（源：主仓库 `src/components/pet/TreasureMouse.tsx` 多造型改造）

### 本轮做了什么

对齐 Web 版桌宠的新造型体系：造型从 base/dig/cheer 三图扩到 10 行为图，并新增
「45s 无互动入睡（互动即醒）」与「闲置探头张望」两个状态。i18n 零新增字典键——
`PetLines` 接口与台词表在 `src/i18n/index.ts`（非 locales 字典），新增 `wake` 一组
（中英各 3 条）；locales 字典维持各 225 键。

### 文件级结果

| 文件 | 处理 |
|---|---|
| `src/assets/pet/` | ✅ 从主仓库拷入 10 张 webp（shovel/night/sniff/sad/chest-open/wink/spin/crown/peek/sleep，共 ~183KB）。`mouse-sniff` 因小程序版无 `look` 状态未被引用，webpack 不打包，仅留源文件备用 |
| `src/components/TreasureMouse.tsx` | 🔧 改写：`PetState` 加 `peek`/`sleep`；`lastAct` ref（事件 effect / 戳 / 触摸开始 / 宝箱点击处更新）；事件 effect 开头更新 lastAct + sleep 先醒；闲置 interval 最前 sleep 早退、45s 入睡挂 "Zzz…"、概率分支尾加 `r<0.64 → transient('peek')`；戳睡眠中的宠物 = 爱心 + `L.wake` 台词不计连击；`imgSrc` 全量状态映射（digging→shovel、暗色→night、reveal→chest-open、miss→sad、poke→wink、spin→spin、celebrate→crown、peek→peek、sleep→sleep）；删 `IMG_DIG`/`IMG_CHEER` import |
| `src/components/TreasureMouse.tsx` 签名 | 加可选 `dark?: boolean` prop——替代 Web 版 MutationObserver（小程序禁 DOM），由页面根 View 同款 theme state 传入 |
| `src/pages/index/index.tsx` | 🔧 `<TreasureMouse event={petEvent} dark={theme === 'dark'} />` |
| `src/styles/theme.css` | 加 `pet-breathe` keyframes + `.pet-sleep`（3.2s 呼吸），并入 reduced-motion 清零清单 |
| `src/i18n/index.ts` | `PetLines` 接口 + 中英台词表各加 `wake: string[]`（与主仓库文案一致） |

### 差异决策（相对 Web 版）

- Web 版 12 状态含 `stow`/`walk`/`look`，小程序版维持 R3 的精简状态机（无 pointer 拖拽/散步），
  仅加 `peek`/`sleep`；`stow` 收尾动画、`walk` 散步、`look` 嗅探继续省略
  （`mouse-sniff.webp` 已拷入 assets，启用 `look` 时直接用）。
- dark 跟随：Web 版 MutationObserver 挂 `<html>.dark`；小程序版按 R2 既定模式由页面 theme state
  经 prop 传入，行为等价。

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **760KB**（+164KB，10 张 webp；距 2MB 主包上限余量充足） |
| 产物资源 | ✅ `dist/assets/pet/` 含全部 9 张被引用图；`dist/pages/index/index.js` 引用名逐一核对无误 |
| `node scripts/verify-stream.mjs` | ✅ 仍 11 case 全过 |
| `grep oklch(/color-mix(` | ✅ 0 |
| i18n 字典 | ✅ locales zh/en 各 225 键（本轮零新增）；`PetLines.wake` 中英各 3 条已同步 |

### 踩坑记录（本轮新增）

- ⚠️ Taro/webpack 对**未被引用的图片 import 不打包**（assets 目录里 sniff 缺失属预期），
  未使用的 import 会被 tree-shake——拷了图但没进 dist 先查是否真的有状态引用它。

## R5 — 2026-10-05 IdLink 新用户发现性提示（源：主仓库 lib/linkHint.ts + IdLink.tsx 同款）

### 本轮做了什么

对齐 Web 版刚实现的编号链接发现性提示：首个挂载的 IdLink 加下划线扫光动画（1.6s×3）+
上方气泡（6s 自动消失 / 点出 ActionSheet 即消失 / 全设备只出现一次）。i18n 新增 1 键
`idlink.hint`（中英各 224 → 225），小程序无 hover 故文案改为「点编号看对应文献 · 可追证据链」。

### 文件级结果

| 文件 | 处理 |
|---|---|
| `src/lib/linkHint.ts` | 新增：`consumeIdLinkHint()` 同款语义（会话内一次 + 本机永久一次），存储 key 与 Web 版一致（`geo-idlink-hint-shown`），走 device.ts 存储层 |
| `src/components/Markdown.tsx` | Markdown 层持 hint 状态（6s 定时器 + dismiss）；`hint`/`shineRef` 透传 InlineNodes → TextNodes；首个编号（一次渲染内先到先得）挂 `.id-link--hint`；点编号出 ActionSheet 即 dismiss |
| `src/components/markdown.css` | 加 `idlink-shine`/`idlink-bubble-in` keyframes、`.id-link--hint` 扫光（Web 版 color-mix 渐变 → rgba 等价色 + `.dark` 覆盖）、`.id-link-hint-bubble` 气泡（深色底白字 + 小三角，锚在 .md-body 顶部） |
| `src/i18n/locales/{zh,en}.ts` | 各加 1 键 `idlink.hint` |

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **596KB**（+8KB < 10KB 验收线） |
| `node scripts/verify-stream.mjs` | ✅ 仍 11 case 全过 |
| `grep oklch(/color-mix(` | ✅ 0 |
| i18n 字典 | ✅ zh/en 各 225 键，diff 为空 |

### 踩坑记录（本轮新增）

- ⚠️ 小程序 Text 内不能嵌 View，气泡无法像 Web 版那样贴着行内 `<span>` 定位 →
  锚在 `.md-body`（View，position:relative）顶部，视觉仍在首个编号附近。
- ⚠️ 「一次渲染内只给第一个编号挂扫光」不能用 state（循环中不触发重渲染），
  用 `useRef` 先到先得标记；dismiss 只发生在点击时，不能在渲染时调。

## R4 — 2026-10-05 下载加速推荐卡片（源：主仓库后端 seqout-chat 新增 polariseq SSE 事件）

### 本轮做了什么

后端在流式中新增 `{"event":"polariseq","accession":...}`（本轮调用过下载链接类工具时推送一次，
accession 可能为 null），前端在该轮助手消息下方渲染固定文案的 Polariseq 推荐卡片。
i18n 新增 7 键（`boost.*`），中英各 218 → 224 键，保持相等。

### 文件级结果

| 文件 | 处理 |
|---|---|
| `src/services/sseParse.ts` | `SseHandlers` 加 `onPolariseq`；解析链加 polariseq 分支（保持零平台依赖） |
| `src/services/seqoutChat.ts` | 无需改：`StreamHandlers` 是 `SseHandlers` 类型别名，自动透传 |
| `src/components/PolariseqCard.tsx` + `boost.css` | 新增：标题/项目主页（复制+toast）/说明/整块命令一键复制/accession 兜底 `PRJNA833659`，样式对齐 .card 体系 |
| `src/pages/index/index.tsx` | `UIMessage.boost` 字段 + `onPolariseq` 接线 + 渲染；卡片不随消息持久化（纯本轮 UI 反馈） |
| `src/i18n/locales/{zh,en}.ts` | 各加 7 键 `boost.{title,project,desc,note,copy,copied}` |
| `scripts/verify-stream.mjs` | 新增 case 11：polariseq 带 accession / accession:null / 缺省字段三种路径 |

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **588KB**（+4KB < 30KB 验收线） |
| `node scripts/verify-stream.mjs` | ✅ 11 case 全过（新增 polariseq case） |
| `grep oklch(/color-mix(` | ✅ 0 |
| i18n 字典 | ✅ zh/en 各 224 键，diff 为空 |

### 踩坑记录（本轮新增）

- 无新坑。注意 polariseq 帧不带 `delta`，解析链分支要放在 `typeof obj.error` 之前、且不干扰 cards/end。

## R3 — 2026-10-05 Web 版剩余功能组件移植（源：主仓库 commit `dc9845e`）

### 本轮做了什么

把 MIGRATION.md「已知未做」清单里的 5 块功能组件全部移植进小程序并接入 `index.tsx`：
文献证据链卡片、会话侧栏、使用统计弹窗、排行榜抽屉、桌宠。
i18n 再次零新增键——5 个组件的文案全部复用 Web 版字典已有键（`lit.*`/`sidebar.*`/`stats.*`/`board.*`/`pet.*`/`idlink.*`），中英维持各 218 键。

### 文件级结果

| 主仓库 | 小程序版 | 处理 |
|---|---|---|
| `src/components/chat/LiteratureCard.tsx` | `src/components/LiteratureCard.tsx` | 🔧 重写：骨架/摘要/建议检索词一致；原文链接（PubMed/DOI/OA）不能新窗口打开 → 统一「弹窗确认→复制」(`lib/copyLink.ts`)；附带 `requestCardLiterature`/`ncbiLink`（DatasetCard.tsx 的 LIT_KIND/buildLink 并入） |
| `src/services/literature.ts` | 同路径 | 🔧 重写：fetch→`Taro.request`（3s timeout 对齐 AbortController），去 Supabase 鉴权头；ok 10min / not_found 5min 进程内缓存保留 |
| `src/components/chat/SessionSidebar.tsx` | `src/components/SessionSidebar.tsx` | 🔧 重写：无 hover drawer → 「遮罩 + 左侧固定面板」；无登录入口，底部游客存储提示（`sidebar.guestNote`）；重命名用 Taro Input，删除走 showModal 二次确认 |
| `src/components/chat/UsageStatsDialog.tsx` | `src/components/UsageStatsDialog.tsx` | 🔧 重写：居中覆盖层弹窗（mask 点击关闭，无 Escape）；数据源同 Web 版（`GET <chatEndpoint>/stats`），四宫格 + 每工具条形图保留 |
| `src/components/chat/Leaderboard.tsx` | `src/components/Leaderboard.tsx` | 🔧 重写 + **数据源差异**：见下「差异决策」 |
| `src/components/pet/TreasureMouse.tsx`（470 行） | `src/components/TreasureMouse.tsx` | 🔧 重写（简化版）：见下「桌宠方案」 |
| `src/assets/pet/*.webp`（4 张，共 60KB） | `src/assets/pet/` | ✅ 原样拷贝（webp 小程序原生支持） |
| — | `src/components/panels.css` / `pet.css` / `lib/copyLink.ts` | ✅ 新增：覆盖层公共骨架（mask/drawer/dialog）+ 组件样式；桌宠布局样式（动画关键帧复用 theme.css R1 已转换的 .pet-*） |
| `src/pages/index/index.tsx` | 同路径 | 🔧 接线：顶栏 ☰/📊/🏆/主题/＋ 五个入口；底部简陋 sessions 列表删除；证据链总线监听渲染在宿主消息下方；数据卡片加「NCBI 链接 + 📖 文献」操作行；桌宠事件流（tool_start/cards/done/error） |
| `types/global.d.ts` | 同路径 | 🔧 补 `*.webp` 模块声明 |

### 差异决策（重要）

**1) 排行榜数据源**：Web 版登录榜来自 Supabase 云端（`user_stats` 表）。
小程序版无云端账号体系，且 AGENTS.md 硬约束禁止引入 Supabase（存储走 device.ts）。
决策：**做成本机版排行榜**——`statsStore.fetchLeaderboard()` 在 R1 已重写为本机统计
（等价 Web 版「离线模式」分支：登录榜恒空、默认落在「临时矿工」Tab、榜单只有本机访客一行）。
昵称修改/排序口径/奖牌/「我」高亮等交互完整保留，接口形状与 Web 版一致，日后接后端无缝替换。

**2) 桌宠方案**：Web 版 470 行依赖 pointer 拖拽、内联 SVG 宝石、DOM 动画、window 尺寸探测。
小程序不支持内联 SVG、无 pointer 事件体系。决策：
- 造型：3 张 webp 静态图（base/dig/cheer）按状态切换，`<Image>` + theme.css 已有 CSS 关键帧
  （idle 浮动/挖掘/跳跃/转圈/庆祝/土堆/尘土/爱心/星尘/横幅，R1 已从主仓库转换好）
- 状态机与事件协议和 Web 版完全一致（`makePetEvent` 的 seq 去重、cards/done 重复计数防护、
  成就里程碑一次性庆祝、点按 poke 三连击彩蛋、宝箱库存播报、长按 600ms 静默）
- **省略**：拖拽移动与闲置散步动画（无 pointer 体系，价值/成本比低）；SVG 宝石改 emoji 💎

**3) IdLink 交互升级**（R2 的后续）：点击编号 → ActionSheet「复制链接 / 查看证据链」，
不再只是复制——证据链请求经 evidenceBus 抛给页面层，文献卡片渲染在宿主消息下方（对齐 Web 版）。

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **584KB**（+124KB：4 张 webp 60KB + 组件代码/样式），< 1.5MB 验收线 |
| `node scripts/verify-stream.mjs` | ✅ 仍 10 case 全过 |
| `grep oklch(/color-mix(` | ✅ 0 |
| `grep localStorage/window./document./navigator./getReader` | ✅ 0 |
| i18n 字典 | ✅ zh/en 各 218 键，零新增 |
| 微信 API 人工审查 | showActionSheet/showModal/Input focus/ScrollView scrollY/Image mode='aspectFit'/fixed 定位均为微信基础能力，Taro 4.3 类型齐全；真机效果仍待开发者工具实测 |

### 踩坑记录（本轮新增）

- ❌ `.pet__bubble` 同时挂定位 transform（translate(-50%)）和 `.pet-bubble` 入场动画会**互相覆盖**
  （animation fill 终态 transform:none 吃掉定位）→ 定位与动画必须拆内外两层节点。
- ❌ Taro `Input` 的 `focus` 属性可自动聚焦，但**不能**用 `autoFocus`（DOM 概念，小程序不认）。
- ⚠️ `showActionSheet` 的 `fail` 回调在用户取消时也会触发（errMsg cancel），必须吞掉不算错误。
- ⚠️ Input 放在 `Text` 里不合法（Text 只能嵌套 Text）——带输入框的行都用 View 作容器。
- ⚠️ 昵称浮层在抽屉（fixed z-45）之上，需再高一档（z-60）+ 自己的 mask。

## R2 — 2026-10-05 核心聊天体验补齐（源：主仓库 commit `dc9845e`）

### 本轮做了什么

在 R1 骨架上补齐三块核心体验：dark 主题真正生效（根节点类绑定 + 顶栏切换按钮）、
轻量 Markdown 渲染（含 GSE/GSM/GO:/PMID 编号内嵌链接）、流式解析逻辑的 Node 验证 harness。
i18n 零新增键（主题按钮复用 `header.themeLight/Dark`，复制确认复用 `idlink.copyId` / `board.cancel`），
中英维持各 218 键。

### 文件级结果

| 主仓库 | 小程序版 | 处理 |
|---|---|---|
| `src/components/chat/Markdown.tsx`（react-markdown+rehype） | `src/components/Markdown.tsx` + `markdown.css` | 🔧 重写：手写块级切分+行内递归解析，Taro View/Text 渲染；语法子集=段落/粗体/斜体/行内代码/代码块/列表/标题/引用/分隔线/链接；编号经 `linkify.scanText` 切分渲染成 IdLink |
| `src/components/chat/IdLink.tsx`（HoverCard/Popover） | （并入 `Markdown.tsx` 的 `IdLinkText`） | 🔧 重写：小程序无 hover/新窗口打开 → 点击 showModal 展示原始页地址，确认后 `Taro.setClipboardData` 复制链接 |
| `src/services/seqoutChat.ts` 内联解析器 | `src/services/sseParse.ts`（新增） | 🔧 抽纯函数：TextDecoder 累积/按行切分/flush 冲刷，零平台依赖，Node 可直接 import（Node 24 原生 strip-types） |
| — | `scripts/verify-stream.mjs`（新增） | ✅ 10 个 case：整帧单 chunk / 一帧拆 2~3 chunk / 两帧共 chunk / flush 半帧冲刷 / flush 完整帧 / 多字节 UTF-8 跨 chunk 切断 / 全事件序列 / error 帧 / CRLF / 空 delta |
| `src/routes/index.tsx` 的 `toggleTheme` | `src/pages/index/index.tsx` | 🔧 根 View 绑 `theme === 'dark' ? 'chat dark' : 'chat'`，顶栏加 ☀️/🌙 切换按钮；持久化走 `petStore.readTheme/writeTheme`（→ device 存储层） |
| `src/styles.css` 的 `@theme inline` 别名 | `src/styles/theme.css` | 🐞 **R1 补漏**：`--color-*` 别名随 Tailwind 指令被剥掉，全文 `var(--color-*)` 悬空 → 手写 26 条别名进 `:root`（惰性求值，`.dark` 自动生效） |
| `src/pages/index/index.css` | 同路径 | 🔧 全部硬编码 hex 改语义变量（--background/--card/--helix...），dark 由根节点 `.dark` 驱动 |
| `src/services/seqoutChat.ts` | 同路径 | 🔧 解析器改引 sseParse；success 兜底：基础库不触发 onChunkReceived 时整块响应体喂解析器 |

### 验证结果（本轮实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 通过 |
| `npm run build:weapp` | ✅ Compiled successfully，dist **460KB**（+16KB，距 2MB 主包上限余量充足） |
| `node scripts/verify-stream.mjs` | ✅ 10 case 全过（Node v24.11.0，原生跑 .ts 无需 flag） |
| `grep oklch(/color-mix(` | ✅ 0（注释里的字样也清掉了，grep 字面 0） |
| `grep localStorage/window./document./navigator./getReader` | ✅ 0（全是注释提及，已改写措辞） |
| i18n 字典 | ✅ zh/en 各 218 键，零新增 |
| `onChunkReceived` API 人工审查 | `Taro.request` 返回 RequestTask、`enableChunked`/`responseType:'arraybuffer'`/`task.onChunkReceived(res=>res.data)` 与微信文档一致；真机流式仍待开发者工具实测（见下） |

### 踩坑记录（本轮新增）

- ❌ **R1 暗雷**：`--color-*` 别名是 Tailwind v4 `@theme inline` 自动生成的，R1 剥 Tailwind 指令时一起丢失，
  导致 theme.css 全文 `var(--color-*)` 悬空（R1 只验了 `--primary` 写出，没验引用侧）。
  网页版行为依赖「自定义属性使用点惰性求值」：别名只写 `:root`，`.dark` 重定义底层 token 即自动换色。
- ❌ 验收 grep 是**字面匹配**：注释里写 `window.open` / `oklch()` 这类字样也会命中。文案措辞要避开字面量
  （写「网页版新窗口打开」「oklch 色彩函数」）。
- ❌ tsconfig target=ES2017：正则 `s`（dotAll）flag 报 TS1501 → 用 `[^]` 代替 `.` 跨行匹配。
- ⚠️ Taro React 页面里 `applyTheme` 的 `setData({ __theme })` 只更新 page data，**不参与 React 渲染**；
  真正生效的是根 View 的 className 绑定（setData 保留作数据层同步/排查）。页面背景色靠 `.chat` 的
  100vh 全覆盖，page 元素本身的背景不参与视觉。
- ⚠️ `node scripts/verify-stream.mjs` 依赖 Node ≥22.6 的 type stripping（本机 v24.11 直接跑 .ts）；
  engines 写的 `>=18` 对该脚本不成立，已在脚本头注释标明。

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
