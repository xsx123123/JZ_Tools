// seqout-chat: GEO寻宝鼠统一后端云函数（QMuse / Appwrite node-22 ESM）
// 对话域（同一信任边界，单入口 action 路由）：
//   models / chat        → LLM (OpenAI 兼容 + tools) tool-calling 循环，函数内直接 GET seqout.org 执行 26 个只读工具
//   literature           → T2 PubMed 文献联动（NCBI E-utilities + Europe PMC 兜底，不需要 LLM 凭证）
//   leaderboard          → 汇总 user_stats / guest_stats 两表排行榜
//   bump_guest           → 访客按 device_id 累计 treasures/digs/chats（自动跨周归零）
//   set_guest_name       → 访客自定义昵称
// 对话域非流式整包返回：{ text, cards, tools }（QMuse 云函数不支持 SSE，由前端模拟流式）

// 环境变量（由 QMuse 密钥管理注入）：
//   LLM_API_KEY      必填：OpenAI 兼容接口密钥
//   LLM_BASE_URL     可选：OpenAI 兼容接口根地址
//   LLM_MODEL        可选：请求未指定模型时的默认值
//   SEQOUT_BASE_URL  可选：seqout 数据 API 地址
//   NCBI_API_KEY     可选：NCBI E-utilities key（无 key 限 3 次/秒，有 key 10 次/秒）
//   NCBI_EMAIL       可选：NCBI 要求的联系方式（tool=go_xunbaoshu）
import { Client, TablesDB, Query, ID, Permission, Role } from 'node-appwrite';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.meoo.host/meoo-ai/compatible-mode/v1';
const SEQOUT_BASE_URL = process.env.SEQOUT_BASE_URL || 'https://seqout.org/api';
const DEFAULT_MODEL = process.env.LLM_MODEL || 'qwen3.6-plus';
const FUNCTION_NAME = 'seqout-chat';

// ---------- seqout 工具定义（与 seqout-mcp 26 个工具一一对应） ----------

function strEnum(values) {
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
  tool('seqout_get_download_links', '获取研究全部运行的下载链接表（含 fastq/sra 直链、大小、MD5）。支持 GSE 自动解析。GEO-only 项目若无公开 run 会返回空表说明。', { study_accession: reqStr('研究编号') }, ['study_accession']),
  tool('seqout_get_metadata_csv', '获取研究合并样本/运行元数据表（测序策略、平台、样本属性等）。支持 GSE 自动解析。GEO-only 项目若无实验会返回空结果说明。', { study_accession: reqStr('研究编号') }, ['study_accession']),
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

function tool(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}
function reqStr(desc) { return { type: 'string', description: desc }; }
function strOpt(desc) { return { type: 'string', description: desc, nullable: true }; }
function intOpt(desc) { return { type: 'integer', description: desc, nullable: true }; }

// ---------- seqout API 执行（复刻 mcp 的路径解析逻辑） ----------

const GSE_PATTERN = /^GSE\d+$/i;
const SAMPLE_PATTERN = /^(GSM|SAMN|SAMD)\d+$/i;
const STUDY_PATTERN = /^(SRP|PRJNA|PRJEB|PRJDB)\d+$/i;

/** 把 seqout 的 HTTP 错误转成对用户/模型都清楚的说明。seqout 是定期从 NCBI 同步的镜像库，
 *  很新的项目（尤其 PRJNA 编号）尚未同步时会 404 —— 这与"项目存在但无数据"是两回事。 */
function describeSeqoutError(status, body) {
  if (status === 404 && /No project found for PRJ/i.test(body)) {
    return `seqout 库内尚无此 BioProject（HTTP 404：${body.slice(0, 120)}）。seqout 是 seqout.org 定期同步 NCBI 的镜像库，很新发布的项目往往还没同步进来，请稍后重试，或直接到 NCBI/ENA 官网查询该项目。`;
  }
  if (status === 404) return `seqout 未收录该项目（HTTP 404：${body.slice(0, 160)}）。可能项目较新尚未同步，或编号有误。`;
  return `seqout HTTP ${status}: ${body.slice(0, 300)}`;
}

async function seqoutGet(path, params) {
  const url = new URL(SEQOUT_BASE_URL + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
    const text = await resp.text();
    if (!resp.ok) throw new Error(describeSeqoutError(resp.status, text));
    try { return JSON.parse(text); } catch { throw new Error(`seqout 非 JSON 响应: ${text.slice(0, 200)}`); }
  } finally {
    clearTimeout(timer);
  }
}

/** TSV 类端点专用（runs/download 返回 text/tab-separated-values；metadata/download 返回 text/csv） */
async function seqoutGetText(path, params) {
  const url = new URL(SEQOUT_BASE_URL + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'text/tab-separated-values,text/csv,*/*' } });
    const text = await resp.text();
    if (!resp.ok) throw new Error(describeSeqoutError(resp.status, text));
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** 分隔符嗅探：取首个非空行，比较 Tab 与逗号出现次数（seqout 的 runs/download 是 TSV、metadata/download 是 CSV） */
function sniffDelimiter(text) {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const tabs = (line.match(/\t/g) || []).length;
    const commas = (line.match(/,/g) || []).length;
    return commas > tabs ? ',' : '\t';
  }
  return '\t';
}

