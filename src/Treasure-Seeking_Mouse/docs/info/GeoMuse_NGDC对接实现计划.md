# GeoMuse × NGDC 原生对接实现计划（v1）

> 目标：三件事——① 新增 NGDC 原生工具层（GWH + GenBase 官方 API，工具 #27–31）；② GSA / GSA-Human 访问级别标注与 DAC 申请跳转；③ SRA 编号查询优先返回 GSA 国内镜像链接。
> 状态：接口规格已实测验证（2026-10-07，curl 直连 `ngdc.cncb.ac.cn` API 端点均返回正常数据，无 JS 反爬拦截；HTML 页面才有反爬，本计划不触碰任何 HTML 抓取）。
> 施工方式：代码不在本对话，交给编码 Agent（kimi code / Claude Code）按 §8 提示词施工。

---

## 0. 背景结论（调查摘要）

| 库 | 官方公开 API | 实测 | 说明 |
|---|---|---|---|
| GWH (Genome Warehouse) | 有，REST，无鉴权 | 通过 | `https://ngdc.cncb.ac.cn/gwh/api/public/` 下 3 个已确认端点（assembly / bioProject / bioSample），文档页称共 4 个，实现时以 api_documents 页面为准 |
| GenBase | 有，REST，无鉴权 | 通过 | `/genbase/api/file/fasta?acc=` 与 `/genbase/api/file/gbf?acc=` |
| GSA / GSA-Human | 无公开搜索 API | 不爬 | 官方明确"暂无法通过 API 查询下载"；整站 JS 反爬；受控数据走 DAC 人工审核，设计上无程序化通道 |
| GSA 文件下载 | 直连 | 通过 | `download.cncb.ac.cn` 无反爬，可 wget；另可内置 EdgeTurbo 客户端（本期不强制） |

参考：GWH API 文档 https://ngdc.cncb.ac.cn/gwh/api_documents ；GenBase REST 文档 https://ngdc.cncb.ac.cn/genbase/restapihelp ；GenBase 论文（GPB 2024）确认 REST API + FTP（download2.cncb.ac.cn/genbase/daily/）。

---

## 1. 现状架构（施工前必须知道的两层）

GeoMuse 的工具能力存在两层，新增工具**两层都要改，且保持同名同参数**：

**Layer A：seqout-mcp（Python，MCP Server）**
- `src/seqout-mcp/src/seqout_mcp/tools/{search,project,sample,stats}.py`：每个模块导出 `TOOLS: list[ToolSpec]`（声明式：name / path / doc / params / resolver / transform / summary）。
- `tools/__init__.py`：`ALL_SPECS = search.TOOLS + project.TOOLS + sample.TOOLS + stats.TOOLS`，`register_all()` 注册。
- `client.py`：`SeqoutClient.request()` 用 httpx 请求 `{SEQOUT_BASE_URL}{path}`，自带 429/5xx 重试、非 JSON 检测。

**Layer B：GeoMuse 聊天后端（TS/JS，OpenAI function-calling）**
- `src/Treasure-Seeking_Mouse/functions/seqout-chat/index.ts`（Deno/Supabase Edge Function，65KB）与 `qmuse/qmuse-app/functions/seqout-chat/src/main.js`（QMuse 云函数）各有一份**平行实现**，内容需同步改。
- 工具声明在头部 `TOOL_DEFS` 数组（`tool(name, description, properties, required)` 工厂函数）；执行走 `seqoutGet(path, params)` → `new URL(SEQOUT_BASE_URL + path)`。
- 人设规则在 `prompts/system-zh.md` / `system-en.md`，由 `npm run sync:prompts` 生成 `prompts.generated.ts`，**禁止手改 generated 文件**。
- 测试：`src/seqout-mcp/tests/`（pytest，httpx mock）、`functions/seqout-chat/tests/*.test.mjs`。

**关键改造点**：现有 `client.request()` 和 `seqoutGet()` 都默认打 seqout.org。NGDC 工具要打 `https://ngdc.cncb.ac.cn`，两处都要支持**绝对 URL 直传**（path 以 `http` 开头时不再拼接 base_url）。

