# BLAST 结果格式详细调研

> 目的：为编写"BLAST 结果解读 Python 脚本"做格式层面的完整调研，覆盖全部输出格式、字段语义、解析陷阱与 Python 技术选型。
> 调研时间：2026-07；基于 BLAST+ 2.17.0（2025-07 发布，当前最新版）、Biopython 1.84–1.86 新版 `Bio.Blast` 解析器。

---

## 1. 版本与环境背景

- **BLAST+ 最新版本：2.17.0**（2025-07-01 发布）。你之前从 S3 镜像下载的 nt/nr 是 BLAST DB v5 格式（自带 taxid 映射，这是输出 `staxids/sscinames` 等分类学列的前提）。
- **Biopython 在 1.84 起重写了 `Bio.Blast` 模块**：新增统一的 `Bio.Blast.parse()`，自动识别 **XML（outfmt 5）和 XML2（outfmt 14/16）**，新版还支持 **JSON2** 与 **Tabular**；旧的 `Bio.Blast.NCBIXML` 仍保留，但官方推荐迁移到新解析器。`Bio.Blast.Applications`（命令行封装）已在 1.86 移除，调本地 BLAST 直接用 `subprocess`。
- 旧的纯文本/HTML 解析器已被 Biopython 彻底移除——**不要用 Python 解析 outfmt 0 的纯文本**，这是官方反复踩坑后的结论。

---

## 2. `-outfmt` 全部格式总览

| outfmt | 名称 | 机器可解析性 | 典型用途 |
|---|---|---|---|
| 0 | Pairwise（默认纯文本） | ❌ 差，格式经常变 | 人工阅读 |
| 1–4 | Query-anchored 系列 | ❌ 差 | 人工阅读、多序列比对视图 |
| 5 | BLAST XML（经典 XML） | ✅ 好，稳定 | 解析、Biopython 生态 |
| 6 | Tabular（制表符分隔，无表头无注释） | ✅ 最好 | 管道/数据框分析 |
| 7 | Tabular + 注释行 | ✅ 好 | 同 6，但自带元信息 |
| 8 | Seqalign (Text ASN.1) | 一般 | NCBI 内部 |
| 9 | Seqalign (Binary ASN.1) | 一般 | NCBI 内部 |
| 10 | CSV（逗号分隔） | ✅ 好 | Excel/数据框 |
| 11 | **BLAST archive (ASN.1)** | ✅ 关键格式 | **归档原始结果，后期任意转换** |
| 12 | Seqalign (JSON) | 一般 | NCBI 内部 |
| 13 | Multiple-file BLAST JSON | ✅ 好 | 每个 query 一个 JSON 文件 |
| 14 | Multiple-file BLAST XML2 | ✅ 好 | 每个 query 一个 XML2 文件 |
| 15 | Single-file BLAST JSON（JSON2） | ✅ 好，Web 友好 | **前端/API 集成的最佳选择** |
| 16 | Single-file BLAST XML2 | ✅ 好 | XML2 单文件版 |
| 17 | SAM | ✅ 好（SAM 生态） | 比对结果进 samtools/IGV |
| 18 | Organism Report | ✅ 一般 | 按物种汇总的报告 |

**核心结论先行**：
- 给 Python 脚本做"解读"：**首选 outfmt 6/7 自定义列（pandas 直接读）**；需要完整比对信息（序列、HSP 结构、统计参数）时用 **outfmt 5 / 15**。
- 平台级做法：**运行时必须同时保存 outfmt 11（ASN.1 归档）**，之后用 `blast_formatter` 离线转换成任何格式，不需要重跑比对。这是 NCBI 官方推荐的"一次比对、多次格式化"工作流。

---

## 3. 核心数据模型：Query → Hit → HSP

无论哪种结构化格式（XML / XML2 / JSON2），BLAST 结果都是同一个三层模型：

```
BlastOutput（一次运行）
├── 元信息：program、version、reference、db、参数（evalue 阈值、矩阵、gap 罚分、过滤）
└── Iteration / search（每个 query 一条）
    ├── query_id、query_def、query_len、（query_masking）
    └── Hit（每个命中序列一条，按显著性排序）
        ├── hit id / accession / title / length
        └── HSP（High-scoring Segment Pair，一个 hit 可有多个 HSP！）
            ├── bit_score、score（raw）、evalue
            ├── identity、positive、gaps、align_len
            ├── query_from/to、hit_from/to
            ├── qseq / hseq / midline（比对字符串）
            └──（blastx/tblastn 等还有 frame、密度统计 density）
```