/** 解析一行定界文本，支持双引号包裹与 "" 转义（零依赖 CSV/TSV 解析） */
function splitDelimitedLine(line, delim) {
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 定界文本 → 结构化行（首行作表头；丢弃整列为空或恒定的字段，最多保留 200 行并标注 total_rows） */
function parseDelimited(text) {
  const delim = sniffDelimiter(text);
  const lines = text.split('\n').filter((l) => l.length > 0 && l.trim() !== '');
  if (lines.length === 0) return { columns: [], rows: [], total_rows: 0 };
  const columns = splitDelimitedLine(lines[0], delim).map((c) => c.trim().replace(/^﻿/, ''));
  const total = lines.length - 1;
  const records = [];
  for (let i = 1; i < lines.length && records.length < 200; i++) records.push(splitDelimitedLine(lines[i], delim));

  // 丢掉恒为空白、或所有行取值都相同的列——下载表里有大量 NCBI/EBI 镜像链接列为空，全留着会白占 LLM 预算
  const keptIdx = [];
  columns.forEach((_, idx) => {
    const vals = records.map((r) => (r[idx] ?? '').trim());
    const constant = vals.length > 1 && vals.every((v) => v === vals[0]);
    if (vals.every((v) => v === '') || constant) return;
    keptIdx.push(idx);
  });
  const rows = [];
  for (const rec of records) {
    const row = {};
    for (const idx of keptIdx) {
      const v = (rec[idx] ?? '').trim();
      if (v !== '') row[columns[idx]] = v; // 空单元格直接省略：runs/download 每行有大半是空的镜像链接列
    }
    rows.push(row);
  }
  return { columns: keptIdx.map((i) => columns[i]), rows, total_rows: total };
}

const ACC_IN_URL = /\b(SRP|PRJNA|PRJEB|PRJDB)\d+\b/i;
/** 从单个 URL 抽取研究号（relation 的 @target，如 https://…/bioproject/PRJNA636285） */
function extractAccFromUrl(url) {
  const m = ACC_IN_URL.exec(url);
  return m ? m[0].toUpperCase() : null;
}

/** GSE → 研究编号。数据来源有讲究（实测 GSE117176/151530/62944/26109/165500）：
 *   - relation[] 的 @target URL 是权威映射
 *   - alias 有时带 SRP（GSE117176 → ["SRP153927"]），有时是空数组
 *   - neighbors 是 300 条相似数据集，里面混着**别的**项目的真实编号，绝不可用作映射来源。
 *  因此只在 relation / alias / external_id 三个字段里取候选，不递归整棵树。 */
function studyCandidates(project) {
  const out = [], seen = new Set();
  const push = (raw, kind) => {
    if (!raw) return;
    const u = raw.toUpperCase();
    if (STUDY_PATTERN.test(u)) { if (!seen.has(u)) { seen.add(u); out.push(u); } }
    else if (kind && raw.includes('://') && /BioProject|SRA/i.test(kind)) {
      const acc = extractAccFromUrl(raw);
      if (acc && !seen.has(acc)) { seen.add(acc); out.push(acc); }
    }
  };
  const p = (project && typeof project === 'object' && !Array.isArray(project)) ? project : {};
  if (Array.isArray(p.relation)) {
    for (const rel of p.relation) {
      const r = (rel && typeof rel === 'object') ? rel : {};
      push(typeof r['@target'] === 'string' ? r['@target'] : null, typeof r['@type'] === 'string' ? r['@type'] : '');
    }
  }
  for (const field of ['alias', 'external_id']) {
    const v = p[field];
    if (typeof v === 'string') push(v);
    else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string') push(item);
    else if (v && typeof v === 'object') for (const nested of Object.values(v)) if (typeof nested === 'string') push(nested);
  }
  // 排序：PRJ 优先（整项目、通常数据最全），SRP 仅作兜底
  return out.sort((a, b) => (b.startsWith('PRJ') ? 1 : 0) - (a.startsWith('PRJ') ? 1 : 0));
}

/** 校验候选确实有 run。seqout 对老 GEO-only 项目即使映射正确也会返回 0 run（上游本就没有公开 raw），
 *  此时如实返回空，不再瞎找替代。 */
async function hasRuns(studyAccession) {
  try {
    const runs = await seqoutGet(`/project/${encodeURIComponent(studyAccession)}/runs`);
    if (Array.isArray(runs)) return runs.length > 0;
    if (typeof runs?.total_runs === 'number') return runs.total_runs > 0;
    return Array.isArray(runs?.runs) && runs.runs.length > 0;
  } catch {
    return false;
  }
}

async function resolveStudy(accession) {
  const acc = accession.trim().toUpperCase();
  if (GSE_PATTERN.test(acc)) {
    const project = await seqoutGet(`/project/${encodeURIComponent(acc)}`);
    const candidates = studyCandidates(project);
    if (!candidates.length) throw new Error(`${acc} 未找到对应 SRA/BioProject 编号`);
    for (const candidate of candidates) {
      if (await hasRuns(candidate)) return candidate;
    }
    return candidates[0]; // 全部为空也不报错——让后续工具如实返回"无 run"，而不是抛解析异常
  }
  if (!STUDY_PATTERN.test(acc)) throw new Error(`研究编号格式不正确：${acc}（应为 GSE/SRP/PRJNA/PRJEB/PRJDB + 数字）`);
  return acc;
}

/** 研究编号 → BioProject 编号（PRJNA…）。下载工具用它给前端「下载加速」卡片提供 -A 参数。 */
async function resolveBioproject(studyAccession) {
  if (/^PRJ(NA|EB|DB)\d+$/i.test(studyAccession)) return studyAccession.toUpperCase();
  try {
    const project = await seqoutGet(`/project/${encodeURIComponent(studyAccession)}`);
    const alias = project?.alias;
    if (typeof alias === 'string' && /^PRJ(NA|EB|DB)\d+$/i.test(alias.trim())) return alias.trim().toUpperCase();
    const prj = studyCandidates(project).find((c) => /^PRJ/i.test(c));
    return prj ?? null;
  } catch {
    return null;
  }
}

function validateSample(accession) {
  const acc = accession.trim().toUpperCase();
  if (!SAMPLE_PATTERN.test(acc)) throw new Error(`样本编号格式不正确：${acc}（应为 GSM/SAMN/SAMD + 数字）`);
  return acc;
}

function q(args, key) {
  const v = args[key];
  return v === undefined || v === null || v === '' ? undefined : String(v);
}

async function executeTool(name, args) {
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
    case 'seqout_get_runs': { const s = await resolveStudy(String(args.study_accession)); return wrap({ ...(await seqoutGet(`/project/${encodeURIComponent(s)}/runs`)), study_accession: s, bioproject: await resolveBioproject(s) }); }
    case 'seqout_get_run_download': return wrap(await seqoutGet(`/run/${encodeURIComponent(String(args.run_accession).toUpperCase())}`));
    case 'seqout_get_download_links': {
      const s = await resolveStudy(String(args.study_accession));
      let tsv;
      try {
        tsv = await seqoutGetText(`/project/${encodeURIComponent(s)}/runs/download`);
      } catch (err) {
        // GEO-only 类项目无实验，seqout 可能以 404 "No experiments found" 表达——如实返回空，不算工具失败
        if (err instanceof Error && /No experiments found|no runs/i.test(err.message)) {
          return emptyStudyResult(s, `${s} 没有任何已公开的运行（run），故无下载链接可导。这类 GEO-only 项目通常只有加工矩阵，无原始数据。`);
        }
        throw err;
      }
      const parsed = parseDelimited(tsv);
      // 200 但只有表头的空表同理：上游无公开 raw 数据是「事实」，不是错误
      if (parsed.total_rows === 0) return emptyStudyResult(s, `${s} 的运行表为空（上游无公开 raw 数据，GEO-only 项目常见）。`);
      return wrap({ ...parsed, study_accession: s, bioproject: await resolveBioproject(s) });
    }
    case 'seqout_get_metadata_csv': {
      const s = await resolveStudy(String(args.study_accession));
      let csv;
      try {
        csv = await seqoutGetText(`/project/${encodeURIComponent(s)}/metadata/download`);
      } catch (err) {
        if (err instanceof Error && /No experiments found/i.test(err.message)) {
          return emptyStudyResult(s, `${s} 无实验级元数据（GEO-only 加工矩阵类数据集通常如此），故无 CSV 可导。`);
        }
        throw err;
      }
      return wrap({ ...parseDelimited(csv), study_accession: s });
    }
    case 'seqout_get_sample_metadata': { const a = validateSample(String(args.accession)); const path = /^GSM/i.test(a) ? `/sample-detail/${a}` : `/sample/${a}`; return wrap(await seqoutGet(path)); }
    case 'seqout_get_sample_detail': { const a = validateSample(String(args.accession)); return wrap(await seqoutGet(`/sample-detail/${encodeURIComponent(a)}`)); }
    case 'seqout_get_sample_manifest': { const a = String(args.accession).toUpperCase(); return wrap(await seqoutGet(`/geo/series/${encodeURIComponent(a)}/samples`, args.max_samples ? { max_samples: String(args.max_samples) } : undefined)); }
    case 'seqout_resolve_accession': return wrap(await seqoutGet(`/accession/${encodeURIComponent(String(args.accession).toUpperCase())}/project`));
    case 'seqout_resolve_prj': {
      // 前置校验：seqout 对非 PRJ 编号返回 422 + 原始 FastAPI 英文报文，对模型不友好，先挡掉
      const acc = String(args.prj_accession).trim().toUpperCase();
      if (!/^PRJ[A-Z]+\d+$/.test(acc)) {
        throw new Error(`BioProject 编号格式不正确：${acc}（应为 PRJNA/PRJEB/PRJDB + 数字，如 PRJNA732811）。若要解析 SRP/GSE 等其它编号，请用 seqout_resolve_accession。`);
      }
      return wrap(await seqoutGet(`/prj/${encodeURIComponent(acc)}`));
    }
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

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

function wrap(data) {
  return { success: true, data };
}

/** 业务性空结果（GEO-only 无实验/无 run）：success 形态返回，data.empty 标记供统计计为「空矿」而非错误 */
function emptyStudyResult(study, note) {
  return { success: true, data: { columns: [], rows: [], total_rows: 0, study_accession: study, empty: true, note } };
}

function isBusinessEmpty(payload) {
  const d = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.data : null;
  return !!d && typeof d === 'object' && !Array.isArray(d) && d.empty === true;
}

// ---------- T2：PubMed 文献联动（NCBI E-utilities 主路 + Europe PMC 兜底；与主仓库同策略） ----------

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
/** 缓存 key 带检索策略版本号：检索词规则升级后旧缓存自然失效 */
const LIT_STRATEGY_VERSION = 'v1';

// --- 进程内缓存（云函数实例级；TTL 正缓存 30 天 / 负缓存 7 天） ---
const LIT_TTL_OK = 30 * 24 * 3600;
const LIT_TTL_NEG = 7 * 24 * 3600;
const litCache = new Map();

function litCacheGet(key) {
  const hit = litCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { litCache.delete(key); return null; }
  return hit.card;
}
function litCacheSet(key, card) {
  litCache.set(key, { expires: Date.now() + (card.status === 'ok' ? LIT_TTL_OK : LIT_TTL_NEG) * 1000, card });
  if (litCache.size > 2000) {
    const drop = litCache.size - 1000;
    let i = 0;
    for (const k of litCache.keys()) { if (i++ >= drop) break; litCache.delete(k); }
  }
}

// --- token bucket 限流：无 key 2.5 req/s / 有 key 9.5 req/s ---
const ncbiBucket = { tokens: 2.5, last: Date.now(), capacity: 2.5 };
const NCBI_RATE = process.env.NCBI_API_KEY ? 9.5 : 2.5;

function acquireNcbi() {
  const now = Date.now();
  ncbiBucket.tokens = Math.min(ncbiBucket.capacity, ncbiBucket.tokens + ((now - ncbiBucket.last) / 1000) * NCBI_RATE);
  ncbiBucket.last = now;
  if (ncbiBucket.tokens >= 1) { ncbiBucket.tokens -= 1; return true; }
  return false; // 不排队等待：直接降级 Europe PMC
}

function eutilsParams(params) {
  const usp = new URLSearchParams({ tool: 'go_xunbaoshu', ...params });
  if (process.env.NCBI_EMAIL) usp.set('email', process.env.NCBI_EMAIL);
  if (process.env.NCBI_API_KEY) usp.set('api_key', process.env.NCBI_API_KEY);
  return usp.toString();
}

async function fetchWithRetry(url, timeoutMs = 6000, retries = 3) {
  let delay = 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, Math.min(delay, 4000)));
      delay *= 2;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (resp.ok) return JSON.parse(await resp.text());
      if (resp.status === 429 || resp.status >= 500) continue;
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('unreachable');
}

