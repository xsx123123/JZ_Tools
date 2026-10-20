// 提示词漂移守卫：prompts/system-{zh,en}.md 是唯一可编辑来源，改完必须 npm run sync:prompts
// 重新生成 prompts.generated.ts；本测试比对「md 内容」与「index.ts 实际导入的字符串」，不一致即红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SYSTEM_PROMPT, SYSTEM_PROMPT_EN } from '../index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const md = (name: string): string => readFileSync(join(HERE, '..', 'prompts', name), 'utf8').replace(/\n$/, '');

test('SYSTEM_PROMPT 与 prompts/system-zh.md 同步（改 md 后跑 npm run sync:prompts）', () => {
  assert.equal(SYSTEM_PROMPT, md('system-zh.md'));
});

test('SYSTEM_PROMPT_EN 与 prompts/system-en.md 同步（改 md 后跑 npm run sync:prompts）', () => {
  assert.equal(SYSTEM_PROMPT_EN, md('system-en.md'));
});

test('双份提示词的关键规则仍在（防误删整段）', () => {
  for (const [name, p] of [['zh', SYSTEM_PROMPT], ['en', SYSTEM_PROMPT_EN]] as const) {
    assert.match(p, /:::followup/, `${name} 缺 followup 协议规则`);
    assert.match(p, /12\./, `${name} 缺防玩坏红线规则`);
    assert.match(p, /GSE151530/, `${name} 缺 GEO-only 例外示例`);
  }
});
