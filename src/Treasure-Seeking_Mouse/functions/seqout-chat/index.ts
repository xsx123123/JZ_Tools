// seqout-chat: 对话式 GEO 组学数据检索 Edge Function
// 1) LLM (Meoo AI, OpenAI 兼容 + tools) 决定调用哪个 seqout 工具
// 2) 函数内直接 GET https://seqout.org/api/... 执行工具（复刻 seqout-mcp 的 26 个只读能力）
// 3) 流式返回 SSE：delta 为文本增量；event: tool / event: cards 供前端展示执行过程与结果卡片

// 环境变量（Deno / Node 通用；本地自托管时在 server/.env 或进程 env 覆盖）：
//   LLM_API_KEY      必填（自托管）：OpenAI 兼容接口密钥；Meoo 平台 secret 缺省时的兜底
//   LLM_BASE_URL     可选：OpenAI 兼容接口根地址，默认 Meoo AI 的 compatible-mode/v1
//   LLM_MODEL        可选：请求未指定模型时的默认值
//   SEQOUT_BASE_URL  可选：seqout 数据 API 地址
//   NCBI_API_KEY     可选：NCBI E-utilities key（无 key 限 3 次/秒，有 key 10 次/秒）
//   NCBI_EMAIL       可选：NCBI 要求的联系方式（tool=go_xunbaoshu）
const LLM_BASE_URL = envGet('LLM_BASE_URL') || 'https://api.meoo.host/meoo-ai/compatible-mode/v1';
const SEQOUT_BASE_URL = envGet('SEQOUT_BASE_URL') || 'https://seqout.org/api';
const DEFAULT_MODEL = envGet('LLM_MODEL') || 'qwen3.6-plus';
const FUNCTION_NAME = 'seqout-chat';

/** 跨运行时读环境变量：Deno（Meoo 平台）与 Node（本地自托管 server/local.mjs）皆可 */
function envGet(key: string): string {
  const deno = (globalThis as Record<string, unknown>).Deno as
    | { env?: { get: (k: string) => string | undefined } }
    | undefined;
  const fromDeno = deno?.env?.get(key);
  if (fromDeno) return fromDeno;
  const proc = (globalThis as Record<string, unknown>).process as
    | { env?: Record<string, string | undefined> }
    | undefined;
  return proc?.env?.[key] ?? '';
}

type Json = Record<string, unknown> | string | number | boolean | null | Json[];

