// 多源文献检索测试（离线为主，fixtures 为各来源 API 的真实响应形态）
//
// 背景：literature_search 有 9 个来源（pubmed / europe_pmc / crossref / openalex /
// semantic_scholar / core / arxiv / biorxiv / medrxiv），source=all 时 Promise.allSettled
// 并行调度，合并阶段按 DOI→PMID→小写标题去重、失败来源进 warnings、截断到 limit。
// 这套测试守住"什么是对的"，改 functions/seqout-chat/index.ts 的文献检索层后必须全绿。
//
// 运行：
//   npm test                                               # 离线（默认）
//   node --test functions/seqout-chat/tests/*.test.ts       # 同上，直调
//   SEQOUT_LIVE=1 node --test functions/seqout-chat/tests/literature.test.ts   # 额外打真实 API（需联网）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LITERATURE_TOOL_NAME,
  LITERATURE_SOURCES,
  epmcResultToSearchResult,
  crossrefResultToSearchResult,
  openAlexResultToSearchResult,
  semanticScholarResultToSearchResult,
  preprintCollectionToSearchResults,
  mergeSettledLiterature,
  searchLiteratureSource,
  searchAllLiterature,
} from '../index.ts';

const ALL_SOURCES = [...LITERATURE_SOURCES];

// ---------- 工具契约 ----------

test('literature search exposes a stable tool name', () => {
  assert.equal(LITERATURE_TOOL_NAME, 'literature_search');
});

test('LITERATURE_SOURCES 固定为 9 个来源，schema 与调度共用同一份（防漂移）', () => {
  assert.deepEqual(ALL_SOURCES, [
    'pubmed', 'europe_pmc', 'crossref', 'openalex', 'semantic_scholar',
    'core', 'arxiv', 'biorxiv', 'medrxiv',
  ]);
});

// ---------- Europe PMC 归一化（既有用例，保留） ----------

test('Europe PMC records normalize into paper cards with source links', () => {
  const result = epmcResultToSearchResult({
    id: '123456',
    pmid: '123456',
    doi: '10.1000/example',
    title: 'Single-cell atlas of a tissue',
    journalTitle: 'Example Journal',
    pubYear: 2025,
    abstractText: 'A short abstract.',
    isOpenAccess: 'Y',
    authorList: { author: [{ fullName: 'A. Researcher' }, { firstName: 'B', lastName: 'Scientist' }] },
    fullTextUrlList: { fullTextUrl: [{ documentStyle: 'pdf', url: 'https://example.org/paper.pdf' }] },
  });
  assert.ok(result);
  assert.equal(result.source, 'europe_pmc');
  assert.equal(result.pmid, '123456');
  assert.deepEqual(result.authors, ['A. Researcher', 'B Scientist']);
  assert.equal(result.isOpenAccess, true);
  assert.equal(result.urls.full_text, 'https://example.org/paper.pdf');
  assert.match(result.urls.google_scholar_search ?? '', /scholar\.google\.com/);
});

test('Europe PMC records without a title are ignored', () => {
  assert.equal(epmcResultToSearchResult({ pmid: '123456' }), null);
});

// ---------- Crossref 归一化 ----------

