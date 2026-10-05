# GSE→SRA 解析缺陷与未同步项目提示 · 问题与解决方案

> 供移植到其它平台时参照。本文档只讲**问题是什么、为什么、怎么修**，与具体语言/框架无关。
> 涉及的两个缺陷彼此独立，可分别修复。

---

## 缺陷一：GSE 详情解析误把「相似数据集」当成映射来源，导致真项目被判成空矿

### 一、问题现象

以 `GSE117176`（小鼠骨髓来源巨噬细胞 scRNA-seq，5 个样本）为例，平台给出如下错误结论：

| 调用 | 返回 |
|---|---|
| `get_runs(GSE117176)` | `total_runs = 0` |
| `get_download_links(GSE117176)` | 仅表头，无数据行 |
| `get_metadata_csv(GSE117176)` | HTTP 404，`No runs found for SRP349691` |

平台据此建议用户"本项目原始 fastq 通道为空，请改走 GEO 加工矩阵"。

**但 NCBI 原始页面显示该项目确有数据**：

- Accession：`PRJNA481344; GEO: GSE117176`
- SRA Experiments：**5**
- BioSample：5
- SRA Data：182 Gbases / 83,231 MBytes

即数据真实存在，是平台的解析环节出了问题。

### 二、根因

`GEO 编号 → SRA/BioProject 研究编号` 的解析函数采用了**对整棵项目详情 JSON 的递归搜索**：
在响应里找第一个「键名含 `accession` + 值为 `SRP*/PRJ*` 格式」的字符串，就当作映射结果返回。

问题在于 GSE 详情 JSON 里同时含有一个 **`neighbors` 字段（约 300 条相似数据集）**，其结构形如：

```json
{
  "accession": "GSE117176",
  "alias": ["SRP153927"],
  "relation": [
    {"@type": "BioProject", "@target": "https://www.ncbi.nlm.nih.gov/bioproject/PRJNA481344"},
    {"@type": "SRA", "@target": "https://www.ncbi.nlm.nih.gov/sra?term=SRP153927"}
  ],
  "neighbors": [
    { "...": "...", "accession": "GSE165500" },
    { "...": "...", "accession": "SRP349691" },   ← 另一个项目的真实编号
    { "...": "...", "accession": "SRP373665" },
    { "...": "...", "accession": "SRP702282" }
  ]
}
```

`neighbors[].accession` 里装的是**别的项目**的真实 SRA 编号。由于 JSON 键遍历顺序上 `neighbors` 排在 `relation` 之前，递归函数**先命中 `neighbors[207].accession = "SRP349691"` 就返回了**，从未走到正确的 `relation` 字段。

于是：

```
GSE117176 的真实映射：PRJNA481344          ✅ 5 runs
被误解析为：          SRP349691            ❌ 0 runs → "空矿"
```

### 三、两个加剧问题的细节

1. **`alias` 是数组，旧实现漏读。**
   `alias` 的值是 `["SRP153927"]`（数组），而旧函数只匹配「字符串类型的值」，恰好把这里携带的正确编号跳过了。

2. **"整树递归"这一思路本身就是错的。**
   修复过程中曾尝试"只跳过 `neighbors`、其余递归 + URL 正则抽取"，结果把 `overall_design`（实验描述文本）里嵌入的 URL 也当成了映射，凭空解析出一个不存在的 `SRP33`。说明**应当只读权威字段，而不是过滤噪声后继续整树搜索**。

### 四、解决方案

放弃递归搜索，改为**只读三个权威字段**构造候选，并**逐个验证确有 run** 才采用。

**可用作映射的数据源（按可靠性排序）：**

| 字段 | 说明 |
|---|---|
| `relation[].@target` | **最可靠**。`@type` 为 `BioProject` / `SRA` 时，`@target` 是 URL（如 `https://…/bioproject/PRJNA481344`），从 URL 中抽取编号 |
| `alias` | 有时携带 SRP（可能为数组，需展开），有时为空数组 |
| `external_id` | 对象形态（如 `{"GEO":"GSE117176","BioProject":"PRJNA481344"}`），值需遍历 |

**绝不可用**：`neighbors`（相似数据集，含**其它项目**编号）、以及任何自由文本字段（`overall_design`/`abstract`/`title`）。

**算法**：