---

## 2. 功能一：NGDC 原生工具层（5 个新工具）

### 2.1 API 规格（已实测）

**GWH**（GET，返回 JSON，无鉴权）：
- `https://ngdc.cncb.ac.cn/gwh/api/public/assembly/{GWH_accession}` → 组装元数据 + `ftpPathDna / ftpPathGff / ftpPathRna / ftpPathCds / ftpPathProtein / ftpPathFeature`（均为 download.cncb.ac.cn 直链）+ bioproject/biosample 关联编号 + 发表文献。
- `https://ngdc.cncb.ac.cn/gwh/api/public/bioProject/{PRJCA_accession}` → 项目标题、描述、数据类型、提交单位、物种。
- `https://ngdc.cncb.ac.cn/gwh/api/public/bioSample/{SAMC_accession}` → 样本属性（组织、品系、发育阶段等）、物种谱系、提交单位。
- 注：文档页 https://ngdc.cncb.ac.cn/gwh/api_documents 实际列出以上 3 个端点（介绍文字称"four APIs"，施工时打开页面核对，若有第 4 个端点一并封装）。

**GenBase**（GET，返回纯文本/字节流，无鉴权）：
- `https://ngdc.cncb.ac.cn/genbase/api/file/fasta?acc={C_xxxxxx.x}` → FASTA
- `https://ngdc.cncb.ac.cn/genbase/api/file/gbf?acc={C_xxxxxx.x}` → GenBank flatfile

实测示例：`C_AA004835.1` 秒回 FASTA。

### 2.2 工具设计（前缀用 `ngdc_`，与 `seqout_` 命名空间区分）

| 工具名 | 参数 | 返回 |
|---|---|---|
| `ngdc_get_gwh_assembly` | `accession` (string, 必填, 正则 `^GWH[A-Z0-9]+$`) | 物种、组装名/级别、关联 PRJCA/SAMC、6 个文件直链、文献与 DOI、释放时间 |
| `ngdc_get_gwh_project` | `accession` (string, 必填, `^PRJCA\d+$`) | 标题、描述、数据类型、提交单位、物种、释放时间 |
| `ngdc_get_gwh_sample` | `accession` (string, 必填, `^SAMC\d+$`) | 样本名、类型、属性表（tissue/cultivar/disease 等非空字段）、物种学名 |
| `ngdc_get_genbase_sequence` | `accession` (string, 必填, `^C_[A-Z]{2}\d+\.\d+$`)；`format` (enum: fasta/gbf, 默认 fasta) | **截断预览**：返回 FASTA header + 前 2000 字符序列 + 总长度估算 + 完整文件直链；GBF 返回前 2000 字符 + 直链。**严禁把完整大文件灌进 LLM 上下文** |
| `ngdc_get_gsa_mirror` | `accession` (string, 必填, SRP/SRR/PRJNA/GSE 均可) | 见功能三 |

返回风格对齐现有工具：`encode_result(summary=..., data=...)`（Layer A）、`{ text, cards, tools }`（Layer B）。

### 2.3 代码落点

**Layer A（seqout-mcp）**
1. 新建 `src/seqout_mcp/tools/ngdc.py`：5 个 ToolSpec（GWH 三个走 path 参数替换即可复用现有机制；GenBase 需新 transform：把文本响应截断为预览 + 直链，建议加 `transform: "genbase_preview"` 并在 `services/search.py` 注册）。
2. `tools/__init__.py`：`ALL_SPECS = ... + ngdc.TOOLS`。
3. `client.py`：`request()` 支持绝对 URL（`if path.startswith(("http://","https://")): url = path else: url = base+path`）；对 ngdc 域名 404 时给出友好错误（accession 不存在或尚未释放）。
4. accession 校验复用 `client.validate_sample` 的模式，在 `accessions.py` 新增 GWH/PRJCA/SAMC/C_ 正则。
5. 测试：`tests/test_mcp_core.py` 增补 5 个工具的 mock 用例（含 404、非 JSON、截断逻辑）。

