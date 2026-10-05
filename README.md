# JZ_Tools

> 生物信息分析工具集：脚本源码、Agent 技能（Skills）与独立应用的三合一仓库。

JZ_Tools 收录了日常组学分析中长期沉淀的可复用工具，覆盖 RNA-seq、ATAC-seq、scRNA-seq、变异分析、进化树可视化等场景。每个工具以两种形态存在：

- **`src/`** — 原始脚本模块，可直接按目录内的说明运行；
- **`skills/`** — 按 [OmicHub 技能设计与接入规范（OSDP）](docs/Skill_design.md) 封装的可执行型 Agent 技能，每个技能含 `SKILL.md`（触发条件 + 输入契约）、`scripts/`（可执行入口）与 `references/`（外部数据供给说明），可挂载到支持 skill 机制的 AI Agent 上使用。

仓库另含两个可独立部署的应用（见下文「独立应用」）。

## 目录结构

```
jz_tools/
├── skills/          # 25 个 skill 化的 Agent 技能（含 SKILLS_REGISTRY.md 技能台账）
├── src/             # 各工具的原始脚本模块（27 个）
├── docs/            # 技能设计规范（OSDP）、技能构建提示词等文档
├── data/            # Agent 声明式配置目录
└── code/            # 代码片段
```

## 技能清单

| skill_id | 功能 | 源码 |
|---|---|---|
| atac-tools | ATAC 工具集：TSS BED 与 peaks 计数矩阵 | `src/ATACTools/` |
| blast | BLAST 同源基因座提取 | `src/blast/` |
| data-deliver | 数据交付：本地复制、链接与 MD5 交付清单 | `src/data-deliver/` |
| deg | 差异表达分析：DESeq2、距离、热图与 GTF 转换 | `src/DEG/` |
| dotplot | 基于 NUCmer 坐标结果绘制 dotplot | `src/dotplot/` |
| enrichments | GO / 通路富集分析 | `src/Enrichments/` |
| fastq-screen | FastQ Screen 污染筛查 | `src/fastq_screen/` |
| gaf2go | GO Term 注释（GAF 提取） | `src/GAF2GO/` |
| gene-matrix | RSEM 基因矩阵合并与表达矩阵质控 | `src/gene_matrix/` |
| genome-tools | VCFtools 杂合度计算 | `src/genome_tools/` |
| gffconvert | GFF/GTF feature 表转换 | `src/GFFconvert/` |
| go-annotation | GO 注释表准备（含 UniProt 映射） | `src/GO_Annotation/` |
| kegg-pull | KEGG 离线注释下载 | `src/KEGG_pull/` |
| library-type | RNA 文库链特异性检测 | `src/library_type/` |
| logger-plugin | Snakemake Rich Loguru 日志插件 | `src/logger_plugin/` |
| maftools-gistic2 | 从 GISTIC2 结果提取基因与样本信息 | `src/maftools_gistic2/` |
| md5 | MD5 manifest 校验 | `src/md5/` |
| mutational-patterns | 突变谱模式分析 | `src/MutationalPatterns/` |
| r-plot-library | Venn、volcano、UpSet 等 R 绘图 | `src/R_plot_library/` |
| rmats | rMATS 事件表合并 | `src/rMATS/` |
| scrna-seq | 单细胞 inferCNV 分析 | `src/scRNA-seq/` |
| software-manager | Conda/Pip 环境软件清单解析 | `src/software_manager/` |
| tanglegram | Tanglegram 双树缠绕图 | `src/tanglegramplot/` |
| tissue-specific-genes | 组织特异性基因筛选（TPM / Tau） | `src/Tissue-specific-genes/` |
| wgcna | 基于 WGCNA RDS 筛选 hub genes | `src/wgcna/` |

完整的版本状态、外部数据依赖与未 skill 化模块清单见 [`skills/SKILLS_REGISTRY.md`](skills/SKILLS_REGISTRY.md)。

## 使用技能

1. 将 `skills/<skill_id>` 目录挂载到支持 Agent Skills 的客户端（如 Claude Code、Claude Desktop），或复制到其 skills 目录；
2. Agent 按 `SKILL.md` 中的触发条件与输入契约自动选用并执行；
3. 依赖外部参考数据的技能（如 `enrichments`、`fastq-screen`、`mutational-patterns`），先按各技能 `references/provisioning.md` 完成数据供给。

新增技能请遵循 [`docs/Skill_design.md`](docs/Skill_design.md)（OSDP v1.2）与 [`skills/SKILLS_REGISTRY.md`](skills/SKILLS_REGISTRY.md) 的拆分与回写约定。

## 独立应用

### GEO寻宝鼠 · 对话式组学数据检索助手（`src/Treasure-Seeking_Mouse/`）

把 [seqout.org](https://seqout.org) 的 26 个只读组学数据检索工具封装成「聊天式挖宝」体验的单页 Web 应用：自然语言提问 → 后端 LLM tool-calling 检索 → 数据卡片 + 文献证据链呈现，附桌宠养成玩法。React 19 + Vite 7 + Tailwind v4 前端，Supabase 兼容后端，**支持完全自托管**，并**自带容器化部署**（`deploy/`）与**移动端自适应**（按宽度 + 触摸能力自动切换布局与交互）。

在线体验：<https://q1vj9sqopzwj.meoo.fun/>（线上版本可能落后于仓库最新代码）。详见其 [README](src/Treasure-Seeking_Mouse/README.md)。

一键容器部署（配置统一走 `server/.env`，启动前自动预检 LLM 密钥）：

```bash
cd src/Treasure-Seeking_Mouse
cp server/.env.example server/.env   # 填 LLM_API_KEY（必填）
make docker-start                    # 预检密钥 → 构建 → 启动
```

### seqout-mcp（`src/seqout-mcp/`）

通过 [seqout.org](https://seqout.org) 查询公共组学数据的 MCP Server，提供 26 个只读工具，覆盖 GEO、SRA、ENA、GSA 数据集搜索、项目详情、样本信息与下载链接。支持 `uvx` 一段 JSON 直接部署。详见其 [README](src/seqout-mcp/README.md)。

```json
{
  "mcpServers": {
    "seqout": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/xsx123123/JZ_Tools.git#subdirectory=src/seqout-mcp",
        "seqout-mcp"
      ]
    }
  }
}
```

## 环境

- 各 skill 的语言与依赖不一：R（DESeq2、WGCNA、maftools 等）、Python 3.10+、Snakemake 等，以各技能 `SKILL.md` 与 `scripts/` 内声明为准；
- 部分技能依赖受控参考数据（GO OBO、KEGG、hg19/hg38 Bioconductor 参考包等），不随仓库分发，见各技能 `references/` 下的供给说明。

## License

[MIT](LICENSE)

---
**Author**: JZHANG | **Version**: JZ_Tools_v0.1.0

## 🔗 Links
- GitHub: [repository](https://github.com/xsx123123/JZ_Tools)
- LINUX DO: [Announcement](https://linux.do/)