**写脚本时最重要的一个认知**：**一个 query 对一个 subject 可能产生多个 HSP**（比如基因比对上多个外显子区域）。outfmt 6 里"每个 HSP 一行"，所以同一个 qseqid+sseqid 组合会出现多行——"每 query 取最佳命中"不能简单 `groupby(qseqid).first()`，要先想清楚是取最佳 HSP 还是合并 HSP 看整体覆盖（这时就要用 `qcovs` 而不是 `qcovhsp`）。

---

## 4. 各格式详解

### 4.1 outfmt 0：Pairwise 纯文本（默认）

结构：

```
BLASTN 2.17.0+
Reference: Stephen F. Altschul, ...
Database: nt
Query= my_query_1
Length=1111
                                                                      Score     E
Sequences producing significant alignments:                          (Bits)  Value

NC_000001.11  Homo sapiens chromosome 1 ...                            1988     0.0
...

>NC_000001.11 Homo sapiens chromosome 1, ...
Length=249250621
 Score = 1988 bits (1076),  Expect = 0.0
 Identities = 1076/1076 (100%), Gaps = 0/1076 (0%)
 Strand=Plus/Plus
Query  1     ACGTACGT...  60
             ||||||||||||
Sbjct  1000  ACGTACGT...  1059

Lambda      K      H
   1.37    0.711     1.31
...
```

- 包含描述列表（one-line descriptions）+ 完整比对 + 末尾的 Karlin-Altschul 统计参数。
- **不要解析它**：Biopython 官方明确说这个格式"每个版本都在变"，他们的文本解析器因此全部移除了。只用于人工查看。

### 4.2 outfmt 6 / 7 / 10：Tabular / CSV（脚本首选）

**默认 12 列**（即关键字 `std`）：

```
qseqid  sseqid  pident  length  mismatch  gapopen  qstart  qend  sstart  send  evalue  bitscore
```

自定义写法：

```bash
blastn -query q.fa -db nt \
  -outfmt "6 qseqid sseqid staxids sscinames pident length qlen slen mismatch gapopen gaps qstart qend sstart send evalue bitscore qcovs qcovhsp stitle" \
  -max_target_seqs 5 -out result.tsv
```

- **6**：纯数据行，无任何表头注释——适合管道和 `pandas.read_csv(sep='\t', header=None, names=[...])`。
- **7**：在 6 的基础上多了 `# ` 开头的注释行（BLAST 版本、query 名、命中的数据库、字段列表），`# Fields: ...` 行可以直接当表头用；**无命中的 query 也会有一行 `# 0 hits found`**——这正好弥补了 6 里无命中 query 完全消失的问题。
- **10**：逗号分隔。注意 `stitle` 等字段本身可能含逗号，CSV 会加引号，用 pandas 读没问题，但别手写 split(',')。

**全部列说明符完整表**（写自定义列时照抄）：

| 说明符 | 含义 | 类型/解析注意 |
|---|---|---|
| qseqid | Query Seq-id | str |
| qgi / qacc / qaccver | Query GI / accession / accession.version | GI 已废弃多年，基本用不上 |
| qlen | Query 序列长度 | int，算覆盖率必备 |
| sseqid | Subject Seq-id | str；未 `-parse_deflines` 时是整条 defline |
| sallseqid | 所有 subject Seq-id，`;` 分隔 | 一个序列有多个 ID 时 |
| sgi / sallgi | Subject GI | 废弃 |
| sacc / saccver / sallacc | Subject accession / .version / 全部 | str |
| slen | Subject 序列长度 | int |
| qstart / qend | 比对在 query 上的起止 | int，1-based |
| sstart / send | 比对在 subject 上的起止 | int，1-based；**反向比对时 sstart > send！** |
| qseq / sseq | 比对上的序列片段（含 `-` gap） | str |
| evalue | Expect value | **可能是 `2e-05`、`0.0`、`1.0` 多种写法，用 float() 解析** |
| bitscore | Bit score | float，跨搜索可比，**排序首选指标** |
| score | Raw score | int，受打分矩阵影响，不可跨参数比较 |
| length | 比对长度（含 gap） | int |
| pident | 一致度百分比 | float（0–100） |
| nident | 一致位点数 | int |
| mismatch | 错配数 | int |
| positive | 正得分位点数（蛋白） | int |
| gapopen | gap 开口数 | int |
| gaps | gap 总数 | int |
| ppos | 正得分百分比 | float |
| frames / qframe / sframe | 阅读框（翻译类比对） | `1/-2` 这种 `q/s` 格式 |
| btop | Blast traceback operations | 见 §6.5 |
| staxid / staxids | Subject Taxonomy ID / 唯一 IDs（`;` 分隔，数值序） | **一个 subject 可能对应多个 taxid！** |
| sscinames / scomnames | 学名 / 俗名，`;` 分隔 | str |
| sblastnames / sskingdoms | BLAST 分类名 / 超界（superkingdom） | str |
| stitle | Subject 标题（完整描述） | str，**可能含 tab/逗号** |
| salltitles | 所有标题，`<>` 分隔 | str |
| sstrand | Subject 链方向 | plus / minus |
| qcovs | Query Coverage Per Subject（合并该 subject 所有 HSP） | int（0–100），**评估整体覆盖用它** |
| qcovhsp | Query Coverage Per HSP（单个 HSP） | int |
| qcovus | Query Coverage Per Unique Subject（仅 blastn） | int |