async function esearch(term, retmax = 5) {
  const json = await fetchWithRetry(`${EUTILS}/esearch.fcgi?${eutilsParams({ db: 'pubmed', term, retmode: 'json', retmax: String(retmax) })}`);
  const ids = json?.esearchresult?.idlist;
  return Array.isArray(ids) ? ids : [];
}

async function esummary(pmids) {
  if (pmids.length === 0) return {};
  const json = await fetchWithRetry(`${EUTILS}/esummary.fcgi?${eutilsParams({ db: 'pubmed', id: pmids.join(','), retmode: 'json' })}`);
  const result = json?.result ?? {};
  const out = {};
  for (const pmid of pmids) {
    const item = result[pmid];
    if (!item) continue;
    const doi = (item.articleids ?? []).find((a) => a.type === 'doi')?.value;
    out[pmid] = { title: item.title, journal: item.fulljournalname, pubdate: item.pubdate, doi };
  }
  return out;
}

async function efetchOutline(pmid) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const resp = await fetch(`${EUTILS}/efetch.fcgi?${eutilsParams({ db: 'pubmed', id: pmid, rettype: 'abstract', retmode: 'xml' })}`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`efetch HTTP ${resp.status}`);
    const xml = await resp.text();
    const sections = [];
    const re = /<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      // Label 属性值用 \x22 匹配双引号（正则字面量里不出现 " 字符——产物校验器的字符串掩码会把正则里的 " 误判为字符串边界，连锁吞掉后续代码）
      const labelMatch = /Label=\x22([^\x22]*)\x22/.exec(m[1]);
      const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) sections.push({ section: (labelMatch && labelMatch[1]) || 'Abstract', text });
    }
    if (sections.length === 0) {
      const plain = xml.replace(/<[^>]+>/g, '').trim().slice(0, 2000);
      return plain ? [{ section: 'Abstract', text: plain }] : [];
    }
    return sections;
  } finally {
    clearTimeout(timer);
  }
}