**Layer B（聊天后端，index.ts 与 main.js 同步）**
1. `TOOL_DEFS` 追加 5 个 `tool(...)` 声明，描述与 Layer A 的 `doc` 一致（中文）。
2. 新增 `ngdcGet(url)`：与 `seqoutGet` 相同但接受绝对 URL、携带 `Accept: application/json,text/plain`；404 映射为「编号不存在或数据未释放」；超时 30s。
3. tool-calling 分发 switch/map 增加 5 个分支。
4. `prompts/system-zh.md` 与 `system-en.md` 增加规则（见 §2.4），然后 `npm run sync:prompts` 重新生成。
5. 测试：`tests/` 下新增 ngdc 工具的 mock 用例。

### 2.4 系统提示词新增规则（zh 版示例，en 版同步）

```
13. NGDC 原生工具：用户给 GWH/PRJCA/SAMC 编号或问"基因组组装/参考基因组/组装文件下载"时，
依次使用 ngdc_get_gwh_assembly / ngdc_get_gwh_project / ngdc_get_gwh_sample；
给 C_ 开头的基因序列编号时用 ngdc_get_genbase_sequence。这些工具直连国家基因组科学数据中心
（NGDC）官方接口，返回的 download.cncb.ac.cn 链接是国内直链。
14. 引用规范：正文提到 GSA 数据时说明来源为"国家基因组科学数据中心 GSA"；
遇到 HRA 开头编号或标注 controlled 的数据，说明这是 GSA-Human 受控数据，需 PI 身份经
BIGSSO 登录并向 DAC 提交申请（https://ngdc.cncb.ac.cn/gsa-human/），本平台不提供受控数据下载。
```

（注意保持现有排版规范：不用破折号；规则编号顺延。）

### 2.5 验收标准

- `pytest src/seqout-mcp/tests` 全绿；MCP 客户端能列出并调用 31 个工具。
- 聊天后端：`PRJCA000437` → 返回项目卡片；`GWHAAAA00000000` → 返回组装卡片含 6 个直链；`C_AA004835.1` → 返回序列预览 + 直链；错误编号 → 友好报错。
- 两个人后端文件 diff 对齐（工具名、参数、描述一致）。

---

## 3. 功能二：GSA / GSA-Human 访问级别标注与 DAC 跳转

不改检索逻辑，只改**表达层**：

1. **system prompt 规则**（已在 §2.4 规则 14 覆盖一半），另加卡片引导：
   - 命中 CRA/CRR 编号：标注「GSA 公开数据，国内可通过 download.cncb.ac.cn 高速直连」。
   - 命中 HRA 编号或 seqout 返回 `controlled` 标记：标注受控，给出 DAC 申请入口 https://ngdc.cncb.ac.cn/gsa-human/ ，并说明需 PI 身份 + BIGSSO 登录 + 数据管理委员会人工审核，平台不提供该数据下载，不编造申请结果。
2. **前端卡片 badge（可选，本期可做最小版）**：在数据卡片组件（`src/` 下渲染 seqout 卡片的组件）对 `source === 'gsa'` 的条目加「国内镜像」角标，对 `accession` 以 `HRA` 开头或 `controlled === true` 的条目加「受控数据」角标并附 DAC 链接。先只做角标 + 链接，不做跳转后的流程。
3. **About 页**（`src/routes/about.tsx`）：数据库列表 GEO·SRA·ArrayExpress·ENA·GSA·DRA·GEA 保持，补一句 GSA/GSA-Human 访问政策说明。

验收：对话问「HRA000001 能下载吗」→ 回答受控说明 + DAC 链接，且不出现任何下载直链。

---

## 4. 功能三：SRA 编号 → GSA 国内镜像优先

### 4.1 设计

新增工具 `ngdc_get_gsa_mirror`（Layer A/B 同步）：