test('Crossref works 归一化：DOI、期刊、年份、作者、去标签摘要', () => {
  const result = crossrefResultToSearchResult({
    DOI: '10.1038/s41586-020-2649-2',
    title: ['The sequence of the human genome'],
    author: [{ given: 'R', family: 'Researcher' }],
    'container-title': ['Nature'],
    published: { 'date-parts': [[2020, 9]] },
    URL: 'https://api.crossref.org/works/10.1038/s41586-020-2649-2',
    abstract: '<jats:p>Abstract with <jats:bold>tags</jats:bold>.</jats:p>',
  });
  assert.ok(result);
  assert.equal(result.source, 'crossref');
  assert.equal(result.id, '10.1038/s41586-020-2649-2');
  assert.equal(result.doi, '10.1038/s41586-020-2649-2');
  assert.equal(result.journal, 'Nature');
  assert.equal(result.year, '2020');
  assert.deepEqual(result.authors, ['R Researcher']);
  assert.match(result.urls.doi ?? '', /^https:\/\/doi\.org\//);
  assert.equal(result.abstract, 'Abstract with tags.');
});

test('Crossref works 无标题记录被丢弃', () => {
  assert.equal(crossrefResultToSearchResult({ DOI: '10.1000/x', title: [] }), null);
});

// ---------- OpenAlex 归一化 ----------

test('OpenAlex works 归一化：ids.doi 剥前缀、期刊、OA 标记、pdf 链接', () => {
  const result = openAlexResultToSearchResult({
    id: 'https://openalex.org/W123456789',
    title: 'Deep learning for genomics',
    ids: { doi: 'https://doi.org/10.1000/oa' },
    primary_location: { source: { display_name: 'Genome Biology' } },
    best_oa_location: { pdf_url: 'https://example.org/oa.pdf' },
    authorships: [{ author: { display_name: 'C. Scientist' } }],
    publication_year: 2024,
    open_access: { is_oa: true },
  });
  assert.ok(result);
  assert.equal(result.source, 'openalex');
  assert.equal(result.doi, '10.1000/oa');
  assert.equal(result.journal, 'Genome Biology');
  assert.equal(result.year, '2024');
  assert.equal(result.isOpenAccess, true);
  assert.equal(result.urls.full_text, 'https://example.org/oa.pdf');
  assert.equal(result.urls.openalex, 'https://openalex.org/W123456789');
});

test('OpenAlex works 无标题记录被丢弃', () => {
  assert.equal(openAlexResultToSearchResult({ id: 'https://openalex.org/W1' }), null);
});

// ---------- Semantic Scholar 归一化 ----------

test('Semantic Scholar 归一化：paperId、externalIds 拆 DOI/PMID、OA pdf', () => {
  const result = semanticScholarResultToSearchResult({
    paperId: 'abc123',
    title: 'A benchmark study',
    externalIds: { DOI: '10.1000/s2', PubMed: '33333333' },
    journal: { name: 'Bioinformatics' },
    year: 2023,
    authors: [{ name: 'D. Author' }],
    openAccessPdf: { url: 'https://example.org/s2.pdf' },
  });
  assert.ok(result);
  assert.equal(result.source, 'semantic_scholar');
  assert.equal(result.id, 'abc123');
  assert.equal(result.doi, '10.1000/s2');
  assert.equal(result.pmid, '33333333');
  assert.equal(result.journal, 'Bioinformatics');
  assert.equal(result.urls.pubmed, 'https://pubmed.ncbi.nlm.nih.gov/33333333/');
  assert.match(result.urls.semantic_scholar ?? '', /semanticscholar\.org/);
});

test('Semantic Scholar 无标题记录被丢弃', () => {
  assert.equal(semanticScholarResultToSearchResult({ paperId: 'abc123' }), null);
});

// ---------- bioRxiv / medRxiv 最近批次 + 关键词过滤 ----------

const PREPRINT_COLLECTION = [
  { doi: '10.1101/2024.01.01.111111', title: 'Mouse RNA-seq atlas of liver', authors: 'A One; B Two', date: '2024-01-02', abstract: 'We profiled mouse liver by RNA-seq.' },
  { doi: '10.1101/2024.01.03.222222', title: 'Protein folding with AI', authors: 'C Three', date: '2024-01-04', abstract: 'Unrelated topic.' },
  { title: 'Missing DOI record', date: '2024-01-05' },
];

test('bioRxiv 预印本：按关键词过滤最近批次，缺 DOI 记录被丢弃', () => {
  const results = preprintCollectionToSearchResults('biorxiv', PREPRINT_COLLECTION, { query: 'RNA-seq', limit: 10 });
  assert.equal(results.length, 1);
  assert.equal(results[0].source, 'biorxiv');
  assert.equal(results[0].id, '10.1101/2024.01.01.111111');
  assert.equal(results[0].year, '2024');
  assert.deepEqual(results[0].authors, ['A One', 'B Two']);
  assert.match(results[0].urls.biorxiv ?? '', /biorxiv\.org/);
});

test('预印本过滤：非数组 collection 返回空，limit 生效', () => {
  assert.deepEqual(preprintCollectionToSearchResults('medrxiv', null, { query: 'x' }), []);
  const many = Array.from({ length: 5 }, (_, i) => ({
    doi: `10.1101/2024.01.0${i}.333333`, title: `RNA-seq study number ${i}`, date: '2024-01-05',
  }));
  const results = preprintCollectionToSearchResults('medrxiv', many, { query: 'RNA-seq', limit: 3 });
  assert.equal(results.length, 3);
});

// ---------- source=all 合并阶段 ----------

function okSource(source: string, results: unknown[]): PromiseSettledResult<Record<string, unknown>> {
  return { status: 'fulfilled', value: { source, query: 'q', total: results.length, results } };
}

test('mergeSettledLiterature：按 DOI 去重（大小写不敏感），先到先得', () => {
  const settled: PromiseSettledResult<Record<string, unknown>>[] = [
    okSource('crossref', [{ source: 'crossref', id: 'a', title: 'Paper One', doi: '10.1000/ABC' }]),
    okSource('openalex', [{ source: 'openalex', id: 'b', title: 'Paper One', doi: '10.1000/abc' }]),
  ];
  const merged = mergeSettledLiterature(['crossref', 'openalex'], settled, { query: 'q' }) as { total: number; results: { source: string }[] };
  assert.equal(merged.total, 1);
  assert.equal(merged.results[0].source, 'crossref', '同 DOI 保留先返回的来源');
});

test('mergeSettledLiterature：无 DOI 时按 PMID 去重，再按小写标题去重', () => {
  const settled: PromiseSettledResult<Record<string, unknown>>[] = [
    okSource('pubmed', [
      { source: 'pubmed', id: '111', title: 'Alpha', pmid: '111' },
      { source: 'pubmed', id: 't1', title: 'Beta Study' },
    ]),
    okSource('semantic_scholar', [
      { source: 'semantic_scholar', id: 's1', title: 'whatever', pmid: '111', doi: undefined },
      { source: 'semantic_scholar', id: 's2', title: 'BETA STUDY' },
    ]),
  ];
  const merged = mergeSettledLiterature(['pubmed', 'semantic_scholar'], settled, { query: 'q' }) as { total: number };
  assert.equal(merged.total, 2, 'PMID 重复 + 标题大小写变体各去重一次');
});

test('mergeSettledLiterature：失败来源进 warnings 且不影响其他来源', () => {
  const settled: PromiseSettledResult<Record<string, unknown>>[] = [
    { status: 'rejected', reason: new Error('CORE_API_KEY 未配置') },
    okSource('europe_pmc', [{ source: 'europe_pmc', id: '1', title: 'Survivor' }]),
  ];
  const merged = mergeSettledLiterature(['core', 'europe_pmc'], settled, { query: 'q' }) as { total: number; warnings?: string[] };
  assert.equal(merged.total, 1);
  assert.ok(Array.isArray(merged.warnings));
  assert.match(merged.warnings![0], /^core: /);
});

test('mergeSettledLiterature：结果截断到 limit（默认 10，最大 20），total 报告去重后总数', () => {
  const results = Array.from({ length: 25 }, (_, i) => ({ source: 'crossref', id: `d${i}`, title: `Paper ${i}`, doi: `10.1000/${i}` }));
  const merged = mergeSettledLiterature(['crossref'], [okSource('crossref', results)], { query: 'q' }) as { total: number; results: unknown[] };
  assert.equal(merged.total, 25, 'total = 去重后命中总数（截断前）');
  assert.equal(merged.results.length, 10, '默认 limit=10');
  const merged20 = mergeSettledLiterature(['crossref'], [okSource('crossref', results)], { query: 'q', limit: 99 }) as { results: unknown[] };
  assert.equal(merged20.results.length, 20, 'limit 封顶 20');
});

test('mergeSettledLiterature：results 非数组或条目非法时安全跳过', () => {
  const settled: PromiseSettledResult<Record<string, unknown>>[] = [
    { status: 'fulfilled', value: { source: 'pubmed', results: 'oops' } },
    okSource('pubmed', [null, 'junk', { source: 'pubmed', id: '9', title: 'Valid' }]),
  ];
  const merged = mergeSettledLiterature(['pubmed', 'pubmed'], settled, { query: 'q' }) as { total: number };
  assert.equal(merged.total, 1);
});

// ---------- 联网验收（SEQOUT_LIVE=1 时启用，对齐 docs/ARC/literature-multisource-architecture.md §5） ----------

if (process.env.SEQOUT_LIVE === '1') {
  const QUERY = 'mouse RNA-seq';

  for (const source of ALL_SOURCES) {
    test(`LIVE: ${source} 返回结构化结果（标题 + 至少一个原文链接）`, async (t) => {
      if (source === 'core' && !process.env.CORE_API_KEY) {
        await assert.rejects(searchLiteratureSource('core', { query: QUERY, limit: 3 }), /CORE_API_KEY/, '无 Key 时单源查询应报清晰配置错误');
        return;
      }
      let payload: { source: string; results: { title?: string; urls?: Record<string, string> }[] };
      try {
        payload = await searchLiteratureSource(source, { query: QUERY, limit: 3 }) as typeof payload;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 共享出口 IP 经常触发 429：限流算环境噪声跳过，其余错误（解析失败、4xx）仍硬失败
        if (message.includes('429') || message.includes('unreachable')) {
          t.skip(`${source} 被限流（${message}），非代码缺陷`);
          return;
        }
        throw err;
      }
      assert.equal(payload.source, source);
      assert.ok(Array.isArray(payload.results), 'results 必须是数组');
      for (const paper of payload.results) {
        assert.ok(paper.title, '每条结果必须有标题');
        assert.ok(Object.values(paper.urls ?? {}).some((u) => typeof u === 'string' && u.startsWith('http')), '每条结果至少一个原文链接');
      }
    });
  }

  test('LIVE: source=all 合并九源，失败来源进 warnings 且整体不抛异常', async () => {
    const payload = await searchAllLiterature({ query: QUERY, limit: 10 }) as {
      source: string; total: number;
      results: { source: string; title?: string }[];
      warnings?: string[];
    };
    assert.equal(payload.source, 'all');
    assert.ok(Array.isArray(payload.results));
    assert.ok(payload.total >= 1, '至少一个来源应有结果');
    if (payload.warnings) {
      for (const w of payload.warnings) assert.match(w, /^[a-z_]+: /, 'warning 带来源前缀');
    }
    const seenSources = new Set(payload.results.map((r) => r.source));
    assert.ok(seenSources.size >= 1);
  });
}