async function epmcLookup(query) {
  const json = await fetchWithRetry(`${EPMC}?${new URLSearchParams({ query, format: 'json', resultType: 'core' })}`);
  const first = json?.resultList?.result?.[0];
  if (!first || !String(first.title || '').trim()) return null;
  const journalInfo = first.journalInfo ?? {};
  const fullTextUrls = first.fullTextUrlList?.fullTextUrl ?? [];
  const oa = fullTextUrls.find((u) => u.documentStyle === 'pdf' || u.availability === 'Open access');
  const abstract = String(first.abstractText || '').trim();
  const pmid = String(first.pmid || '');
  const doi = String(first.doi || '');
  return {
    status: 'ok',
    pmid: pmid || undefined,
    title: String(first.title).trim(),
    journal: journalInfo.journal?.title || undefined,
    year: journalInfo.yearOfPublication ? String(journalInfo.yearOfPublication) : undefined,
    doi: doi || undefined,
    outline: abstract ? [{ section: 'Abstract', text: abstract }] : [],
    urls: {
      pubmed: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
      doi: doi ? `https://doi.org/${doi}` : undefined,
      full_text: oa?.url,
    },
  };
}

/** 检索策略：三级（条目自带 PMID → 标题精确匹配 → 兜底），返回 esearch 检索词 */
function buildSearchTerms(kind, idOrName) {
  if (kind === 'pubmed') return [];
  if (kind === 'go_term') return [`"${idOrName}"[Title] AND "Gene Ontology"[Title]`, `${idOrName} gene ontology consortium`];
  // geo 条目：编号必须出现在标题里，避免命中正文顺带提及 GEO 的无关文献
  return [`${idOrName}[Title]`];
}