**两个易混点**：
- `qcovs` vs `qcovhsp`：前者是"该 subject 的所有 HSP 加起来覆盖了 query 多少"，后者是"这一个 HSP 覆盖多少"。一个基因跨 5 个外显子命中，每个 HSP 的 qcovhsp 可能只有 20%，但 qcovs 是 95%。
- `staxid` vs `staxids`：单数版在某些版本/场景下行为不同，**建议一律用复数版（staxids/sscinames/...）**，行为更一致。

### 4.3 outfmt 5：经典 BLAST XML

层级（对应 DTD `NCBI_BlastOutput.dtd`）：

```xml
<BlastOutput>
  <BlastOutput_program>blastn</BlastOutput_program>
  <BlastOutput_version>BLASTN 2.17.0+</BlastOutput_version>
  <BlastOutput_db>/data/blastdb/nt</BlastOutput_db>
  <BlastOutput_iterations>
    <Iteration>
      <Iteration_iter-num>1</Iteration_iter-num>
      <Iteration_query-ID>Query_1</Iteration_query-ID>
      <Iteration_query-def>my_query_1</Iteration_query-def>
      <Iteration_query-len>1111</Iteration_query-len>
      <Iteration_hits>
        <Hit>
          <Hit_num>1</Hit_num>
          <Hit_id>gi|...|ref|NC_000001.11|</Hit_id>
          <Hit_def>Homo sapiens chromosome 1 ...</Hit_def>
          <Hit_accession>NC_000001.11</Hit_accession>
          <Hit_len>249250621</Hit_len>
          <Hit_hsps>
            <Hsp>
              <Hsp_num>1</Hsp_num>
              <Hsp_bit-score>1988.27</Hsp_bit-score>
              <Hsp_score>1076</Hsp_score>
              <Hsp_evalue>0</Hsp_evalue>
              <Hsp_query-from>1</Hsp_query-from>
              <Hsp_query-to>1076</Hsp_query-to>
              <Hsp_hit-from>1000</Hsp_hit-from>
              <Hsp_hit-to>2075</Hsp_hit-to>
              <Hsp_identity>1076</Hsp_identity>
              <Hsp_gaps>0</Hsp_gaps>
              <Hsp_align-len>1076</Hsp_align-len>
              <Hsp_qseq>ACGT...</Hsp_qseq>
              <Hsp_hseq>ACGT...</Hsp_hseq>
              <Hsp_midline>||||...</Hsp_midline>
            </Hsp>
          </Hit_hsps>
        </Hit>
      </Iteration_hits>
    </Iteration>
  </BlastOutput_iterations>
</BlastOutput>
```

- 优点：信息最全（比对字符串、midline、统计参数、masking 区域全有）；格式几十年稳定；Biopython 新老解析器都支持。
- 缺点：体积大（比 tabular 大 10–50 倍），nt 库大批量比对时文件会非常可观。
- 无命中的 query：`<Iteration_hits>` 为空，信息保留完整。

### 4.4 outfmt 15 / 13：JSON2（Web 平台首选）

单文件版（15）顶层结构：