1. 从 `relation`（仅 `@type` 匹配 BioProject/SRA 的 URL）/ `alias` / `external_id` 三个字段收集候选编号，去重。
2. 排序：`PRJ*` 优先于 `SRP*`（BioProject 是整项目级，数据通常最全；SRP 仅作兜底）。
3. 依次对候选调用 `/project/{acc}/runs`，**取第一个确有 run 的**。
4. 若全部为 0：**如实返回首选候选、不抛异常**，让下游工具返回"无 run"——因为老 GEO-only 项目上游本就没有公开 raw（经 ENA 交叉核实，见下），此时"空"是正确结果，不应继续寻找替代。

**参考实现（TypeScript）：**

```ts
const ACC_IN_URL = /\b(SRP|PRJNA|PRJEB|PRJDB)\d+\b/i;
function extractAccFromUrl(url: string): string | null {
  const m = ACC_IN_URL.exec(url);
  return m ? m[0].toUpperCase() : null;
}

function studyCandidates(project: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined, kind?: string) => {
    if (!raw) return;
    const u = raw.toUpperCase();
    if (STUDY_PATTERN.test(u)) { if (!seen.has(u)) { seen.add(u); out.push(u); } }
    // 仅当 @type 为 BioProject/SRA 时才从 URL 抽取，避免描述文本里的 URL 混入
    else if (kind && /:\/\//.test(raw) && /BioProject|SRA/i.test(kind)) {
      const acc = extractAccFromUrl(raw);
      if (acc && !seen.has(acc)) { seen.add(acc); out.push(acc); }
    }
  };
  const p = (project && typeof project === 'object' && !Array.isArray(project) ? project : {}) as Record<string, unknown>;

  if (Array.isArray(p.relation)) {
    for (const rel of p.relation) {
      const r = (rel && typeof rel === 'object' ? rel : {}) as Record<string, unknown>;
      push(typeof r['@target'] === 'string' ? r['@target'] : null,
           typeof r['@type'] === 'string' ? r['@type'] : '');
    }
  }
  for (const field of ['alias', 'external_id'] as const) {
    const v = p[field];
    if (typeof v === 'string') push(v);
    else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string') push(item);
    else if (v && typeof v === 'object') for (const n of Object.values(v as Record<string, unknown>)) if (typeof n === 'string') push(n);
  }
  // PRJ 优先，SRP 兜底
  return out.sort((a, b) => (b.startsWith('PRJ') ? 1 : 0) - (a.startsWith('PRJ') ? 1 : 0));
}

async function hasRuns(acc: string): Promise<boolean> {
  try {
    const runs = await seqoutGet(`/project/${encodeURIComponent(acc)}/runs`);
    if (Array.isArray(runs)) return runs.length > 0;
    const n = (runs as { total_runs?: unknown })?.total_runs;
    if (typeof n === 'number') return n > 0;
    const arr = (runs as { runs?: unknown })?.runs;
    return Array.isArray(arr) && arr.length > 0;
  } catch { return false; }
}

async function resolveStudy(accession: string): Promise<string> {
  const acc = accession.trim().toUpperCase();
  if (GSE_PATTERN.test(acc)) {
    const project = await seqoutGet(`/project/${encodeURIComponent(acc)}`);
    const candidates = studyCandidates(project);
    if (!candidates.length) throw new Error(`${acc} 未找到对应 SRA/BioProject 编号`);
    for (const candidate of candidates) {
      if (await hasRuns(candidate)) return candidate;
    }
    return candidates[0]; // 全空也如实返回，不抛异常
  }
  if (!STUDY_PATTERN.test(acc)) throw new Error(`研究编号格式不正确：${acc}`);
  return acc;
}
```

### 五、验证结果

对真实 API 逐条核对修复前后的解析结果：

| GSE | 修复前（递归搜索） | 修复后（权威字段 + hasRuns） | 实际 total_runs |
|---|---|---|---|
| **GSE117176** | ~~SRP349691~~ ❌ | **PRJNA481344** ✅ | **5** |
| GSE151530 | ~~SRP275550~~（张冠李戴）❌ | PRJNA636285 ✅ | 0（上游本就无 raw） |
| GSE62944 | ~~SRP426032~~（neighbor）❌ | PRJNA266377 ✅ | 0（上游本就无 raw） |
| GSE26109 | 不确定 | PRJNA142297 ✅ | 28 |
| GSE165500 | 不确定 | PRJNA694699 ✅ | 9 |