interface ChatMsg {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// ---------- seqout 工具定义（与 seqout-mcp 26 个工具一一对应） ----------

function strEnum(values: string[]) {
  return { type: 'string', enum: values };
}

const TOOL_DEFS = [
  tool('seqout_search', '在 GEO/SRA/ENA/GSA 公共数据库中跨库搜索组学项目。', { query: reqStr('搜索关键词，如疾病、物种、技术'), limit: intOpt('返回条数，默认5，最大20'), cursor: strOpt('上次响应的 next_cursor，用于翻页') }, ['query']),
  tool('seqout_search_geo', '仅搜索 GEO 数据集（表达谱/芯片/RNA-Seq 等研究）。', { query: reqStr('搜索关键词'), limit: intOpt('返回条数，默认5，最大20'), cursor: strOpt('翻页游标') }, ['query']),
  tool('seqout_search_sra', '仅搜索 SRA 测序记录。', { query: reqStr('搜索关键词'), limit: intOpt('返回条数'), cursor: strOpt('翻页游标') }, ['query']),
  tool('seqout_search_structured', '按物种、实验类型或测序策略过滤搜索。library_strategy 常用值：RNA-Seq、WGS、ChIP-Seq、scRNA-Seq。', { organism: strOpt('物种学名，如 Homo sapiens、Mus musculus'), library_strategy: strOpt('测序策略，如 RNA-Seq/WGS/ChIP-Seq/scRNA-Seq'), assay_l1: strOpt('实验一级分类'), assay_l2: strOpt('实验二级分类'), limit: intOpt('返回条数'), cursor: strOpt('翻页游标') }, []),
  tool('seqout_get_project_detail', '获取 GEO/SRA 项目详情（标题、摘要、设计、样本引用等）。', { accession: reqStr('项目编号，如 GSE151530、PRJNA 系列编号') }, ['accession']),
  tool('seqout_get_project_metadata', '获取项目标题与描述元数据。', { accession: reqStr('项目编号') }, ['accession']),
  tool('seqout_get_project_citation', '获取项目 BibTeX 引用信息。', { accession: reqStr('项目编号') }, ['accession']),
  tool('seqout_get_project_enriched', '获取带本体论注释的增强样本元数据。', { accession: reqStr('项目编号') }, ['accession']),
  tool('seqout_get_experiments', '列出研究的实验。支持 GSE（自动解析为 SRA/BioProject 编号）。', { study_accession: reqStr('研究编号，GSE 或 SRA/PRJ 编号') }, ['study_accession']),
  tool('seqout_get_runs', '列出研究的测序运行（SRR 编号列表）。支持 GSE 自动解析。', { study_accession: reqStr('研究编号') }, ['study_accession']),
  tool('seqout_get_run_download', '获取单个测序运行的下载链接。', { run_accession: reqStr('运行编号，如 SRR 开头') }, ['run_accession']),
  tool('seqout_get_download_links', '获取研究全部运行的下载链接（TSV）。支持 GSE 自动解析。', { study_accession: reqStr('研究编号') }, ['study_accession']),
  tool('seqout_get_metadata_csv', '获取研究合并元数据 CSV 的下载信息。支持 GSE 自动解析。', { study_accession: reqStr('研究编号') }, ['study_accession']),
  tool('seqout_get_sample_metadata', '获取样本元数据；GSM 编号自动使用 sample-detail 通道。', { accession: reqStr('样本编号，如 GSM4581240') }, ['accession']),
  tool('seqout_get_sample_detail', '获取完整样本详细信息。', { accession: reqStr('样本编号，如 GSM4581240') }, ['accession']),
  tool('seqout_get_sample_manifest', '获取 GEO 项目（GSE）的样本清单预览。', { accession: reqStr('GSE 项目编号'), max_samples: intOpt('最多展示的样本数，默认20') }, ['accession']),
  tool('seqout_resolve_accession', '反查 GSM 或 Run 编号归属的项目。', { accession: reqStr('GSM/SRR 等编号') }, ['accession']),
  tool('seqout_resolve_prj', '将 BioProject 编号解析到研究级编号。', { prj_accession: reqStr('BioProject 编号，如 PRJNA732811') }, ['prj_accession']),
  tool('seqout_get_ontology_term', '查询本体论术语及相关信息。', { term: reqStr('本体论术语，如 EFO:0000000 或名称') }, ['term']),
  tool('seqout_get_organisms', '列出数据库支持的物种（最多展示20条并保留总数）。', {}, []),
  tool('seqout_get_common_name', '查询物种学名对应的常用名。', { scientific_name: reqStr('物种学名，如 Homo sapiens') }, ['scientific_name']),
  tool('seqout_get_stats_growth', '获取数据库增长统计。mode 可选 projects、experiments、bases。', { mode: { type: 'string', enum: ['projects', 'experiments', 'bases'], description: '统计维度' } }, []),
  tool('seqout_get_organism_totals', '获取每个物种的实验总数（截断至20条）。', {}, []),
  tool('seqout_get_platform_totals', '获取平台实验总数；传 platform 时查询对应过滤选项。', { platform: strOpt('平台名称，可空') }, []),
  tool('seqout_beacon_info', '获取 Beacon 身份和元数据。', {}, []),
  tool('seqout_beacon_runs', 'Beacon 默认运行记录查询（服务端默认分页，不支持 limit/skip）。', {}, []),
];

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}
function reqStr(desc: string) { return { type: 'string', description: desc }; }
function strOpt(desc: string) { return { type: 'string', description: desc, nullable: true }; }
function intOpt(desc: string) { return { type: 'integer', description: desc, nullable: true }; }

// ---------- seqout API 执行（复刻 mcp 的路径解析逻辑） ----------

const GSE_PATTERN = /^GSE\d+$/i;
const SAMPLE_PATTERN = /^(GSM|SAMN|SAMD)\d+$/i;
const STUDY_PATTERN = /^(SRP|PRJNA|PRJEB|PRJDB)\d+$/i;