- 输入：`accession`（SRP/SRR/PRJNA/GSE，大小写不敏感）。
- 行为：
  1. 先复用 seqout 既有能力反查（resolve GSE→SRP 等，现有 `resolve_study` 逻辑）。
  2. 调 seqout.org 的 GSA 搜索通道检索该编号（施工第一步：**先探测** `GET https://seqout.org/api/search?q=<acc>` 或 accession-resolve 通道对 GSA 库的覆盖，确认能按 SRR/SRP 命中 GSA 镜像条目；探测结果决定第 3 步的实现方式，探测不到就在交付物里如实写明降级方案）。
  3. 命中：返回 `{ sra_accession, gsa_cra, gsa_crr[], mirror_urls[], gsa_browse_url }`，其中 `mirror_urls` 形如 `https://download.cncb.ac.cn/gsa/<CRA>/<CRR>/<file>`，browse 为 `https://ngdc.cncb.ac.cn/gsa/browse/<CRA>`。
  4. 未命中：返回 `mirrored: false`，正文回落到 NCBI/ENA 原始链接，不编造镜像。
- 系统提示词规则：用户给 SRR/SRP 编号时，正常检索后调用 `ngdc_get_gsa_mirror`；若镜像存在，在结果末尾以「国内 GSA 镜像」小节列出，并说明国内网络下镜像通常更快；无镜像则一句话说明「该数据暂无 GSA 镜像」。

### 4.2 红线

- 只通过 seqout.org 通道拿镜像信息，**不直接请求 ngdc.cncb.ac.cn 的搜索接口**（无公开 API 且有反爬）。
- 镜像链接必须来自检索结果或明确的 URL 拼接规则（download.cncb.ac.cn 路径规律），拼不出就返回 null，不猜。

### 4.3 验收

- 输入 `SRRxxxx`（选一个已知被 GSA 镜像的公共数据，施工时用真实编号验证）：返回镜像小节；输入一个无镜像编号：如实返回无镜像。
- 单测覆盖命中/未命中/非法编号三分支。

---

## 5. 里程碑拆分

| 里程碑 | 内容 | 预估 |
|---|---|---|
| M1 | Layer A 五个工具 + 测试（seqout-mcp） | 0.5–1 天 |
| M2 | Layer B TOOL_DEFS + ngdcGet + 系统提示词（两个后端文件同步）+ 测试 | 1 天 |
| M3 | 功能二文案 + 卡片角标 + About 页 | 0.5 天 |
| M4 | 功能三（含 seqout GSA 覆盖探测） | 0.5–1 天 |
| M5 | 端到端验收（§2.5 / §3 / §4.3 清单）+ README/DETAILED_README 工具数 26→31 的同步修改 | 0.5 天 |

README 中 "26 omics data-retrieval tools" 等表述全部要改成 31，两处 README（英文/中文）+ DETAILED_README.md + 白皮书如有提及。

---

## 6. 风险与注意事项

1. **不碰 GSA 网页抓取**：ngdc.cncb.ac.cn 的 HTML 页面有 JS 反爬挑战（实测 curl 带 Cookie 仍被拦），任何"爬 GSA 搜索页"的方案都排除；本计划所有 NGDC 直连仅限官方文档化的 API 端点（实测可通）。
2. **GSA-Human 不做下载**：受控数据走 DAC 人工审核，产品只提供说明与跳转，不承诺、不暗示可程序化获取（人类遗传资源合规红线）。
3. **大序列不灌上下文**：GenBase 返回必须截断预览 + 直链，防止整基因组 FASTA 撑爆 LLM 上下文。
4. **礼貌访问**：NGDC 公共端点虽无明确配额，仍保持现有 30s 超时与 429/5xx 重试即可，不加并发。
5. **风格规范**：系统提示词新增文本沿用现有规范（无破折号、简体中文、编号顺延），英文版同步。
6. **两层同步**：index.ts 与 main.js 必须同 diff 检查；`prompts.generated.ts` 只能由 sync:prompts 生成。

---

## 7. 文件改动清单（给编码 Agent 的 check-list）

