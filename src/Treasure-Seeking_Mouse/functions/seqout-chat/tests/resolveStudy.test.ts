// GSE→SRA 解析回归测试（离线，不依赖网络；fixtures 为真实 seqout 响应）
//
// 背景：resolveStudy 曾用递归搜索整棵项目详情 JSON，命中 neighbors（300 条相似数据集）里
// **别的项目**的编号就提前返回。GSE117176 因此被解析成 neighbors[207].accession = SRP349691
// （实际是 PRJNA786951，另一个项目），导致 runs/download 返回空矿或指向错误项目。
//
// 这个测试守住"什么是对的"：任何修改后平台（Edge Function / 云函数 / 本地）都必须通过。
//
// 运行：
//   npm test                                               # 离线（默认，用 fixtures）
//   node --test functions/seqout-chat/tests/*.test.ts       # 同上，直调
//   SEQOUT_LIVE=1 node --test functions/seqout-chat/tests/*.test.ts   # 额外打真实 API 校验（需联网）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { studyCandidates, extractAccFromUrl, resolveStudy, resolveBioproject, describeSeqoutError } from '../index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

function fixture(name: string): unknown {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURES, `${name}.json.gz`))).toString('utf8'));
}

test('studyCandidates: 从 relation URL 抽取权威编号，alias 数组也收', () => {
  // GSE117176：正确映射在 relation（PRJNA481344）+ alias（["SRP153927"]，数组形态）
  const c = studyCandidates(fixture('GSE117176'));
  assert.ok(c.includes('PRJNA481344'), `应含 PRJNA481344，实际 ${JSON.stringify(c)}`);
  assert.ok(c.includes('SRP153927'), `应含 SRP153927（alias 数组），实际 ${JSON.stringify(c)}`);
  assert.equal(c[0], 'PRJNA481344', 'PRJ 必须排在 SRP 之前');
});

test('studyCandidates: 绝不采纳 neighbors 里的"其它项目"编号', () => {
  // GSE117176 的 neighbors[207].accession = SRP349691（实为 PRJNA786951，另一个项目）
  const c = studyCandidates(fixture('GSE117176'));
  assert.ok(!c.includes('SRP349691'), `不得含 SRP349691（neighbor 污染），实际 ${JSON.stringify(c)}`);
  assert.ok(!c.includes('PRJNA786951'));
});

test('studyCandidates: 不误吞自由文本里嵌的 URL（曾造出假编号 SRP33）', () => {
  // GSE62944 的 overall_design 里嵌了带 SRP 形态的 URL，绝不能被当作映射
  const c = studyCandidates(fixture('GSE62944'));
  assert.ok(!c.includes('SRP33'), `不得含 SRP33（文本 URL 污染），实际 ${JSON.stringify(c)}`);
  assert.deepEqual(c, ['PRJNA266377'], 'GSE62944 唯一权威映射是 relation 的 PRJNA266377');
});

test('studyCandidates: alias/external_id 为空时仍能从 relation 拿到编号', () => {
  // GSE151530：alias=[]，只有 relation 有 PRJNA636285
  assert.deepEqual(studyCandidates(fixture('GSE151530')), ['PRJNA636285']);
});

test('extractAccFromUrl: 仅从 URL 抽编号', () => {
  assert.equal(extractAccFromUrl('https://www.ncbi.nlm.nih.gov/bioproject/PRJNA636285'), 'PRJNA636285');
  assert.equal(extractAccFromUrl('https://www.ncbi.nlm.nih.gov/sra?term=SRP153927'), 'SRP153927');
  assert.equal(extractAccFromUrl('no-accession-here'), null);
});

test('describeSeqoutError: 未同步项目 404 讲清"库未同步"，不与"无数据"混淆', () => {
  const msg = describeSeqoutError(404, '{"detail":"No project found for PRJ accession PRJNA1537414"}');
  assert.match(msg, /seqout/);
  assert.match(msg, /同步|NCBI|ENA/, '应提示镜像库未同步并给出 NCBI/ENA 兜底路径');
});

// ---- 真实数据校验：以下断言的期望值来自 NCBI/ENA 人工核实 ----
// 期望值（勿随意改）：
//   GSE117176 → PRJNA481344，5 runs，SRR7526393..SRR7526397 ↔ GSM3272966..GSM3272970
//   GSE151530 → PRJNA636285，0 runs（ENA 核实上游确无 raw）
//   GSE62944  → PRJNA266377，0 runs（ENA 核实上游确无 raw）

test('resolveStudy: 非 GSE 编号直接归一化返回', async () => {
  assert.equal(await resolveStudy('prjna481344'), 'PRJNA481344');
  assert.equal(await resolveStudy(' srp153927 '), 'SRP153927');
  await assert.rejects(() => resolveStudy('NOT_AN_ACCESSION'), /格式不正确/);
});

if (process.env.SEQOUT_LIVE === '1') {
  test('LIVE: GSE117176 → PRJNA481344 且确有 run', async () => {
    const s = await resolveStudy('GSE117176');
    assert.equal(s, 'PRJNA481344');
    assert.equal(await resolveBioproject(s), 'PRJNA481344');
  });
  test('LIVE: GSE151530 / GSE62944 → 真实 PRJ（不得回退到任意 SRP）', async () => {
    assert.equal(await resolveStudy('GSE151530'), 'PRJNA636285');
    assert.equal(await resolveStudy('GSE62944'), 'PRJNA266377');
  });
}