async function seqoutGet(path: string, params?: Record<string, string>): Promise<Json> {
  const url = new URL(SEQOUT_BASE_URL + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`seqout HTTP ${resp.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text) as Json; } catch { throw new Error(`seqout 非 JSON 响应: ${text.slice(0, 200)}`); }
  } finally {
    clearTimeout(timer);
  }
}

function findStudyAccession(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const item of data) { const hit = findStudyAccession(item); if (hit) return hit; }
    return null;
  }
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === 'string' && STUDY_PATTERN.test(value) && /accession/i.test(key)) return value.toUpperCase();
    if (typeof value === 'object') { const hit = findStudyAccession(value); if (hit) return hit; }
  }
  return null;
}

async function resolveStudy(accession: string): Promise<string> {
  const acc = accession.trim().toUpperCase();
  if (GSE_PATTERN.test(acc)) {
    const project = await seqoutGet(`/project/${encodeURIComponent(acc)}`);
    const found = findStudyAccession(project);
    if (!found) throw new Error(`${acc} 未找到对应 SRA/BioProject 编号`);
    return found;
  }
  if (!STUDY_PATTERN.test(acc)) throw new Error(`研究编号格式不正确：${acc}（应为 GSE/SRP/PRJNA/PRJEB/PRJDB + 数字）`);
  return acc;
}

function validateSample(accession: string): string {
  const acc = accession.trim().toUpperCase();
  if (!SAMPLE_PATTERN.test(acc)) throw new Error(`样本编号格式不正确：${acc}（应为 GSM/SAMN/SAMD + 数字）`);
  return acc;
}

function q(args: Record<string, Json | undefined>, key: string): string | undefined {
  const v = args[key];
  return v === undefined || v === null || v === '' ? undefined : String(v);
}

async function executeTool(name: string, args: Record<string, Json | undefined>): Promise<Json> {
  switch (name) {
    case 'seqout_search': return wrap(await seqoutGet('/search', compact({ q: q(args, 'query'), cursor: q(args, 'cursor') })));
    case 'seqout_search_geo': return wrap(await seqoutGet('/search/geo', compact({ q: q(args, 'query'), cursor: q(args, 'cursor') })));
    case 'seqout_search_sra': return wrap(await seqoutGet('/search/sra', compact({ q: q(args, 'query'), cursor: q(args, 'cursor') })));
    case 'seqout_search_structured': return wrap(await seqoutGet('/search/structured', compact({ organism: q(args, 'organism'), library_strategy: q(args, 'library_strategy'), assay_l1: q(args, 'assay_l1'), assay_l2: q(args, 'assay_l2'), cursor: q(args, 'cursor') })));
    case 'seqout_get_project_detail': return wrap(await seqoutGet(`/project/${encodeURIComponent(String(args.accession).toUpperCase())}`));
    case 'seqout_get_project_metadata': return wrap(await seqoutGet(`/project/${encodeURIComponent(String(args.accession).toUpperCase())}/metadata`));
    case 'seqout_get_project_citation': return wrap(await seqoutGet(`/project/${encodeURIComponent(String(args.accession).toUpperCase())}/cite`));
    case 'seqout_get_project_enriched': return wrap(await seqoutGet(`/project/${encodeURIComponent(String(args.accession).toUpperCase())}/enriched`));
    case 'seqout_get_experiments': { const s = await resolveStudy(String(args.study_accession)); return wrap(await seqoutGet(`/project/${encodeURIComponent(s)}/experiments`)); }
    case 'seqout_get_runs': { const s = await resolveStudy(String(args.study_accession)); return wrap(await seqoutGet(`/project/${encodeURIComponent(s)}/runs`)); }
    case 'seqout_get_run_download': return wrap(await seqoutGet(`/run/${encodeURIComponent(String(args.run_accession).toUpperCase())}`));
    case 'seqout_get_download_links': { const s = await resolveStudy(String(args.study_accession)); return wrap(await seqoutGet(`/project/${encodeURIComponent(s)}/runs/download`)); }
    case 'seqout_get_metadata_csv': { const s = await resolveStudy(String(args.study_accession)); return wrap(await seqoutGet(`/project/${encodeURIComponent(s)}/metadata/download`)); }
    case 'seqout_get_sample_metadata': { const a = validateSample(String(args.accession)); const path = /^GSM/i.test(a) ? `/sample-detail/${a}` : `/sample/${a}`; return wrap(await seqoutGet(path)); }
    case 'seqout_get_sample_detail': { const a = validateSample(String(args.accession)); return wrap(await seqoutGet(`/sample-detail/${encodeURIComponent(a)}`)); }
    case 'seqout_get_sample_manifest': { const a = String(args.accession).toUpperCase(); return wrap(await seqoutGet(`/geo/series/${encodeURIComponent(a)}/samples`, args.max_samples ? { max_samples: String(args.max_samples) } : undefined)); }
    case 'seqout_resolve_accession': return wrap(await seqoutGet(`/accession/${encodeURIComponent(String(args.accession).toUpperCase())}/project`));
    case 'seqout_resolve_prj': return wrap(await seqoutGet(`/prj/${encodeURIComponent(String(args.prj_accession).toUpperCase())}`));
    case 'seqout_get_ontology_term': return wrap(await seqoutGet('/ontology/term', { term: String(args.term) }));
    case 'seqout_get_organisms': return wrap(await seqoutGet('/organisms'));
    case 'seqout_get_common_name': return wrap(await seqoutGet('/common-name', { scientific_name: String(args.scientific_name) }));
    case 'seqout_get_stats_growth': return wrap(await seqoutGet('/stats/growth', { mode: q(args, 'mode') ?? 'projects' }));
    case 'seqout_get_organism_totals': return wrap(await seqoutGet('/stats/organism-totals'));
    case 'seqout_get_platform_totals': { const p = q(args, 'platform'); return wrap(await seqoutGet(p ? '/stats/platform-filters' : '/stats/platform-totals', p ? { platform: p } : undefined)); }
    case 'seqout_beacon_info': return wrap(await seqoutGet('/beacon/info'));
    case 'seqout_beacon_runs': return wrap(await seqoutGet('/beacon/runs'));
    default: throw new Error(`未知工具：${name}`);
  }
}

function compact(obj: Record<string, string | undefined>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

function wrap(data: Json): Json {
  return { success: true, data };
}

// ---------- T2：PubMed 文献联动（NCBI E-utilities 主路 + Europe PMC 兜底） ----------

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
/** 缓存 key 带检索策略版本号：检索词规则升级后旧缓存自然失效 */
const LIT_STRATEGY_VERSION = 'v1';

interface OutlineSection { section: string; text: string }
interface LiteratureCard {
  status: 'ok' | 'not_found';
  pmid?: string; title?: string; journal?: string; year?: string; doi?: string;
  outline?: OutlineSection[];
  urls?: { pubmed?: string; doi?: string; full_text?: string };
  suggested_queries?: string[];
}

// --- 进程内缓存（Edge 实例级；TTL 正缓存 30 天 / 负缓存 7 天，量级小直接 Map） ---
const LIT_TTL_OK = 30 * 24 * 3600;
const LIT_TTL_NEG = 7 * 24 * 3600;
const litCache = new Map<string, { expires: number; card: LiteratureCard }>();

function cacheGet(key: string): LiteratureCard | null {
  const hit = litCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { litCache.delete(key); return null; }
  return hit.card;
}
function cacheSet(key: string, card: LiteratureCard): void {
  litCache.set(key, { expires: Date.now() + (card.status === 'ok' ? LIT_TTL_OK : LIT_TTL_NEG) * 1000, card });
  // 粗暴容量上限：超过 2000 条清最旧的一半（Map 迭代序 = 插入序）
  if (litCache.size > 2000) {
    const drop = litCache.size - 1000;
    let i = 0;
    for (const k of litCache.keys()) { if (i++ >= drop) break; litCache.delete(k); }
  }
}

// --- token bucket 限流：NCBI 无 key 3 req/s / 有 key 10 req/s，留 0.5 余量 ---
const ncbiBucket = { tokens: 2.5, last: Date.now(), capacity: 2.5 };
const NCBI_RATE = envGet('NCBI_API_KEY') ? 9.5 : 2.5;

function acquireNcbi(): boolean {
  const now = Date.now();
  ncbiBucket.tokens = Math.min(ncbiBucket.capacity, ncbiBucket.tokens + ((now - ncbiBucket.last) / 1000) * NCBI_RATE);
  ncbiBucket.last = now;
  if (ncbiBucket.tokens >= 1) { ncbiBucket.tokens -= 1; return true; }
  return false; // 不排队等待：直接降级 Europe PMC（它无限流压力）
}

// --- HTTP helper：429/5xx 退避 1s/2s/4s，三次后抛出 ---
async function fetchWithRetry(url: string, timeoutMs = 6000, retries = 3): Promise<Json> {
  let delay = 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(delay, 4000));
      delay *= 2;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (resp.ok) return JSON.parse(await resp.text()) as Json;
      if (resp.status === 429 || resp.status >= 500) continue; // 重试
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('unreachable');
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function eutilsParams(params: Record<string, string>): string {
  const usp = new URLSearchParams({ tool: 'go_xunbaoshu', ...params });
  const email = envGet('NCBI_EMAIL');
  const key = envGet('NCBI_API_KEY');
  if (email) usp.set('email', email);
  if (key) usp.set('api_key', key);
  return usp.toString();
}

/** esearch：关键词 → PMID 列表 */
async function esearch(term: string, retmax = 5): Promise<string[]> {
  const json = await fetchWithRetry(`${EUTILS}/esearch.fcgi?${eutilsParams({ db: 'pubmed', term, retmode: 'json', retmax: String(retmax) })}`);
  const ids = (json as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist;
  return Array.isArray(ids) ? ids : [];
}

/** esummary：PMID → 标题/期刊/日期/DOI */
async function esummary(pmids: string[]): Promise<Record<string, { title?: string; journal?: string; pubdate?: string; doi?: string }>> {
  if (pmids.length === 0) return {};
  const json = await fetchWithRetry(`${EUTILS}/esummary.fcgi?${eutilsParams({ db: 'pubmed', id: pmids.join(','), retmode: 'json' })}`);
  const result = (json as { result?: Record<string, unknown> }).result ?? {};
  const out: Record<string, { title?: string; journal?: string; pubdate?: string; doi?: string }> = {};
  for (const pmid of pmids) {
    const item = result[pmid] as { title?: string; fulljournalname?: string; pubdate?: string; articleids?: { type?: string; value?: string }[] } | undefined;
    if (!item) continue;
    const doi = (item.articleids ?? []).find((a) => a.type === 'doi')?.value;
    out[pmid] = { title: item.title, journal: item.fulljournalname, pubdate: item.pubdate, doi };
  }
  return out;
}

/** efetch：PMID → 结构化摘要分段（无 Label 则整段降级为 "Abstract"） */
async function efetchOutline(pmid: string): Promise<OutlineSection[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const resp = await fetch(`${EUTILS}/efetch.fcgi?${eutilsParams({ db: 'pubmed', id: pmid, rettype: 'abstract', retmode: 'xml' })}`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`efetch HTTP ${resp.status}`);
    const xml = await resp.text();
    const sections: OutlineSection[] = [];
    // 轻量 XML 解析：AbstractText 标签配对正则（避免引 DOMParser，Deno/Node 均原生可用但保持零依赖风格）
    const re = /<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const labelMatch = /Label="([^"]*)"/.exec(m[1]);
      const label = labelMatch ? labelMatch[1] : '';
      const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) sections.push({ section: label || 'Abstract', text });
    }
    if (sections.length === 0) return [{ section: 'Abstract', text: xml.replace(/<[^>]+>/g, '').trim().slice(0, 2000) || '' }].filter((s) => s.text);
    return sections;
  } finally {
    clearTimeout(timer);
  }
}

/** Europe PMC 兜底：DOI/PMID 查 core 结果（OA 全文地址覆盖更好） */
async function epmcLookup(query: string): Promise<LiteratureCard | null> {
  const json = await fetchWithRetry(`${EPMC}?${new URLSearchParams({ query, format: 'json', resultType: 'core' })}`);
  const first = (json as { resultList?: { result?: Record<string, unknown>[] } }).resultList?.result?.[0];
  if (!first) return null;
  const title = String(first.title || '').trim();
  const pmid = String(first.pmid || '');
  if (!title) return null;
  const journalInfo = first.journalInfo as { journal?: { title?: string }; yearOfPublication?: number } | undefined;
  const fullTextUrls = (first.fullTextUrlList as { fullTextUrl?: { documentStyle?: string; availability?: string; url?: string }[] } | undefined)?.fullTextUrl ?? [];
  const oa = fullTextUrls.find((u) => u.documentStyle === 'pdf' || u.availability === 'Open access');
  const sections: OutlineSection[] = [];
  const abstract = String(first.abstractText || '').trim();
  if (abstract) sections.push({ section: 'Abstract', text: abstract });
  return {
    status: 'ok',
    pmid: pmid || undefined,
    title,
    journal: journalInfo?.journal?.title || undefined,
    year: journalInfo?.yearOfPublication ? String(journalInfo.yearOfPublication) : undefined,
    doi: String(first.doi || '') || undefined,
    outline: sections,
    urls: {
      pubmed: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
      doi: first.doi ? `https://doi.org/${first.doi}` : undefined,
      full_text: oa?.url,
    },
  };
}

