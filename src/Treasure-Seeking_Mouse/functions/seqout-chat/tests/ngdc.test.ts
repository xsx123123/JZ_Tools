import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genbasePreview, NGDC_TOOL_NAMES } from '../index.ts';

test('NGDC tool layer exposes five tools', () => {
  assert.equal(NGDC_TOOL_NAMES.length, 5);
  assert.deepEqual(NGDC_TOOL_NAMES, [
    'ngdc_get_gwh_assembly',
    'ngdc_get_gwh_project',
    'ngdc_get_gwh_sample',
    'ngdc_get_genbase_sequence',
    'ngdc_get_gsa_mirror',
  ]);
});

test('GenBase preview truncates large FASTA while retaining header and link', () => {
  const body = `>C_AA004835.1 demo\n${'ACGT'.repeat(1000)}`;
  const result = genbasePreview(body, 'fasta', 'https://ngdc.cncb.ac.cn/genbase/api/file/fasta?acc=C_AA004835.1');
  assert.equal(result.header, '>C_AA004835.1 demo');
  assert.equal(result.estimated_length, 4000);
  assert.equal(result.download_url, 'https://ngdc.cncb.ac.cn/genbase/api/file/fasta?acc=C_AA004835.1');
  assert.ok(String(result.preview).length <= 2000);
});

