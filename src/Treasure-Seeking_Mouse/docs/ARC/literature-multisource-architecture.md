# 多源文献检索架构与外网验收说明

> 适用范围：`functions/seqout-chat/index.ts` 的 `literature_search`，以及前端论文卡片、文献证据链。
> 
> 当前来源：PubMed、Europe PMC、Crossref、OpenAlex、Semantic Scholar、CORE、arXiv、bioRxiv、medRxiv。

## 1. 先说结论

文献检索和组学检索**共用同一条对话编排路线**，但不是同一条数据访问路线。

共用部分：

```text
用户自然语言
  -> LLM 判断意图
  -> OpenAI function schema
  -> executeTool()
  -> 统一 trim / cards / SSE
  -> 前端论文卡片
```

分开部分：

```text
组学路线：seqout / NGDC
  -> GSE、GSM、SRR、PRJ、GSA 等编号和项目数据

文献路线：PubMed / Europe PMC / Crossref / OpenAlex / Semantic Scholar
          / CORE / arXiv / bioRxiv / medRxiv
  -> DOI、PMID、论文标题、作者、摘要、预印本和全文链接
```

因此，文献搜索不是把组学数据库“换个关键词再搜一次”，而是一个独立的多提供商检索层；它们只在对话入口、工具循环、结果卡片和统计层汇合。

## 2. `source=all` 的执行方式

`literature_search` 支持显式来源：

```text
pubmed | europe_pmc | crossref | openalex | semantic_scholar
core | arxiv | biorxiv | medrxiv
```

未指定来源时默认为 `all`。服务端执行：

```ts
const sources = [
  "pubmed", "europe_pmc", "crossref", "openalex", "semantic_scholar",
  "core", "arxiv", "biorxiv", "medrxiv",
];

const settled = await Promise.allSettled(
  sources.map((source) => searchLiteratureSource(source, args)),
);
```

这意味着九个来源会并行发起请求。`Promise.allSettled` 保证单个来源超时、限流、Key 错误或接口暂时不可用时，其余来源仍可返回。失败来源会写入 `warnings`，不会让整次搜索失败。

合并阶段会：

1. 读取各来源的 `results`。
2. 优先使用 DOI 去重，其次使用 PMID，最后使用小写标题去重。
3. 统一成 `LiteratureSearchResult`。
4. 截断到用户请求的 `limit`。
5. 通过 `extractCards()` 转为前端 `cards` SSE 事件。

## 3. 各来源适配器

| 来源 | 当前接口 | Key | 主要用途 |
| --- | --- | --- | --- |
| PubMed | NCBI E-utilities | `NCBI_API_KEY` 可选，`NCBI_EMAIL` 建议 | 生物医学正式论文、PMID、摘要 |
| Europe PMC | Europe PMC REST | 不需要 | PubMed 补充、OA 信息、全文链接 |
| Crossref | `api.crossref.org/works` | 不需要，`CROSSREF_MAILTO` 建议 | DOI 元数据、出版物信息 |
| OpenAlex | `api.openalex.org/works` | `OPENALEX_API_KEY` 可选，`OPENALEX_MAILTO` 建议 | 跨学科论文、开放获取位置 |
| Semantic Scholar | Graph API | `SEMANTIC_SCHOLAR_API_KEY` 可选 | 语义相关论文、引用友好的元数据 |
| CORE | `api.core.ac.uk/v3/search/works` | `CORE_API_KEY` 必须 | 开放获取论文、全文或 PDF 链接 |
| arXiv | `export.arxiv.org/api/query` | 不需要 | 计算机、物理、数学、q-bio 预印本 |
| bioRxiv | `api.biorxiv.org/details/biorxiv` | 不需要 | 生命科学预印本 |
| medRxiv | `api.biorxiv.org/details/medrxiv` | 不需要 | 医学和临床预印本 |

### 当前实现的两个边界

- CORE 没有 `CORE_API_KEY` 时，单独查询会返回配置错误；`source=all` 会把错误放进 `warnings`，不影响其他来源。
- bioRxiv / medRxiv 官方 details 接口按日期返回记录，当前适配器读取最近一批记录后在服务端按关键词过滤。因此它们适合验证连通性和追踪近期预印本；要做历史全库检索，后续应增加日期窗口分页。

## 4. 和组学搜索的关系

### 相同点