```json
{
  "BlastOutput2": {
    "report": {
      "program": "blastn",
      "version": "BLASTN 2.17.0+",
      "reference": "Stephen F. Altschul, ...",
      "search_target": { "db": "nt" },
      "params": { "expect": 10, "sc_match": 2, "sc_mismatch": -3,
                  "gap_open": 5, "gap_extend": 2, "filter": "L;m;" },
      "results": {
        "search": {
          "query_id": "Query_69183",
          "query_title": "my_query_1",
          "query_len": 1111,
          "query_masking": [ { "from": 797, "to": 1110 } ],
          "hits": [
            {
              "num": 1,
              "description": [
                { "id": "NC_000001.11", "accession": "NC_000001.11",
                  "title": "Homo sapiens chromosome 1 ...", "taxid": 9606,
                  "sciname": "Homo sapiens" }
              ],
              "len": 249250621,
              "hsps": [
                { "num": 1, "bit_score": 1988.27, "score": 1076,
                  "evalue": 0, "identity": 1076, "gaps": 0,
                  "query_from": 1, "query_to": 1076,
                  "hit_from": 1000, "hit_to": 2075, "align_len": 1076,
                  "qseq": "ACGT...", "hseq": "ACGT...", "midline": "|||..." }
              ]
            }
          ],
          "stat": { "db_num": ..., "db_len": ..., "hsp_len": ..., "kappa": 0.41, "lambda": 0.625, "entropy": 0.78 }
        }
      }
    }
  }
}
```

- **注意**：多 query 时 `BlastOutput2` 在某些版本是数组（一个元素一个 query），解析时先做 `isinstance` 判断。
- outfmt 13 是每个 query 一个独立 JSON 文件（适合大结果集的分片处理）。
- 对 OmicHub 这种 Web 平台：JSON2 直接可以丢给前端渲染，taxid/sciname 已内置，是后端 API 化的最佳格式。新版 Biopython `Bio.Blast.parse` 也能读 JSON2。

### 4.5 outfmt 11：BLAST Archive（ASN.1）——平台必存

```bash
# 比对时同时输出归档
blastn -query q.fa -db nt -outfmt 11 -out result.asn

# 之后任意转换，无需重跑
blast_formatter -archive result.asn -outfmt 6 -out result.tsv
blast_formatter -archive result.asn -outfmt 15 -out result.json
blast_formatter -archive result.asn -outfmt "6 std staxids sscinames qcovs" -out result_tax.tsv
```

- 这是**完整原始结果的二进制归档**，包含所有 HSP、统计量、参数。
- 对平台的意义：用户跑一次 BLAST，前端后续可以反复以不同格式/不同列查看结果，计算成本只付一次。
- **建议平台流水线固定为：BLAST 运行 → 同时产 11（归档）+ 6（快速表格）→ 前端按需用 blast_formatter 转 15**。

### 4.6 outfmt 17：SAM

- 把比对输出为 SAM 格式，可用 `SQ` 说明符带序列：`-outfmt "17 SQ"`。
- 用途：结果要进 samtools/IGV/JBrowse 生态时有用（比如你的 JBrowse 2 模块）。注意 BLAST 的 SAM 是"比对"而非 NGS 意义上的 mapping，MAPQ 等字段是套用的。

### 4.7 outfmt 18：Organism Report

- 按物种汇总：每个物种的命中数、覆盖 query 列表等。做污染检测/宏基因组粗筛时可以一看，解析价值一般。

---

## 5. 统计指标语义（解读脚本的核心逻辑）

| 指标 | 语义 | 解读要点 |
|---|---|---|
| raw score | 按打分矩阵累加的原始分 | 依赖矩阵/gap 罚分，**不可跨参数比较** |
| bit score | 归一化后的分数 | **跨搜索、跨数据库可比；越大越好；排序/取 best hit 用它** |
| e-value | 在当前数据库规模下，随机得到这么好比对的期望次数 | **越小越显著；依赖数据库大小**，同一序列搜 nt 和小库 e-value 不同；常用阈值 1e-5（严格）/1e-3 |
| pident | 一致度 % | 只是"一致"，**不代表覆盖**——100% identity 但只比上 30% 长度的 hit 很常见 |
| qcovs / qcovhsp | query 覆盖度 | **pident + qcovs 双指标才完整**：注释转移一般要求 pident ≥ X 且 qcovs ≥ Y |
| gaps / gapopen | gap 数 | 评估比对质量 |
| Karlin-Altschul 统计量（lambda/K/H） | e-value 计算参数 | XML/JSON2 里有，一般不需要直接用 |

