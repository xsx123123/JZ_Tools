// QMuse 版 GSE→SRA 解析回归测试（离线；fixtures 与主仓库共用同一批真实 seqout 响应）
//
// 目的：QMuse 云函数 `qmuse/qmuse-app/functions/seqout-chat/src/main.js` 是主仓库的迁移副本，
// 其 resolveStudy 曾有同样的 neighbors 污染 bug（GSE117176 被误解析为 SRP349691/PRJNA786951）。
// 这个测试守住迁移版行为与主仓库一致——改完跑 `npm test`，不通过就不要导入。
//
// 说明：main.js 是 QMuse 云函数入口（单文件、无 export），这里用源码切片 + new Function 抽取
// 纯函数做测试，避免为测试改动生产入口结构。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN_JS = join(HERE, '..', 'src', 'main.js');
const FIXTURES = join(HERE, '..', '..', '..', '..', '..', 'functions', 'seqout-chat', 'tests', 'fixtures');

function fixture(name) {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURES, `${name}.json.gz`))).toString('utf8'));
}

/** 从 main.js 抽 GSE_PATTERN..validateSample 之间的解析函数，就地求值暴露出来 */
function loadResolver() {
  const src = readFileSync(MAIN_JS, 'utf8');
  const start = src.indexOf('const GSE_PATTERN');
  const end = src.indexOf('function validateSample');
  assert.ok(start > 0 && end > start, 'main.js 结构变化，切片失效——请更新本测试');
  const code = src.slice(start, end) + '\nreturn { studyCandidates, extractAccFromUrl };';
  return new Function(code)();
}

const R = loadResolver();

test('QMuse studyCandidates: relation/alias 取权威编号，PRJ 优先', () => {
  const c = R.studyCandidates(fixture('GSE117176'));
  assert.ok(c.includes('PRJNA481344'));
  assert.ok(c.includes('SRP153927'));
  assert.equal(c[0], 'PRJNA481344');
});

test('QMuse studyCandidates: 不采纳 neighbors 的 SRP349691', () => {
  const c = R.studyCandidates(fixture('GSE117176'));
  assert.ok(!c.includes('SRP349691'), `实际 ${JSON.stringify(c)}`);
  assert.ok(!c.includes('PRJNA786951'));
});

test('QMuse studyCandidates: 不误吞文本 URL（无假编号 SRP33）', () => {
  assert.deepEqual(R.studyCandidates(fixture('GSE62944')), ['PRJNA266377']);
});

test('QMuse studyCandidates: alias 为空时仍取 relation 的编号', () => {
  assert.deepEqual(R.studyCandidates(fixture('GSE151530')), ['PRJNA636285']);
});

test('QMuse extractAccFromUrl', () => {
  assert.equal(R.extractAccFromUrl('https://www.ncbi.nlm.nih.gov/bioproject/PRJNA636285'), 'PRJNA636285');
  assert.equal(R.extractAccFromUrl('nope'), null);
});