```
src/seqout-mcp/src/seqout_mcp/accessions.py      + GWH/PRJCA/SAMC/C_ 正则
src/seqout-mcp/src/seqout_mcp/client.py          + 绝对 URL 支持、ngdc 404 文案
src/seqout-mcp/src/seqout_mcp/tools/ngdc.py      新增（5 个 ToolSpec + genbase_preview transform）
src/seqout-mcp/src/seqout_mcp/tools/__init__.py  + ngdc.TOOLS
src/seqout-mcp/src/seqout_mcp/services/search.py + "genbase_preview" transform
src/seqout-mcp/tests/test_mcp_core.py            + 5 组用例
src/Treasure-Seeking_Mouse/functions/seqout-chat/index.ts        + TOOL_DEFS×5、ngdcGet、分发、统计埋点
src/Treasure-Seeking_Mouse/qmuse/qmuse-app/functions/seqout-chat/src/main.js  同上（同步）
src/Treasure-Seeking_Mouse/functions/seqout-chat/prompts/system-zh.md  +规则13/14/15
src/Treasure-Seeking_Mouse/functions/seqout-chat/prompts/system-en.md  英文同步
src/Treasure-Seeking_Mouse/functions/seqout-chat/tests/          + ngdc 用例
前端数据卡片组件（src/ 下渲染卡片处）           + GSA 镜像/受控角标（M3，可选最小版）
src/routes/about.tsx                             + GSA 访问政策一句（M3）
README.md / docs/README.zh-CN.md / docs/DETAILED_README.md  工具数 26→31
```

---

## 8. 交给编码 Agent 的提示词（完整可复制）