/** GEO 条目自带 PMID 反查；GSM 先反查所属 GSE 系列（文献挂在系列上） */
async function linkedPubmedId(kind, idOrName) {
  if (kind !== 'geo_series' && kind !== 'geo_sample') return null;
  try {
    let seriesId = idOrName;
    if (kind === 'geo_sample') {
      const resolved = await seqoutGet(`/accession/${encodeURIComponent(idOrName)}/project`);
      const project = resolved?.project_accession;
      if (typeof project !== 'string' || !project) return null;
      seriesId = project;
    }
    const detail = await seqoutGet(`/project/${encodeURIComponent(seriesId)}`);
    const pmids = detail?.pubmed_id;
    if (Array.isArray(pmids) && typeof pmids[0] === 'string' && pmids[0]) return pmids[0];
    if (typeof pmids === 'string' && pmids) return pmids;
  } catch { /* seqout 未收录 → 走关键词检索 */ }
  return null;
}

async function makeLitCard(pmid, m) {
  const outline = acquireNcbi() ? await efetchOutline(pmid) : [];
  return {
    status: 'ok', pmid, title: m.title, journal: m.journal,
    year: (m.pubdate || '').slice(0, 4), doi: m.doi,
    outline: outline.filter((s) => s.text),
    urls: {
      pubmed: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi: m.doi ? `https://doi.org/${m.doi}` : undefined,
    },
  };
}

/** 文献联动主入口：选中编号 → 文献卡片（not_found 是正常业务状态） */
async function fetchLiterature(kind, idOrName) {
  const cacheKey = `${LIT_STRATEGY_VERSION}:${kind}:${idOrName}`;
  const cached = litCacheGet(cacheKey);
  if (cached) return cached;

  let card = null;
  const suggested = buildSearchTerms(kind, idOrName);

  try {
    if (kind === 'pubmed') {
      const pmid = idOrName.replace(/^PMID:?/i, '').trim();
      if (acquireNcbi()) {
        const meta = await esummary([pmid]);
        const m = meta[pmid];
        if (m?.title) card = await makeLitCard(pmid, m);
      }
    } else {
      // 三级检索：① GEO 条目自带 PMID（精确） → ② esearch 关键词
      const linked = await linkedPubmedId(kind, idOrName);
      const tryTerms = linked ? [`__direct__:${linked}`] : suggested;
      for (const term of tryTerms) {
        let pmid;
        if (term.startsWith('__direct__:')) {
          pmid = term.slice('__direct__:'.length);
        } else {
          if (!acquireNcbi()) break;
          const ids = await esearch(term, 3);
          if (ids.length === 0) continue;
          pmid = ids[0];
        }
        const meta = await esummary([pmid]);
        const m = meta[pmid];
        if (m?.title) { card = await makeLitCard(pmid, m); break; }
      }
    }
  } catch (err) {
    log(`[${FUNCTION_NAME}] NCBI fallback to Europe PMC ${idOrName}: ${err instanceof Error ? err.message : String(err)}`);
    // NCBI 退避仍失败 / 429 持续 → 整条链路降级 Europe PMC；UI 无感知
    try {
      card = await epmcLookup(`DOI:"${idOrName}" OR EXT_ID:${idOrName}`);
    } catch { /* 兜底也失败 → not_found */ }
  }

  const finalCard = card ?? {
    status: 'not_found',
    suggested_queries: suggested.length ? suggested : [idOrName],
  };
  litCacheSet(cacheKey, finalCard);
  return finalCard;
}

