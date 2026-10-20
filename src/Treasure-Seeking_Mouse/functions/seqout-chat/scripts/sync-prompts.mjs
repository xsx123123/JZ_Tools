// 提示词同步：prompts/system-{zh,en}.md 是 SYSTEM_PROMPT 的唯一可编辑来源，
// 本脚本把它们重新生成为 prompts.generated.ts（JSON.stringify 嵌入，免转义坑）。
// 用法：npm run sync:prompts；改完 md 必须跑一次，tests/prompts-sync.test.ts 会守住漂移。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = resolve(here, '../prompts');

// md 文件按约定以单个换行结尾，读入时剥掉这一个，保证生成串与旧模板字面量逐字节一致
const read = (name) => readFileSync(resolve(promptsDir, name), 'utf8').replace(/\n$/, '');
const zh = read('system-zh.md');
const en = read('system-en.md');

const out =
  `// 本文件由 prompts/system-zh.md / system-en.md 自动生成（npm run sync:prompts），请勿手改。\n` +
  `export const SYSTEM_PROMPT = ${JSON.stringify(zh)};\n\n` +
  `export const SYSTEM_PROMPT_EN = ${JSON.stringify(en)};\n`;

writeFileSync(resolve(here, '../prompts.generated.ts'), out);
console.info(`[sync-prompts] 已生成 prompts.generated.ts（zh ${zh.length} 字符 / en ${en.length} 字符）`);