**GSE117176 修复后的一致性**（证明映射正确）：`experiments` 返回的 5 条恰好对应 5 个 GSM，标题前缀为 `lnATM / obATM / M0_BMDM / M1_BMDM / M2_BMDM`：

```
SRX4394824  Illumina HiSeq 4000 sequencing: GSM3272966: lnATM_scRNA
SRX4394825  Illumina HiSeq 4000 sequencing: GSM3272967: obATM_scRNA
SRX4394826  Illumina HiSeq 4000 sequencing: GSM3272968: M0_BMDM_scR
SRX4394827  Illumina HiSeq 4000 sequencing: GSM3272969: M1_BMDM_scR
SRX4394828  Illumina HiSeq 4000 sequencing: GSM3272970: M2_BMDM_scR
```

**关于"0 run 是否等于解析错误"的重要判定**：对 `GSE151530`（PRJNA636285）与 `GSE62944`（PRJNA266377）额外用 ENA 交叉验证：

```
ENA PRJNA636285 → 空
ENA PRJNA266377 → 空
ENA PRJNA481344 → SRR7526393, SRR7526396, …   （有数据）
```

说明这两个项目**上游确实没有公开原始测序数据**（仅 GEO 加工矩阵），此时返回 0 run 是**正确结果**，不应再寻找替代编号。修复后的算法正是这个语义。

---

## 缺陷二：未同步项目返回 404 时，提示信息无法区分「库未同步」与「项目无数据」

### 一、问题现象

查询很新发布的项目时，seqout 返回：

```
PRJNA1537414 → HTTP 404，No project found for PRJ accession（库里查无此项目）
```

原样透出后，用户/模型会理解为"这个项目不存在或没有数据"，而实际上是**上游镜像库尚未同步**。

### 二、根因

`seqout.org` 是**定期从 NCBI 同步的镜像库**。很新发布的项目（尤其 `PRJNA` 编号）在同步周期到达前，库里查无此记录，于是返回 404。这与"项目存在但确实无 run"是两种完全不同的情况，但原实现只做了 `HTTP {status}: {body}` 的原样拼接，未加任何语义说明。

### 三、解决方案

在统一的 HTTP 错误处理处，针对 404 + `No project found for PRJ` 的响应体给出**明确的成因说明**。

**参考实现：**

```ts
function describeSeqoutError(status: number, body: string): string {
  if (status === 404 && /No project found for PRJ/i.test(body)) {
    return `seqout 库内尚无此 BioProject（HTTP 404：${body.slice(0, 120)}）。`
      + `seqout 是 seqout.org 定期同步 NCBI 的镜像库，很新发布的项目往往还没同步进来，`
      + `请稍后重试，或直接到 NCBI/ENA 官网查询该项目。`;
  }
  if (status === 404) {
    return `seqout 未收录该项目（HTTP 404：${body.slice(0, 160)}）。可能项目较新尚未同步，或编号有误。`;
  }
  return `seqout HTTP ${status}: ${body.slice(0, 300)}`;
}

// 所有 seqout GET 请求统一走这里
if (!resp.ok) throw new Error(describeSeqoutError(resp.status, text));
```

### 四、期望效果

提示从"查无此项目"变为可执行的说明：**库未同步（稍后重试）/ 改用 NCBI-ENA 官方查询**，与"项目确定无数据"区分开。

---

## 附：移植 checklist

- [ ] GSE→研究编号解析**只读** `relation` / `alias` / `external_id`，**禁止**递归整棵树或读取 `neighbors`、自由文本字段。
- [ ] `alias` / `external_id` 需同时支持 **字符串 / 数组 / 对象** 三种形态。
- [ ] 从 `relation[].@target` 的 URL 抽取编号时，**必须**限定 `@type` 为 `BioProject`/`SRA`，否则实验描述里的 URL 会污染结果。
- [ ] 候选需 `PRJ` 优先、`SRP` 兜底，并**逐个验证确有 run**。
- [ ] 全部候选为 0 run 时**如实返回、不抛异常**（老 GEO-only 项目属正常空结果）。
- [ ] 404 错误区分「库未同步」与「项目无数据」，并给出 NCBI/ENA 兜底路径。
- [ ] 回归用例：GSE117176 应解析为 PRJNA481344 且 5 runs；GSE151530/GSE62944 应解析为真实 PRJ 且 0 run（不得回退到任意 SRP）；PRJNA1537414 应给出"库未同步"提示。