**解读脚本的常见判定规则（可直接实现）**：
1. `best hit`：每个 query 按 bitscore 降序取第一（注意 tie 时看 evalue/pident）。
2. `显著命中`：`evalue ≤ 阈值`。
3. `高置信注释`：`pident ≥ 40%（蛋白）且 qcovs ≥ 70%`（阈值按业务调）。
4. `多 HSP 合并`：同 qseqid+sseqid 的多行，覆盖度用 qcovs，不要 sum(qcovhsp)（HSP 间可能重叠）。
5. `无命中 query`：outfmt 6 里不会出现，要靠 query 列表差集找出来（或直接用 outfmt 7 的 `# 0 hits found`）。

---

## 6. BTOP 字符串（btop 列）

`-outfmt 6 ... btop` 输出的回溯操作串，例：

```
42AC-37TT2GA15
```

规则：数字 = 连续一致匹配数；两个字母 = 错配（query 碱基 + subject 碱基）；含 `-` = gap（`-A` 表示 query 是 gap / subject 有碱基；`A-` 相反）。可用它无损重建比对，不需要 qseq/sseq 两列，省空间。

---

## 7. Python 解析方案对比与选型

### 方案 A：pandas 读 outfmt 6/7（最简单，推荐主用）

```python
import pandas as pd

COLS = ["qseqid", "sseqid", "staxids", "sscinames", "pident", "length",
        "qlen", "slen", "mismatch", "gapopen", "gaps",
        "qstart", "qend", "sstart", "send",
        "evalue", "bitscore", "qcovs", "qcovhsp", "stitle"]

df = pd.read_csv(
    "result.tsv", sep="\t", header=None, names=COLS,
    comment="#",                      # 兼容 outfmt 7 的注释行
    dtype={"staxids": "string", "sscinames": "string", "stitle": "string"},
)

# 最佳命中（每个 query 一条）
best = df.sort_values(["qseqid", "bitscore"], ascending=[True, False]) \
         .drop_duplicates("qseqid")

# 无命中 query（需要 query 清单）
all_queries = set(q_ids_from_fasta)
no_hit = all_queries - set(df["qseqid"])
```

优点：快、内存可控（可 `usecols` 裁剪、`chunksize` 流式）、和下游分析无缝衔接。**你的解读脚本建议以这个为主路径。**

### 方案 B：Biopython 新版 Bio.Blast.parse（XML / XML2 / JSON2）

```python
from Bio import Blast

with open("result.xml", "rb") as f:   # 自动识别 XML / XML2；JSON2 也支持
    for record in Blast.parse(f):
        for hit in record:
            for hsp in hit:           # HSP 继承 Bio.Align.Alignment
                print(hit.target.id if hasattr(hit, "target") else hit,
                      hsp.annotations.get("bit score"),
                      hsp.annotations.get("evalue"))
```

- 适合：需要完整比对字符串、统计参数、masking 信息，或做可复现的深度解读。
- 注意：新版对象的 HSP 是 `Bio.Align.Alignment` 子类，坐标体系是 **0-based 的 alignment coordinates**（和文件里的 1-based 不同），混用两种来源数据时要统一。
- 旧的 `Bio.Blast.NCBIXML.parse()` 还能用但建议迁移。

### 方案 C：Bio.Align.parse 读 tabular

Biopython 新版推荐用 `Bio.Align.parse("result.tsv", "tabular")` 把 outfmt 6 读成比对对象——适合需要比对坐标做下游操作（提取序列、区间运算）的场景。

### 方案 D：纯标准库 json 读 JSON2

```python
import json
data = json.load(open("result.json"))
reports = data["BlastOutput2"]
if isinstance(reports, dict):
    reports = [reports]
for rep in reports:
    search = rep["report"]["results"]["search"]
    for hit in search.get("hits", []):
        desc = hit["description"][0]
        hsp0 = hit["hsps"][0]
        ...
```

适合平台后端直接服务前端，无第三方依赖。

### 选型建议（针对你的平台 + 脚本）

| 场景 | 格式 | 解析方式 |
|---|---|---|
| 解读脚本主路径（表格化、统计、过滤、best hit） | outfmt 6/7 自定义列 | pandas |
| 需要比对细节（qseq/hseq/midline、重建比对） | outfmt 5 或 15 | Bio.Blast.parse / json |
| 平台归档 & 多格式再导出 | outfmt 11 + blast_formatter | subprocess |
| 前端直接展示 | outfmt 15（JSON2） | 原生 json / 前端直接消费 |
| 进 JBrowse/samtools | outfmt 17（SAM） | pysam |

---

## 8. 解析陷阱清单（写脚本前过一遍）

