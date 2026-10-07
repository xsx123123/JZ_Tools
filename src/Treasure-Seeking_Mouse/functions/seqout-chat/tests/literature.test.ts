import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epmcResultToSearchResult, LITERATURE_TOOL_NAME } from '../index.ts';

test('literature search exposes a stable tool name', () => {
  assert.equal(LITERATURE_TOOL_NAME, 'literature_search');
});

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