/** 检索策略：三级（条目自带 PMID/DOI → 工具型数据库 → GO 本体），返回 esearch 检索词 */
function buildSearchTerms(kind: string, idOrName: string): string[] {
  if (kind === 'pubmed') return []; // 直接按 PMID 查，不走 esearch
  if (kind === 'go_term') return [`"${idOrName}"[Title] AND "Gene Ontology"[Title]`, `${idOrName} gene ontology consortium`];
  // geo_series / geo_sample：编号必须出现在标题里（否则 esearch 会匹配到正文顺带提及 GEO 的无关文献）
  return [`${idOrName}[Title]`];
}

/** GEO 条目自带 PMID 反查（seqout 项目详情的 pubmed_id 字段，精确命中优先于关键词检索） */
async function linkedPubmedId(kind: string, idOrName: string): Promise<string | null> {
  if (kind !== 'geo_series' && kind !== 'geo_sample') return null;
  try {
    const detail = await seqoutGet(`/project/${encodeURIComponent(idOrName)}`);
    const pmids = (detail as { pubmed_id?: unknown }).pubmed_id;
    if (Array.isArray(pmids) && typeof pmids[0] === 'string' && pmids[0]) return pmids[0];
    if (typeof pmids === 'string' && pmids) return pmids;
  } catch { /* seqout 未收录该编号 → 走关键词检索 */ }
  return null;
}

