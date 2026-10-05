// 本地自托管服务：在 Node 下直接运行 functions/seqout-chat/index.ts 的 handler（零依赖，Node >= 22.6）
// 用法：
//   1) cp server/.env.example server/.env 并填入 LLM_API_KEY（任意 OpenAI 兼容服务均可）
//   2) pnpm run server        → http://localhost:8787
//   3) 前端 .env.local 加 VITE_CHAT_API=http://localhost:8787，pnpm run dev
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// 1) 先加载 server/.env（简单 KEY=VALUE 解析，不引第三方依赖；进程环境变量优先）
//    值支持 $VAR / ${VAR} 引用服务器环境变量，例如 LLM_API_KEY=$MY_LLM_KEY
try {
  const envFile = readFileSync(resolve(here, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    val = val.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, n) => process.env[n] ?? '');
    if (val && !(key in process.env)) process.env[key] = val;
  }
} catch { /* server/.env 不存在时全部依赖进程环境变量 */ }

// 2) 再加载 Edge Function 模块（Node 24 原生 type-stripping 直接跑 .ts）
const { handler, restoreUsageStats, dumpUsageStats } = await import(pathToFileURL(resolve(root, 'functions/seqout-chat/index.ts')).href);

// 使用统计持久化：启动时恢复上次快照，之后每 15s 有变化就落盘（tmp + rename，防写一半）
// 路径可用 STATS_FILE 覆盖（Docker 挂载命名卷到 /app/data，容器重建不丢统计）
const STATS_FILE = process.env.STATS_FILE || resolve(root, 'server/.stats.json');
try {
  restoreUsageStats(JSON.parse(readFileSync(STATS_FILE, 'utf8')));
  console.info('[seqout-chat] 已恢复使用统计：' + STATS_FILE);
} catch { /* 首次启动无快照，从零开始 */ }
let lastSaved = '';
setInterval(() => {
  try {
    const snap = JSON.stringify(dumpUsageStats());
    if (snap === lastSaved) return;
    writeFileSync(STATS_FILE + '.tmp', snap);
    renameSync(STATS_FILE + '.tmp', STATS_FILE);
    lastSaved = snap;
  } catch (err) {
    console.warn('[seqout-chat] 统计落盘失败：', err?.message || err);
  }
}, 15_000).unref();

const PORT = Number(process.env.CHAT_API_PORT || 8787);
// 监听地址：默认仅本机回环（宿主机裸跑 + 宿主机 nginx 反代时不暴露公网）；
// Docker 容器内必须显式设 CHAT_API_HOST=0.0.0.0（compose 已配），否则容器间网络不可达
const HOST = process.env.CHAT_API_HOST || '127.0.0.1';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,OneDay-App-Id,X-Meoo-Project-Url-Id',
};

const MAX_BODY = 1024 * 1024; // 请求体上限 1MB（对话请求远小于此，防异常大请求打满内存）

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const ac = new AbortController();
  res.on('close', () => ac.abort()); // 客户端断连 → 中止 handler 内的 LLM 循环，省 token
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify({ error: '请求体过大' }));
        return;
      }
      chunks.push(c);
    }
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      headers[k] = Array.isArray(v) ? v.join(', ') : v;
    }
    const request = new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method,
      headers,
      body: chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
      signal: ac.signal,
    });
    const response = await handler(request);
    res.writeHead(response.status, { ...CORS, ...Object.fromEntries(response.headers.entries()) });
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}).listen(PORT, HOST, () => {
  console.log(`[seqout-chat] 本地服务已启动: http://${HOST}:${PORT}`);
  console.log(`[seqout-chat] LLM_BASE_URL=${process.env.LLM_BASE_URL || 'https://api.meoo.host/meoo-ai/compatible-mode/v1'}`);
  if (!process.env.LLM_API_KEY && !process.env.MEOO_PROJECT_API_KEY) {
    console.warn('[seqout-chat] 警告：未设置 LLM_API_KEY，请求将返回 503');
  }
});