async function handleLiterature(body) {
  const kind = String(body.kind || '');
  const idOrName = String(body.id || '').trim();
  const VALID_KINDS = ['geo_series', 'geo_sample', 'go_term', 'pubmed'];
  if (!VALID_KINDS.includes(kind) || !idOrName) {
    return { status: 400, body: { error: '参数不完整：需要 kind（geo_series/geo_sample/go_term/pubmed）与 id' } };
  }
  const card = await fetchLiterature(kind, idOrName);
  return { status: 200, body: card };
}

// 结果瘦身：搜索类结果截断 summary，集合截断到 20 条，控制回传给 LLM 的体积
function trimForLLM(payload) {
  let text;
  try { text = JSON.stringify(payload); } catch { text = String(payload); }
  if (text.length <= 100000) return text;
  try {
    const obj = payload;
    if (obj && typeof obj === 'object' && obj.data && !Array.isArray(obj.data) && Array.isArray(obj.data.results)) {
      const results = obj.data.results.slice(0, 10).map((r) => {
        const item = { ...r };
        if (typeof item.summary === 'string' && item.summary.length > 400) item.summary = item.summary.slice(0, 400) + '…';
        return item;
      });
      const trimmed = { ...payload, data: { ...obj.data, results, truncated: true } };
      return JSON.stringify(trimmed).slice(0, 100000);
    }
    // 表格类结果（下载表/元数据表）：按行二分切，绝不从中间截断 JSON——否则模型收到的是半截原始文本
    if (obj && typeof obj === 'object' && obj.data && !Array.isArray(obj.data) && Array.isArray(obj.data.rows)) {
      const rows = obj.data.rows;
      let lo = 0, hi = rows.length; // 找最大可行前缀
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const test = JSON.stringify({ ...payload, data: { ...obj.data, rows: rows.slice(0, mid), truncated: true } });
        if (test.length <= 100000) lo = mid; else hi = mid - 1;
      }
      return JSON.stringify({ ...payload, data: { ...obj.data, rows: rows.slice(0, lo), truncated: true } });
    }
  } catch { /* fallthrough */ }
  return text.slice(0, 100000) + '…(truncated)';
}

// 从工具结果里提取可展示的数据集卡片
function extractCards(name, payload) {
  try {
    const data = payload?.data;
    if (!data || typeof data !== 'object') return [];
    const list = Array.isArray(data) ? data : data.results;
    if (!Array.isArray(list)) return [];
    const cards = [];
    for (const item of list.slice(0, 20)) {
      if (!item || typeof item !== 'object') continue;
      const it = item;
      const accession = typeof it.accession === 'string' ? it.accession
        : typeof it.run_accession === 'string' ? it.run_accession
        : typeof it.experiment_accession === 'string' ? it.experiment_accession
        : typeof it.sample_accession === 'string' ? it.sample_accession
        : '';
      const title = typeof it.title === 'string' ? it.title : typeof it.name === 'string' ? it.name : typeof it.latin_name === 'string' ? it.latin_name : '';
      if (!accession && !title) continue;
      const summary = typeof it.summary === 'string' ? it.summary.slice(0, 600) : typeof it.description === 'string' ? it.description.slice(0, 600) : '';
      const meta = {};
      for (const key of ['organism', 'species', 'common_name', 'overall_design', 'library_strategy', 'instrument', 'platform', 'total', 'status']) {
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

function labelOf(name) {
  const map = {
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

// ---------- action: models（模型目录，注入 defaultModel） ----------

async function handleModels() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${LLM_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!payload || typeof payload !== 'object') {
      return { status: 503, body: { error: '模型目录暂时不可用' } };
    }
    const upstreamDefault = typeof payload.defaultModel === 'string' ? payload.defaultModel : '';
    const finalDefault = process.env.LLM_MODEL || upstreamDefault;
    if (finalDefault) payload.defaultModel = finalDefault;
    return { status: 200, body: payload };
  } catch {
    return { status: 503, body: { error: '模型目录暂时不可用' } };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- action: chat（LLM tool-calling 循环，非流式整包返回） ----------

async function handleChat(body, log) {
  const history = Array.isArray(body.messages) ? body.messages : [];
  const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL;
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history.slice(-16)];

  const allCards = [];
  const toolLogs = [];

  for (let round = 0; round < 40; round++) {
    const llmResp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, tools: TOOL_DEFS, tool_choice: 'auto' }),
    });
    if (!llmResp.ok) {
      const errText = await llmResp.text();
      log(`[${FUNCTION_NAME}] upstream failed status=${llmResp.status}: ${errText.slice(0, 300)}`);
      return { status: 502, body: { error: `AI 服务返回 ${llmResp.status}` } };
    }

    const json = await llmResp.json().catch(() => null);
    const choice = json?.choices?.[0];
    if (!choice?.message) {
      return { status: 502, body: { error: 'AI 服务响应异常' } };
    }
    const textBuf = typeof choice.message.content === 'string' ? choice.message.content : '';
    const callsArr = Array.isArray(choice.message.tool_calls)
      ? choice.message.tool_calls.filter((c) => c?.function?.name)
      : [];

    if (!callsArr.length) {
      return { status: 200, body: { text: textBuf, cards: allCards, tools: toolLogs } };
    }

    // 执行工具，把结果作为 tool message 继续下一轮
    messages.push({ role: 'assistant', content: textBuf || null, tool_calls: callsArr });
    for (const call of callsArr) {
      const label = labelOf(call.function.name);
      const t0 = Date.now();
      let resultText;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        const payload = await executeTool(call.function.name, args);
        const cards = extractCards(call.function.name, payload);
        if (cards.length) allCards.push(...cards);
        resultText = trimForLLM(payload);
        toolLogs.push({ name: call.function.name, label, ok: true, ms: Date.now() - t0 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resultText = JSON.stringify({ success: false, error: message });
        toolLogs.push({ name: call.function.name, label, ok: false, ms: Date.now() - t0 });
        log(`[${FUNCTION_NAME}] tool failed ${call.function.name}: ${message.slice(0, 200)}`);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: resultText });
    }
  }

  // 40 轮全部用于工具后仍无最终正文：取最后一条助手文本并追加触顶提示（同主仓库 round===39 的 delta 提示）
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const finalText = (typeof lastAssistant?.content === 'string' ? lastAssistant.content : '') +
    '\n\n（已达到本轮最大查询次数，请追问以继续。）';
  return { status: 200, body: { text: finalText, cards: allCards, tools: toolLogs } };
}

// ---------- 排行榜 / 访客统计（node-appwrite 服务端 key 模式） ----------

const USER_TABLE = 'user_stats';
const GUEST_TABLE = 'guest_stats';
const LEADERBOARD_LIMIT = 50;
// 防御上限：单表最多拉取行数
const MAX_ROWS = 500;
const PAGE_SIZE = 100;

function makeTablesDB(req) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key']);
  const databaseId = process.env.QMUSE_APPWRITE_DATABASE_ID;
  if (!databaseId) {
    throw new Error('QMUSE_APPWRITE_DATABASE_ID is missing');
  }
  return { tablesDB: new TablesDB(client), databaseId };
}