/** 文献联动主入口：选中编号 → 文献卡片（not_found 是正常业务状态，不算 error） */
async function fetchLiterature(kind: string, idOrName: string): Promise<LiteratureCard> {
  const cacheKey = `${LIT_STRATEGY_VERSION}:${kind}:${idOrName}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let card: LiteratureCard | null = null;
  const suggested = buildSearchTerms(kind, idOrName);

  try {
    if (kind === 'pubmed') {
      // 直接 PMID：esummary + efetch
      const pmid = idOrName.replace(/^PMID:?/i, '').trim();
      if (!acquireNcbi()) throw new Error('rate-limited');
      const meta = await esummary([pmid]);
      const m = meta[pmid];
      if (m?.title) {
        const outline = await (acquireNcbi() ? efetchOutline(pmid) : Promise.resolve([{ section: 'Abstract', text: '' } as OutlineSection]));
        card = {
          status: 'ok', pmid, title: m.title, journal: m.journal,
          year: (m.pubdate || '').slice(0, 4), doi: m.doi,
          outline: outline.filter((s) => s.text),
          urls: {
            pubmed: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            doi: m.doi ? `https://doi.org/${m.doi}` : undefined,
          },
        };
      }
    } else {
      // 三级检索：① GEO 条目自带 PMID（精确） → ② esearch 关键词
      const linked = await linkedPubmedId(kind, idOrName);
      const tryTerms = linked ? [`__direct__:${linked}`] : suggested;
      for (const term of tryTerms) {
        let pmid: string;
        if (term.startsWith('__direct__:')) {
          pmid = term.slice('__direct__:'.length); // seqout 自带 PMID，跳过 esearch
        } else {
          if (!acquireNcbi()) break;
          const ids = await esearch(term, 3);
          if (ids.length === 0) continue;
          pmid = ids[0];
        }
        const meta = await esummary([pmid]);
        const m = meta[pmid];
        if (m?.title) {
          const outline = acquireNcbi() ? await efetchOutline(pmid) : [];
          card = {
            status: 'ok', pmid, title: m.title, journal: m.journal,
            year: (m.pubdate || '').slice(0, 4), doi: m.doi,
            outline: outline.filter((s) => s.text),
            urls: {
              pubmed: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
              doi: m.doi ? `https://doi.org/${m.doi}` : undefined,
            },
          };
          break;
        }
      }
    }
  } catch (err) {
    console.warn(`[${FUNCTION_NAME}] NCBI fallback to Europe PMC ${idOrName}: ${err instanceof Error ? err.message : String(err)}`);
    // NCBI 3 次退避仍失败 / 429 持续 → 整条链路降级 Europe PMC；UI 无感知
    try {
      card = await epmcLookup(`DOI:"${idOrName}" OR EXT_ID:${idOrName}`);
    } catch { /* 兜底也失败则走 not_found */ }
  }

  const final: LiteratureCard = card ?? {
    status: 'not_found',
    suggested_queries: suggested.length ? suggested : [idOrName],
  };
  cacheSet(cacheKey, final);
  return final;
}

