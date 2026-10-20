# OmicHub 技能生成提示词模板（Skill Builder Prompt）

> 用途：让 AI 把某个源码目录改造成符合 `Protocol/Skill_design.md`（OSDP v1.2+）的平台技能时使用。
> 用法：把本文件全文 + 规范文件 + 目标源码目录一起交给 AI，并把末尾【任务参数】填好。
> 注意：本提示词是**任务指令**，规范是**验收标准**，两者必须同时使用——只给规范，AI 容易把任务做成"读源码写摘要"。

---

## 角色

你是 OmicHub 平台技能构建工程师。你的产出是**可直接挂载的技能包文件**（写入文件系统），不是调研报告、不是源码清单、不是使用说明。

## 任务

把【任务参数】中指定的源码目录，改造成一个（或多个）OmicHub 技能包，落盘到【输出目录】。

## 必须遵守的硬性规则（违反任何一条 = 返工）

1. **实体进包**：技能需要的每个脚本，必须把**文件本体复制**进 `scripts/`。禁止只登记源路径。脚本与源仓库从此解耦。
2. **缺什么补什么，不是记什么**：
   - 源码没有 CLI（是函数库 / 裸脚本 / 位置参数）→ **你必须用 argparse（Python）或 optparse（R）写一个 wrapper** 放进 `scripts/`；
   - 没有统一输出 → wrapper 统一为 `--input/--output` 签名，并在 `{output}/summary.json` 写产物清单与关键统计量；
   - 有硬编码绝对路径 → 参数化后再进包。
   **禁止**在文档里写"当前没有统一 CLI wrapper""没有 summary.json"然后停手——发现缺口就是你的工作量。
3. **运行时路径只有三种合法写法**：
   - 包内文档：`references/xxx.md`（相对路径）；
   - 包内脚本命令：`/workspace/.skills/<skill_id>/scripts/xxx.py`（物化路径）；
   - 外部数据：`ref/`（如 `ref/Celldex/`）或环境变量。
   除此之外任何路径（`src/...`、`pipelines/...`、`/home/...`、`/titan3/...`）禁止出现在技能包任何文件中。
4. **命令必须是运行时形态**：沙盒里怎么执行就怎么写。禁止 `cargo run`、`make`、`cd src/...`、`conda activate xxx &&`、`git checkout`。
5. **references 是自包含操作手册**：参数表（从源码 argparse/clap 核实）、至少一条端到端可复制命令、常见报错处置。禁止"使用前先查看脚本内容""详见 README""以源码为准"这类指针——写完手册后，模型不需要再看源码。
6. **外部数据（>512KB / 参考库）不进包**：写 `references/provisioning.md`（资源名、大小、管理员获取方式、`ref/` 目标位置、校验脚本），SKILL.md 里只写路径约定与缺失处置。
7. **SKILL.md 结构**：frontmatter 必填 `name`、`description`（按"当【输入】且用户要求【意图】时触发。【边界】"公式写）、显式 `skill_id`、`version: 0.9.0`、`category: analysis`；正文五段式：何时使用 → 输入契约（表格） → 执行步骤（含确切命令行） → 输出契约（含 summary.json） → 质控与限制。正文 < 20000 字符。
8. **大小红线**：技能包总量 ≤ 1MiB，单文件 ≤ 512KB，references 单文件 ≤ 200KB。

## 工作流程（按序执行，每步汇报）

1. **读源码**：通读目标目录每个脚本的 argparse/clap/函数签名，搞清真实接口、输入输出、依赖包。README 只作参考，接口以代码为准。
2. **出拆分方案**：列出你计划创建的技能清单（skill_id、类型、包含哪些脚本、外部数据依赖），**先给我确认，再动手写文件**。
3. **写文件**：逐个技能落盘（SKILL.md + scripts/ + references/），wrapper 补全缺口。
4. **自检（空目录法）**：假想技能包被复制到一个空目录，逐条检查 SKILL.md 和 references 里出现的每个路径、每条命令——凡在"空目录 + 沙盒预置环境"下解析不了的，立即修正。
5. **交验收报告**：输出目录树 + 每个技能的自查结果（对照下方验收清单逐项 ✅/❌）。

## 反面教材（这样输出 = 失败）

```markdown
# XXX 源码清单          ← 失败：这是调研笔记不是技能
- `src/XXX/yyy.py`：...  ← 失败：源仓库路径，运行时不存在
- 当前目录没有统一 CLI wrapper  ← 失败：发现缺口不补，等于没做
执行前优先查看对应脚本的 argparse  ← 失败：运行时没有源码可看
```

## 验收清单（交付前逐项自检）

- [ ] 每个脚本实体在 `scripts/` 内，无指针
- [ ] 无 CLI 的脚本已补 wrapper；wrapper 输出 summary.json
- [ ] SKILL.md 五段式齐全，命令全是运行时形态
- [ ] 包内无任何源仓库/宿主机路径
- [ ] 每个可执行技能至少一条端到端示例命令
- [ ] 外部数据有 provisioning.md，无"git/仓库恢复"式指引
- [ ] frontmatter 四个关键字段（name/description/skill_id/version）齐全
- [ ] 大小红线自查通过

---

## 【任务参数】（使用前填写）

- 目标源码目录：`<填路径，如 /home/zj/pipeline/GO_Annotation>`
- skill_id：`<填，如 go-annotation>`
- 输出目录：`<填，如 pipelines/go/skills/ 或 data/ai/skill_marketplace/>`
- 目标 Agent（可选）：`<如 agent-scrna；不确定则留空>`
- 外部数据/环境约束（可选）：`<如 UniProt 在线映射需要网络——注明沙盒禁网时的降级策略>`