```text
你在仓库 xsx123123/JZ_Tools 施工。任务：为 GeoMuse 增加 NGDC 原生对接能力，三件事，分两个代码层同步实现：

【背景】
GeoMuse 工具能力有两层，必须同名同参同步改：
A. src/seqout-mcp（Python MCP Server）：tools/ 各模块导出 TOOLS: list[ToolSpec]，
   tools/__init__.py 聚合成 ALL_SPECS；client.py 的 SeqoutClient.request() 请求 {SEQOUT_BASE_URL}{path}。
B. 聊天后端（OpenAI function-calling）：src/Treasure-Seeking_Mouse/functions/seqout-chat/index.ts
   与 src/Treasure-Seeking_Mouse/qmuse/qmuse-app/functions/seqout-chat/src/main.js 是平行实现，
   工具在头部 TOOL_DEFS 用 tool(name, description, properties, required) 声明，执行走 seqoutGet()。
人设规则在 prompts/system-zh.md 和 system-en.md，改完必须 npm run sync:prompts 重新生成
prompts.generated.ts（禁止手改 generated 文件）。

【第一步：接口验证（先探测再写码）】
用 curl 验证以下官方端点并记录响应结构，作为写解析代码的依据：
- https://ngdc.cncb.ac.cn/gwh/api/public/assembly/GWHAAAA00000000
- https://ngdc.cncb.ac.cn/gwh/api/public/bioProject/PRJCA000437
- https://ngdc.cncb.ac.cn/gwh/api/public/bioSample/SAMC012932
- https://ngdc.cncb.ac.cn/genbase/api/file/fasta?acc=C_AA004835.1
- https://ngdc.cncb.ac.cn/genbase/api/file/gbf?acc=C_AA004835.1
- https://ngdc.cncb.ac.cn/gwh/api_documents （核对是否还有文档页未列出的第 4 个端点）
另外探测 seqout.org 是否支持按 SRR/SRP 编号检索 GSA 镜像：
- https://seqout.org/api/search?q=SRR25660662 及其 GSA 库过滤参数（先跑通现有 26 个工具对应的端点，
  确认 GSA 覆盖和响应里是否含 download.cncb.ac.cn 镜像链接），把探测结论写进交付注释。
禁止：抓取 ngdc.cncb.ac.cn 任何 HTML 页面（有 JS 反爬，且不在官方 API 文档内的接口一律不用）。

【第二步：实现 5 个新工具（两层同名同参）】
1. ngdc_get_gwh_assembly(accession: str) — 正则 ^GWH[A-Z0-9]+$，返回组装元数据 + 6 个
   download.cncb.ac.cn 文件直链 + 关联 PRJCA/SAMC + 文献。
2. ngdc_get_gwh_project(accession: str) — ^PRJCA\d+$，返回标题/描述/数据类型/提交单位/物种。
3. ngdc_get_gwh_sample(accession: str) — ^SAMC\d+$，返回样本名/类型/非空属性字段/物种学名。
4. ngdc_get_genbase_sequence(accession: str, format: "fasta"|"gbf" = "fasta") —
   ^C_[A-Z]{2}\d+\.\d+$；响应是纯文本，必须截断：返回前 2000 字符 + 完整直链
   （https://ngdc.cncb.ac.cn/genbase/api/file/{format}?acc={acc}），严禁整文件入上下文。
5. ngdc_get_gsa_mirror(accession: str) — 输入 SRP/SRR/PRJNA/GSE；先复用现有 resolve 逻辑，
   再经 seqout.org 检索 GSA 库；命中返回 {sra_accession, gsa_cra, gsa_crr[], mirror_urls[],
   gsa_browse_url}，mirror_urls 为 download.cncb.ac.cn/gsa/... 直链；未命中返回 {mirrored:false}。
   若第一步探测确认 seqout 不支持按 SRR 反查 GSA，则该工具如实返回 unsupported 并在报告中说明，
   不得伪造镜像。

【第三步：访问层改造】
- client.py / seqoutGet：path 以 http 开头时按绝对 URL 请求，不拼 base_url；对 ngdc 域名 404
  返回友好文案「编号不存在或数据未释放」。
- Layer A 新增 tools/ngdc.py，并在 services/search.py 注册 "genbase_preview" transform
  （文本截断 + 直链包装）；accessions.py 增加 4 个新正则；__init__.py 接入 ngdc.TOOLS。
- 聊天后端：TOOL_DEFS 追加 5 个声明；分发逻辑加分支；usageStats 埋点复用现有机制。

【第四步：人设与文案】
system-zh.md / system-en.md 规则编号顺延追加三条（简体中文/英文同步，禁止破折号）：
- GWH/PRJCA/SAMC/C_ 编号分别走对应 ngdc_ 工具，说明数据来自国家基因组科学数据中心，链接为国内直链。
- 命中 CRA/CRR 标注 GSA 公开数据可国内直连；命中 HRA 或 controlled 标记时说明是 GSA-Human
  受控数据，需 PI 身份 BIGSSO 登录并向 DAC 申请（https://ngdc.cncb.ac.cn/gsa-human/），
  平台不提供受控数据下载。
- 用户给 SRR/SRP 编号时检索后调用 ngdc_get_gsa_mirror，有镜像则在结果末尾加「国内 GSA 镜像」
  小节；无镜像一句话说明。
改完运行 npm run sync:prompts。
前端（可选最小实现）：数据卡片对 source 为 gsa 的加「国内镜像」角标，对 HRA 开头或 controlled
的加「受控数据」角标并链接到 gsa-human 页面；src/routes/about.tsx 补一句 GSA 访问政策。

【第五步：测试与文档】
- pytest src/seqout-mcp/tests 全绿，新增 5 组工具用例（mock httpx：正常/404/非 JSON/截断/无镜像）。
- 聊天后端 tests/ 增补对应用例。
- README.md、docs/README.zh-CN.md、docs/DETAILED_README.md 中 "26 tools" 相关表述改为 31。
- index.ts 与 main.js 用 diff 核对工具声明一致。

【验收】
PRJCA000437 / GWHAAAA00000000 / C_AA004835.1 三个编号在聊天界面各返回正确卡片；
「HRA000001 能下载吗」只返回受控说明与 DAC 链接；任选一真实 SRR 验证镜像工具；
错误编号返回友好报错。交付时附：探测结论、改动文件清单、测试结果。
```

---