// 结果瘦身：搜索类结果截断 summary，集合截断到 20 条，控制回传给 LLM 的体积
function trimForLLM(payload: Json): string {
  let text: string;
  try { text = JSON.stringify(payload); } catch { text = String(payload); }
  if (text.length <= 100000) return text;
  try {
    const obj = payload as { data?: Record<string, Json> | Json };
    if (obj && typeof obj === 'object' && obj.data && !Array.isArray(obj.data) && Array.isArray((obj.data as Record<string, Json>).results)) {
      const results = ((obj.data as Record<string, Json>).results as Json[]).slice(0, 10).map((r) => {
        const item = { ...(r as Record<string, Json>) };
        if (typeof item.summary === 'string' && item.summary.length > 400) item.summary = item.summary.slice(0, 400) + '…';
        return item;
      });
      const payloadObj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, Json>;
      const dataObj = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<string, Json>;
      const trimmed = { ...payloadObj, data: { ...dataObj, results, truncated: true } };
      return JSON.stringify(trimmed).slice(0, 100000);
    }
  } catch { /* fallthrough */ }
  return text.slice(0, 100000) + '…(truncated)';
}

// 从工具结果里提取可展示的数据集卡片
function extractCards(name: string, payload: Json): Json[] {
  try {
    const data = (payload as { data?: unknown }).data;
    if (!data || typeof data !== 'object') return [];
    const list = Array.isArray(data) ? data : (data as { results?: unknown }).results;
    if (!Array.isArray(list)) return [];
    const cards: Json[] = [];
    for (const item of list.slice(0, 20)) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, Json>;
      const accession = typeof it.accession === 'string' ? it.accession
        : typeof it.run_accession === 'string' ? it.run_accession
        : typeof it.experiment_accession === 'string' ? it.experiment_accession
        : typeof it.sample_accession === 'string' ? it.sample_accession
        : '';
      const title = typeof it.title === 'string' ? it.title : typeof it.name === 'string' ? it.name : typeof it.latin_name === 'string' ? it.latin_name : '';
      if (!accession && !title) continue;
      const summary = typeof it.summary === 'string' ? it.summary.slice(0, 600) : typeof it.description === 'string' ? it.description.slice(0, 600) : '';
      const meta: Record<string, string> = {};
      for (const key of ['organism', 'species', 'common_name', 'overall_design', 'library_strategy', 'instrument', 'platform', 'total', 'status'] as const) {
        const v = it[key];
        if (typeof v === 'string' || typeof v === 'number') meta[key] = String(v);
      }
      cards.push({ tool: name, accession, title, summary, meta });
    }
    return cards;
  } catch { return []; }
}

const SYSTEM_PROMPT = `你是「GEO寻宝鼠」，一只住在公共组学数据库矿脉里的寻宝鼠助手，帮助用户通过 seqout.org 的公开接口查找 GEO/SRA/ENA/GSA 数据（把检索比作"挖宝"，但回答主体保持专业简洁）。

规则：
1. 优先使用工具查询真实数据，绝不编造编号、标题或链接。没有调用工具就不要给出具体数据集信息。
2. 用户提到"数据集/GEO/表达谱/芯片"时用 seqout_search_geo；宽泛发现用 seqout_search；有明确物种/实验类型条件时用 seqout_search_structured（organism 用学名，如 Homo sapiens）。
3. GSE 编号查详情用 seqout_get_project_detail；问样本用 seqout_get_sample_manifest；问实验/运行/下载分别用 seqout_get_experiments / seqout_get_runs / seqout_get_download_links（它们能自动解析 GSE）。
4. 用户给 GSM/SRR 编号想知道归属项目时用 seqout_resolve_accession。
5. 回答用简体中文，简洁专业。搜索结果请用 Markdown 列表总结（编号加粗），系统会自动把命中的数据集渲染成卡片，你不需要重复粘贴完整摘要。
6. 无结果时说明原因并建议放宽关键词或使用结构化筛选。工具报错时如实转述错误（如编号格式不对、服务超时），并给出下一步建议。
7. 涉及统计（增长、物种总量、平台）时使用对应 stats 工具。
8. 当且仅当回答末尾想给用户推荐后续检索方向时，把建议写成如下固定格式附在正文最后（前端会渲染成可点击的折叠卡片）：
:::followup
1. 建议一（一句话、可直接作为提问发送）
2. 建议二
:::
每条建议不超过 40 字；没有值得推荐的后续方向就不要输出该块。除此格式外不要输出其他指令性标记。`;

