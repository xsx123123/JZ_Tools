# Research ELN Skill 使用说明

这是一套**科研计算电子实验记录 Skill**，不是一次性的长提示词。它参考 `EXPERIMENT_NOTEBOOK.pdf`（TnpA/TnpD–CACTA 的日期式实验记录、简洁五部分结构、关键代码和结果图），同时针对原 GPSE 320 页报告出现的重复模板、代码破坏、图表遮挡、证据层级混乱等问题加了强约束。

## 安装到 Codex 项目

将压缩包里的整个 `research-eln` 文件夹放进目标项目的 `.agents/skills/`：

```text
YOUR_PROJECT/
  .agents/
    skills/
      research-eln/
        SKILL.md
        references/
        assets/
        scripts/
```

如果 Codex 运行中的会话尚未发现新 Skill，可刷新/重开该会话，再明确引用 `$research-eln`。

## 推荐的交互顺序

**先审计（对 GPSE 尤其重要）：**

```text
使用 $research-eln 的 audit 模式。只读扫描当前仓库与实验结果目录，复原独立实验、真实运行和历史数据汇总的关系；给出 audit.md、experiment_index.csv、证据缺口、图表溯源问题以及拟生成报告的目录。不修改源代码、不重跑训练、不生成 PDF。
```

**再生成（以 35 页范本作为风格参考）：**

```text
使用 $research-eln 的 build 模式。按照 audit.md 生成按日期组织的英文电子实验记录，保留 TnpA/TnpD–CACTA notebook 的精简五节结构和关键方法代码风格。正文优先讲实验设计与重要结果；通用依赖和大量重复运行移入索引或附录。必须生成 Markdown、实验索引、证据/图表 manifest；如果可用则生成具备 PDF 书签目录、代码保真和图文布局验收的 A4 PDF。中文说明不确定性，不允许编造数据。
```

**更新已有记录：**

```text
使用 $research-eln 的 update 模式，将新增实验补充到现有 EXPERIMENT_NOTEBOOK.md。保留之前的稳定 Experiment ID、日期归属和文献/图表路径，避免重新写全部实验。输出 CHANGELOG.md 并校验修改涉及的证据。
```

**只做质量检查：**

```text
使用 $research-eln 的 validate 模式，对电子实验记录进行证据、代码和 PDF 排版审查；列出 P0/P1/P2 问题并给出准确页码和修复建议，暂不修改。
```

## 手动结构检查

产物目录包含 `EXPERIMENT_NOTEBOOK.md` 时：

```bash
python .agents/skills/research-eln/scripts/validate_notebook.py research_eln_output \
  --pdf research_eln_output/EXPERIMENT_NOTEBOOK.pdf
```

`--pdf` 可选，需要 `PyMuPDF` 才执行额外 PDF 检查；若未安装则只检查 Markdown 与 manifests。验证脚本不是生物学真实性鉴定，仍要由 Codex 对照原始数据、表格、日志核验结论。

## 重要原则

1. 强制英文的范围是**新编写的实验记录正文**；原始代码不得因为英文规范而改写。
2. 文件日期不等于真实运行日期；实验的“汇总日”和“执行日”要区分。
3. 最终 PDF 不能以成功编译作为质量合格的唯一证据。
4. 优先保留“原始研究如何一步一步演进”的叙事，不要将上百个模型输出机械复制成上百篇几乎一样的实验。