function anyPermissions() {
  // 与 QMuse 默认表权限 READ ALL / SUBMIT ALL / EDIT CREATOR / DELETE CREATOR 对齐，
  // guest 行需跨匿名会话可写，故创建/更新时显式声明公开读写权限
  return [
    Permission.read(Role.any()),
    Permission.update(Role.any()),
    Permission.delete(Role.any()),
  ];
}

// 分页游标拉全量（上限 MAX_ROWS 防御）
async function listAllRows(tablesDB, databaseId, tableId) {
  const rows = [];
  let cursor = undefined;
  while (rows.length < MAX_ROWS) {
    const queries = [Query.limit(PAGE_SIZE)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const resp = await tablesDB.listRows({
      databaseId,
      tableId,
      queries,
      limit: PAGE_SIZE,
    });
    const batch = Array.isArray(resp?.rows) ? resp.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return rows.slice(0, MAX_ROWS);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truncateName(name, fallback) {
  const n = (name || '').trim().slice(0, 24);
  return n || fallback;
}

function mapUserRow(row) {
  const userId = typeof row.user_id === 'string' ? row.user_id : String(row.$id || '');
  return {
    key: `u:${userId}`,
    name: truncateName(row.display_name || row.username, userId.slice(0, 8)),
    treasures: num(row.treasures),
    digs: num(row.digs),
    chats: num(row.chats),
    weekTreasures: num(row.week_treasures),
    weekDigs: num(row.week_digs),
    weekChats: num(row.week_chats),
    updated_at: typeof row.$updatedAt === 'string' ? row.$updatedAt : '',
    isGuest: false,
  };
}

function mapGuestRow(row) {
  const deviceId = typeof row.device_id === 'string' ? row.device_id : String(row.$id || '');
  return {
    key: `g:${deviceId}`,
    name: truncateName(row.display_name || row.nickname, `游客${deviceId.slice(-4)}`),
    treasures: num(row.treasures),
    digs: num(row.digs),
    chats: num(row.chats),
    weekTreasures: num(row.week_treasures),
    weekDigs: num(row.week_digs),
    weekChats: num(row.week_chats),
    updated_at: typeof row.$updatedAt === 'string' ? row.$updatedAt : '',
    isGuest: true,
  };
}

function sortByTreasuresDesc(rows) {
  return rows.sort((a, b) => b.treasures - a.treasures || String(a.key).localeCompare(String(b.key)));
}

// 按 device_id 查 guest 行
async function findGuestRow(tablesDB, databaseId, device) {
  const resp = await tablesDB.listRows({
    databaseId,
    tableId: GUEST_TABLE,
    queries: [Query.equal('device_id', device), Query.limit(1)],
    limit: 1,
  });
  const rows = Array.isArray(resp?.rows) ? resp.rows : [];
  return rows[0] || null;
}

async function handleLeaderboard(tablesDB, databaseId) {
  const [userRows, guestRows] = await Promise.all([
    listAllRows(tablesDB, databaseId, USER_TABLE),
    listAllRows(tablesDB, databaseId, GUEST_TABLE),
  ]);
  const users = sortByTreasuresDesc(userRows.map(mapUserRow)).slice(0, LEADERBOARD_LIMIT);
  const guests = sortByTreasuresDesc(guestRows.map(mapGuestRow)).slice(0, LEADERBOARD_LIMIT);
  return { users, guests };
}

async function handleBumpGuest(tablesDB, databaseId, body) {
  const device = typeof body.device === 'string' ? body.device : '';
  if (!device) return { status: 400, body: { error: '缺少设备标识' } };
  const weekBase = typeof body.week_base === 'string' ? body.week_base : '';
  const inc = {
    treasures: num(body.treasures),
    digs: num(body.digs),
    chats: num(body.chats),
  };
  const row = await findGuestRow(tablesDB, databaseId, device);

  if (!row) {
    const data = {
      device_id: device,
      treasures: inc.treasures,
      digs: inc.digs,
      chats: inc.chats,
      week_treasures: inc.treasures,
      week_digs: inc.digs,
      week_chats: inc.chats,
      week_base: weekBase,
    };
    if (typeof body.display_name === 'string' && body.display_name) {
      data.display_name = body.display_name.slice(0, 24);
    }
    await tablesDB.createRow({
      databaseId,
      tableId: GUEST_TABLE,
      rowId: ID.unique(),
      data,
      permissions: anyPermissions(),
    });
    return { status: 200, body: { ok: true } };
  }

  // 周滚动：week_base 变化时周计数先清零
  const sameWeek = weekBase && row.week_base === weekBase;
  const next = {
    treasures: num(row.treasures) + inc.treasures,
    digs: num(row.digs) + inc.digs,
    chats: num(row.chats) + inc.chats,
    week_treasures: (sameWeek ? num(row.week_treasures) : 0) + inc.treasures,
    week_digs: (sameWeek ? num(row.week_digs) : 0) + inc.digs,
    week_chats: (sameWeek ? num(row.week_chats) : 0) + inc.chats,
    week_base: weekBase || (typeof row.week_base === 'string' ? row.week_base : ''),
  };
  if (typeof body.display_name === 'string' && body.display_name) {
    next.display_name = body.display_name.slice(0, 24);
  }
  await tablesDB.updateRow({
    databaseId,
    tableId: GUEST_TABLE,
    rowId: row.$id,
    data: next,
    permissions: anyPermissions(),
  });
  return { status: 200, body: { ok: true } };
}

async function handleSetGuestName(tablesDB, databaseId, body) {
  const device = typeof body.device === 'string' ? body.device : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.slice(0, 24) : '';
  if (!device) return { status: 400, body: { error: '缺少设备标识' } };
  const row = await findGuestRow(tablesDB, databaseId, device);
  if (!row) {
    await tablesDB.createRow({
      databaseId,
      tableId: GUEST_TABLE,
      rowId: ID.unique(),
      data: { device_id: device, display_name: displayName },
      permissions: anyPermissions(),
    });
  } else {
    await tablesDB.updateRow({
      databaseId,
      tableId: GUEST_TABLE,
      rowId: row.$id,
      data: { display_name: displayName },
      permissions: anyPermissions(),
    });
  }
  return { status: 200, body: { ok: true } };
}

// ---------- v5 context 入口 ----------

export default async ({ req, res, log, error }) => {
  try {
    const body = req.bodyJson ?? {};
    const action = typeof body.action === 'string' ? body.action : '';

    // T2 文献联动只打公共 API（NCBI / Europe PMC），不需要 LLM 凭证，放在凭证检查之前
    if (action === 'literature') {
      const { status, body: payload } = await handleLiterature(body);
      return res.json(payload, status);
    }

    // 对话域（models / chat）需要 LLM 凭证；统计域不依赖
    if (!action || action === 'models' || action === 'chat') {
      if (!process.env.LLM_API_KEY) {
        return res.json({ error: '当前项目的 AI 服务凭证未就绪，请稍后重试' }, 503);
      }
      if (!action || action === 'models') {
        const { status, body: payload } = await handleModels();
        return res.json(payload, status);
      }
      const { status, body: payload } = await handleChat(body, log);
      return res.json(payload, status);
    }

    if (action === 'leaderboard') {
      const { tablesDB, databaseId } = makeTablesDB(req);
      return res.json(await handleLeaderboard(tablesDB, databaseId));
    }

    if (action === 'bump_guest') {
      const { tablesDB, databaseId } = makeTablesDB(req);
      const { status, body: payload } = await handleBumpGuest(tablesDB, databaseId, body);
      return res.json(payload, status);
    }

    if (action === 'set_guest_name') {
      const { tablesDB, databaseId } = makeTablesDB(req);
      const { status, body: payload } = await handleSetGuestName(tablesDB, databaseId, body);
      return res.json(payload, status);
    }

    return res.json({ error: '未知操作' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`[${FUNCTION_NAME}] failed: ${message}`);
    return res.json({ error: '服务暂不可用' }, 500);
  }
};