export const handler = async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  try {
    const projectUrlId = req.headers.get('X-Meoo-Project-Url-Id')?.trim() || '';
    const projectSecretName = `MEOO_PROJECT_API_KEY_${projectUrlId}`;
    const projectServiceAK =
      (projectUrlId ? envGet(projectSecretName) : '') ||
      envGet('MEOO_PROJECT_API_KEY') ||
      envGet('LLM_API_KEY') || '';

    // 文献联动 action 只打公共 API，不需要 AI 凭证，放在凭证检查之前
    if (req.method === 'POST') {
      const ct = req.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) {
        try {
          const body = (await req.json()) as { action?: string };
          if (body.action === 'literature') {
            const kind = String(body.kind || '');
            const idOrName = String(body.id || '').trim();
            const VALID_KINDS = ['geo_series', 'geo_sample', 'go_term', 'pubmed'];
            if (!VALID_KINDS.includes(kind) || !idOrName) {
              return new Response(JSON.stringify({ error: '参数不完整：需要 kind（geo_series/geo_sample/go_term/pubmed）与 id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            try {
              const t0 = Date.now();
              const card = await fetchLiterature(kind, idOrName);
              console.info(`[${FUNCTION_NAME}] literature ${requestId} ${kind}:${idOrName} -> ${card.status} ${Date.now() - t0}ms`);
              return new Response(JSON.stringify(card), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Literature lookup failed';
              console.warn(`[${FUNCTION_NAME}] literature failed ${requestId}: ${message}`);
              return new Response(JSON.stringify({ error: '文献服务暂时不可用，请稍后重试' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
          }
        } catch { /* JSON 解析失败 → 走正常对话流程，由下方 req.json() 报错 */ }
      }
    }

    if (!projectServiceAK) {
      return new Response(JSON.stringify({ error: '当前项目的 AI 服务凭证未就绪，请稍后重试' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    // GET：模型目录（注入 defaultModel：优先本地 LLM_MODEL 配置，让前端默认选中它）
    // 超时放宽到 8s：网关冷启动/跨网较慢时前端仍能拿到目录，避免回退到无效的兜底模型
    if (req.method === 'GET') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${LLM_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${projectServiceAK}` },
          signal: controller.signal,
        });
        const text = await response.text();
        let body = text;
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object') {
            const upstreamDefault = typeof parsed.defaultModel === 'string' ? parsed.defaultModel : '';
            const configured = envGet('LLM_MODEL');
            const finalDefault = configured || upstreamDefault;
            if (finalDefault) parsed.defaultModel = finalDefault;
            body = JSON.stringify(parsed);
          }
        } catch { /* 非 JSON 响应原样透传 */ }
        return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch {
        return new Response(JSON.stringify({ error: '模型目录暂时不可用' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } finally {
        clearTimeout(timer);
      }
    }

    const body = await req.json();
    const history = (body.messages || []) as ChatMsg[];
    const model = (body.model as string) || DEFAULT_MODEL;
    const messages: ChatMsg[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history.slice(-16)];

    console.info(`[${FUNCTION_NAME}] request ${requestId} model=${model} messages=${history.length}`);

    const encoder = new TextEncoder();
    const allCards: Json[] = [];
    const toolLogs: { name: string; label: string; ok: boolean; ms: number }[] = [];
    let aborted = false;
    req.signal.addEventListener('abort', () => { aborted = true; });

    const readable = new ReadableStream({
      async start(controller) {
        // 心跳：每 10s 发送 SSE 注释行，避免代理层对长连接的缓冲/超时
        const heartbeat = setInterval(() => {
          if (aborted) return;
          try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { /* closed */ }
        }, 10000);
        const send = (obj: Json) => {
          if (aborted) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
        };
        try {
          for (let round = 0; round < 40; round++) {
            const llmResp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${projectServiceAK}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model, messages, stream: true, tools: TOOL_DEFS, tool_choice: 'auto' }),
            });
            if (!llmResp.ok) {
              const errText = await llmResp.text();
              console.error(`[${FUNCTION_NAME}] upstream failed ${requestId} status=${llmResp.status}: ${errText.slice(0, 300)}`);
              send({ error: `AI 服务返回 ${llmResp.status}` });
              break;
            }
            // 解析上游 SSE，聚合文本与 tool_calls
            const reader = llmResp.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let textBuf = '';
            const toolCalls: Record<number, ToolCall> = {};
            let sawDone = false;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const payload = t.slice(5).trim();
                if (payload === '[DONE]') { sawDone = true; continue; }
                try {
                  const json = JSON.parse(payload);
                  const choice = json.choices?.[0];
                  if (!choice) continue;
                  const content = choice.delta?.content;
                  if (typeof content === 'string' && content.length) { textBuf += content; send({ delta: content }); }
                  const calls = choice.delta?.tool_calls;
                  if (Array.isArray(calls)) {
                    for (const c of calls) {
                      const idx = c.index ?? 0;
                      if (!toolCalls[idx]) toolCalls[idx] = { id: c.id || `call_${idx}`, type: 'function', function: { name: '', arguments: '' } };
                      if (c.id) toolCalls[idx].id = c.id;
                      if (c.function?.name) toolCalls[idx].function.name += c.function.name;
                      if (c.function?.arguments) toolCalls[idx].function.arguments += c.function.arguments;
                    }
                  }
                } catch { /* ignore partial */ }
              }
            }
            const callsArr = Object.values(toolCalls).filter((c) => c.function.name);
            if (!callsArr.length) {
              if (!sawDone) send({ delta: '' });
              break;
            }
            // 执行工具，把结果作为 tool message 继续下一轮
            messages.push({ role: 'assistant', content: textBuf || null, tool_calls: callsArr });
            for (const call of callsArr) {
              const label = labelOf(call.function.name);
              const t0 = Date.now();
              send({ event: 'tool', name: call.function.name, label, status: 'running' });
              let resultText: string;
              try {
                const args = JSON.parse(call.function.arguments || '{}') as Record<string, Json | undefined>;
                const payload = await executeTool(call.function.name, args);
                const cards = extractCards(call.function.name, payload);
                if (cards.length) { allCards.push(...cards); send({ event: 'cards', cards }); }
                resultText = trimForLLM(payload);
                toolLogs.push({ name: call.function.name, label, ok: true, ms: Date.now() - t0 });
                send({ event: 'tool', name: call.function.name, label, status: 'done', ms: Date.now() - t0 });
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                resultText = JSON.stringify({ success: false, error: message });
                toolLogs.push({ name: call.function.name, label, ok: false, ms: Date.now() - t0 });
                send({ event: 'tool', name: call.function.name, label, status: 'error', ms: Date.now() - t0, error: message });
                console.warn(`[${FUNCTION_NAME}] tool failed ${requestId} ${call.function.name}: ${message.slice(0, 200)}`);
              }
              messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: resultText });
            }
            textBuf = '';
            if (round === 39) send({ delta: '\n\n（已达到本轮最大查询次数，请追问以继续。）' });
          }
          send({ event: 'end', cards: allCards, tools: toolLogs });
          console.info(`[${FUNCTION_NAME}] stream done ${requestId} tools=${toolLogs.length} durationMs=${Date.now() - startTime}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Internal Server Error';
          console.error(`[${FUNCTION_NAME}] stream failed ${requestId}: ${message}`);
          send({ error: message });
        } finally {
          clearInterval(heartbeat);
          try { controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); } catch { /* closed */ }
        }
      },
    });

    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error(`[${FUNCTION_NAME}] failed ${requestId}: ${message}`);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

// Meoo 平台（Deno 运行时）直接启动 HTTP 服务；本地 Node 自托管由 server/local.mjs import 上面的 handler
const denoRuntime = (globalThis as Record<string, unknown>).Deno as
  | { serve?: (h: (req: Request) => Response | Promise<Response>) => void }
  | undefined;
denoRuntime?.serve(handler);

function labelOf(name: string): string {
  const map: Record<string, string> = {
    seqout_search: '跨库搜索组学项目',
    seqout_search_geo: '搜索 GEO 数据集',
    seqout_search_sra: '搜索 SRA 记录',
    seqout_search_structured: '结构化条件搜索',
    seqout_get_project_detail: '查询项目详情',
    seqout_get_project_metadata: '查询项目元数据',
    seqout_get_project_citation: '查询项目引用',
    seqout_get_project_enriched: '查询增强元数据',
    seqout_get_experiments: '查询实验列表',
    seqout_get_runs: '查询测序运行',
    seqout_get_run_download: '查询运行下载链接',
    seqout_get_download_links: '获取批量下载链接',
    seqout_get_metadata_csv: '获取元数据 CSV',
    seqout_get_sample_metadata: '查询样本元数据',
    seqout_get_sample_detail: '查询样本详情',
    seqout_get_sample_manifest: '查询样本清单',
    seqout_resolve_accession: '反查编号归属',
    seqout_resolve_prj: '解析 BioProject',
    seqout_get_ontology_term: '查询本体论术语',
    seqout_get_organisms: '查询支持物种',
    seqout_get_common_name: '查询物种常用名',
    seqout_get_stats_growth: '查询增长统计',
    seqout_get_organism_totals: '查询物种总量',
    seqout_get_platform_totals: '查询平台总量',
    seqout_beacon_info: '查询 Beacon 信息',
    seqout_beacon_runs: '查询 Beacon 运行',
  };
  return map[name] || name;
}