- 都由同一个 LLM tool-calling 循环决定是否调用。
- 都在服务端执行，前端不持有第三方 Key。
- 都通过 `trimForLLM` 控制模型上下文大小。
- 都通过独立 `cards` 事件把结构化结果交给前端。
- 都能在一次对话中连续调用多个工具，例如先搜 GSE，再搜该研究关联论文。

### 不同点

| 维度 | 组学搜索 | 文献搜索 |
| --- | --- | --- |
| 数据对象 | 项目、样本、实验、运行、下载链接 | 论文、预印本、DOI、摘要、全文链接 |
| 主要编号 | GSE、GSM、SRR、PRJ、CRA、GWH | PMID、DOI、arXiv ID、预印本 DOI |
| 数据源形态 | 少量公共数据 API，字段较稳定 | 九个提供商，字段和限流策略差异大 |
| 结果正确性 | 编号归属和项目关系优先 | DOI/PMID 去重、来源标记和原文链接优先 |
| 证据链 | GSE/GSM → PubMed / Europe PMC | 单篇 PMID/DOI → 摘要、作者、全文和原始页面 |
| Key | seqout/NGDC 大多不需要 | NCBI、CORE、OpenAlex、Semantic Scholar 按来源配置 |

### 小鼠 RNA-seq 示例

用户问“搜索小鼠 RNA-seq 相关文章”时，LLM 会调用：

```json
{
  "query": "Mus musculus RNA-seq",
  "source": "all",
  "limit": 10
}
```

九个文献来源并行检索。若用户进一步问“找出能直接下载原始数据的研究”，才会切换到组学路线，调用 `seqout_search` / `seqout_search_geo`，再根据 GSE、SRR 或 PRJ 编号查询样本、运行和下载链接。两条路线可以在同一轮对话中串联，但不会把论文 API 当作组学数据 API 使用。

## 5. 外网 Agent 验收流程

### 5.1 配置检查

只检查变量是否存在，不要打印值：

```bash
for k in NCBI_EMAIL NCBI_API_KEY CROSSREF_MAILTO OPENALEX_MAILTO \
  OPENALEX_API_KEY SEMANTIC_SCHOLAR_API_KEY CORE_API_KEY; do
  grep -qE "^${k}=[^#[:space:]]+" server/.env \
    && echo "$k=set" || echo "$k=missing"
done
```

### 5.2 逐源连通性

使用“小鼠 RNA-seq”作为统一关键词。只记录 HTTP 状态、响应是否为合法 JSON/XML、结果数量和是否有标题，不要输出 Key：

```text
PubMed       esearch.fcgi?db=pubmed&term=mouse RNA-seq&retmode=json&retmax=1
Europe PMC   /rest/search?query=mouse RNA-seq&format=json&pageSize=1
Crossref     /works?query.bibliographic=mouse RNA-seq&rows=1
OpenAlex     /works?search=mouse RNA-seq&per-page=1
Semantic     /graph/v1/paper/search?query=mouse RNA-seq&limit=1
CORE         /v3/search/works?q=mouse RNA-seq&limit=1（Bearer CORE_API_KEY）
arXiv        /api/query?search_query=all:mouse RNA-seq&max_results=1
bioRxiv      /details/biorxiv/0/1
medRxiv      /details/medrxiv/0/1
```

### 5.3 应用级验收

启动服务后发送三组问题：

1. `搜索小鼠 RNA-seq 的文章`
2. `只搜索 CORE 上开放获取的小鼠 RNA-seq 论文`
3. `找小鼠 RNA-seq 研究，并给出可以继续查找原始数据的 GSE/SRR/PRJ 线索`

验收标准：

- 第一问返回多个来源的论文卡片，卡片包含来源、标题和至少一个原文链接。
- 第二问只出现 CORE 结果；没有 Key 时返回清晰配置提示。
- 第三问先返回文献结果，若出现数据集编号，后续能继续调用组学工具。
- 某一来源断网或返回 429 时，其他来源仍返回结果，并在响应数据中记录 warning。
- `source=all` 的服务端日志显示九个来源进入同一轮并行调度，而不是串行等待。

## 6. 相关文件

- `functions/seqout-chat/index.ts`：工具 schema、来源适配器、并行合并和卡片提取。
- `functions/seqout-chat/prompts/system-zh.md` / `system-en.md`：模型的来源选择规则。
- `server/.env.example`：所有服务端 Key 和联系邮箱模板。
- `src/components/chat/DatasetCard.tsx`：论文卡片与来源链接展示。
- `docs/literature-search-and-evidence-chain.md`：单篇文献证据链设计。