## 附录 A：NGDC 首页全部数据资源 API 普查（2026-10-07 实测）

探测方法：逐一访问各库的 `api_documents` / `restapihelp` 等候选文档路径，并对文献中出现的端点做 content-type 验证；NGDC 全站存在请求频率限制（实测触发 429 "Too Many Requests"，application/json 返回），任何对接都必须保持低频串行。

### A.1 热门数据资源（截图第一屏，15 个）

| 资源 | 公开 API | 结论与替代通道 |
|---|---|---|
| BioProject | ✅ 有 | GWH 官方 `bioProject` 端点（本计划已封装） |
| BioSample | ✅ 有 | GWH 官方 `bioSample` 端点（本计划已封装） |
| GSA | ⚠️ 无 | 官方无公开 API；走 seqout 通道 + download.cncb.ac.cn 直连 + EdgeTurbo（本计划功能一/三） |
| GSA-Human | ❌ 无 | 受控数据走 DAC 人工审核，设计上无程序化通道；只做标注与跳转（本计划功能二） |
| GenBase | ✅ 有 | 官方 REST `/genbase/api/file/{fasta,gbf}`（本计划已封装） |
| GWH | ✅ 有 | 官方 `/gwh/api/public/`（本计划已封装） |
| GVM | ⚠️ 无 | 无 api_documents 页；`getProjectDetail` 等端点实测返回 HTML 而非 JSON；变异数据（VCF/FASTA）可从 GVM 下载页/FTP 获取，不建议程序解析网页 |
| OMIX | ❌ 无 | 多元数据汇交平台，无公开 API，汇交走提交系统 |
| BioCode | ❌ 无 | 生物工具注册平台，网页为主，无公开 API |
| DBCommons | ❌ 无 | 数据库目录，api_documents 404，未发现公开 API |
| GEN | ⚠️ 无 | 转录组数据门户，无 api_documents；官方提供网页检索、可视化与批量下载（bulk download），可后续评估其 FTP 批量下载通道 |
| MethBank | ⚠️ 无 | 无 api_documents；以在线工具 + 数据下载为主，可后续评估下载通道 |
| RCoV19 | ❌ 已下线 | `/rcov19/` 实测 404，新冠专题库疑似停止维护或迁移，不投入 |
| OBIA | ❌ 无 | 医学影像汇交库，无公开 API |
| OpenLB | ⚠️ 不建议 | 无 api_documents；站点存在 JSON 端点但无公开文档，且实测即触发 429 限流，对接风险高 |

### A.2 最新数据资源（截图第二屏，5 个）

| 资源 | 公开 API | 结论 |
|---|---|---|
| scMultiModalMap（单细胞多模态图谱） | ❌ 无 | 新发布资源，无 api_documents，未发现公开 API |
| ClinMAVE（临床应用 MAVE） | ❌ 无 | 同上 |
| ResMicroDb（呼吸道微生物组） | ❌ 无 | 同上 |
| DDS Atlas（DNA 数据存储图谱） | ❌ 无 | 同上 |
| TE-SCALE（转座子泛癌表达） | ❌ 无 | 同上 |

### A.3 对本项目的意义

- **结论支撑了原计划的范围**：20 个资源里只有 GWH/BioProject/BioSample/GenBase 四个有官方公开 API，恰好是功能一已封装的四个工具；GSA 层已有 seqout + 下载直连方案。其余资源近期不具备程序对接条件，不建议为"凑覆盖数"去爬网页（反爬 + 429 限流 + 无文档三重风险）。
- **二期候选（低优先级，仅当用户提出需求再评估）**：GVM / GEN / MethBank 的数据下载通道（FTP 批量包），可作为"给编号 → 给国内下载包直链"的轻量工具，不碰检索接口。
- **文案建议**：About 页数据库列表可注明「GSA/GSA-Human/GVM/GEN/MethBank 数据来自国家基因组科学数据中心，国内直连」。

---

*本计划基于 2026-10-07 实测与官方文档整理；GSA 官方若后续发布公开 API，功能三可切换为直连。*