1. **坐标是 1-based 闭区间**；反向比对 `sstart > send`（minus 链），不要假设 start < end；做区间运算先 `min/max` 归一化。
2. **evalue 文本格式不固定**：可能是 `0.0`、`1e-05`、`2.3`、`5.1e-180`，统一 `float()`。
3. **pident 是百分数（0–100）不是小数**。
4. **同 qseqid+sseqid 多行 = 多 HSP**，去重逻辑要显式设计（见 §3）。
5. **staxids 可能是多值**（`;` 分隔）：一个 accession 对应多个 taxid（冗余序列），取第一个还是展开要想清楚；空值出现时用 pandas nullable string 处理。
6. **stitle 可能含制表符/逗号**：理论上罕见，但解析 outfmt 6 用 `sep="\t"` + 固定列数校验，行字段数不符的行记录告警而不是静默丢弃。
7. **无命中 query 在 outfmt 6 中完全消失**：必须靠 fasta query 清单做差集，或改用 outfmt 7 识别 `# 0 hits found`。
8. **`-max_target_seqs` 的语义是"保留的 aligned sequences 数"**，不是"每个 query 的 top N"那么简单——它在比对早期阶段生效，曾引发过争议（NCBI 后来加了说明）；要严格的 top N，用大 max_target_seqs + 脚本内排序截取，或配合 `-culling_limit`。
9. **多 query 的 JSON2 顶层可能是 dict 也可能是 list**，先判断。
10. **outfmt 7 的 `# Fields:` 行**可以直接解析出列名（适合列不固定的通用脚本），比硬编码列名健壮。
11. **版本差异**：`qcovs/qcovhsp` 是 2.2.28+ 才有的；`staxids`（复数）是 2.2.30+；`qcovus` 更晚且仅 blastn。你服务器上 2.17.0 全都有，但脚本要兼容客户旧结果时留意。
12. **未加 `-parse_deflines` 时**，sseqid 是整条 defline，且 `stitle/staxids` 等列不可用——运行 BLAST 时统一加上。
13. **Biopython 新旧对象坐标体系不同**（0-based vs 1-based），混合使用先对齐。
14. **文件体积**：nt 库大批量 blastn 的 outfmt 5/15 可能达 GB 级——解读脚本对 XML/JSON 用流式/增量解析（`Blast.parse` 本身就是迭代器），不要 `json.load` 整个大文件。

---

## 9. 推荐的脚本/平台架构

```
运行层：
  blastn/blastp -out result.asn -outfmt 11          # 归档（唯一必须）
        └─ blast_formatter → result.tsv (outfmt 7 自定义列)   # 分析用
        └─ blast_formatter → result.json (outfmt 15)          # 前端用

解读脚本（Python）：
  ├─ 输入：result.tsv（主）+ query.fasta（拿全量 query 列表）
  ├─ 解析：pandas + comment="#"，列名从 "# Fields:" 行动态读取
  ├─ 解读逻辑：
  │    1) 每 query best hit（bitscore 排序）
  │    2) 显著性过滤（evalue / pident / qcovs 阈值，可配置）
  │    3) 无命中 query 报告（差集）
  │    4) 分类学汇总（staxids → 物种计数，污染检测）
  │    5) 多 HSP 合并视图（qcovs 为准）
  └─ 输出：Excel/TSV 汇总表 + JSON（供前端可视化）
```

自定义列的推荐默认配置（注释转移场景）：

```bash
-outfmt "7 qseqid sseqid saccver staxids sscinames stitle pident qcovs qcovhsp length mismatch gaps qlen slen qstart qend sstart send evalue bitscore"
```

---

## 10. 参考资料

1. NCBI BLAST+ Command Line Applications User Manual（outfmt 与列说明符官方定义）：https://www.ncbi.nlm.nih.gov/books/NBK279684/
2. BLAST+ Release Notes：https://www.ncbi.nlm.nih.gov/books/NBK131777/
3. BLAST+ 最新版下载（2.17.0，2025-07）：https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/LATEST/
4. Biopython BLAST (new) 解析器文档（XML/XML2/JSON2/Tabular）：https://biopython.org/docs/1.86/Tutorial/chapter_blast.html
5. Bio.Blast API（HSP 对象结构、annotations 字段）：https://biopython.org/docs/1.86/api/Bio.Blast.html
6. scikit-bio blast6 格式规范（列类型表）：https://scikit.bio/docs/dev/generated/skbio.io.format.blast6.html
