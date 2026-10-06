// 自托管账号体系：注册 / 登录 / 聊天历史快照 / 排行榜统计（登录榜 + 访客榜）
// 零依赖，数据落盘 JSON（tmp + rename），与使用统计共用 DATA_DIR（容器挂 /app/data 卷）。
// 安全定位：自托管熟人场景——scrypt 存口令哈希 + 随机 token，无速率限制/邮箱验证。
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function createAccountApi({ dataDir }) {
  mkdirSync(dataDir, { recursive: true });
  const ACCOUNTS = join(dataDir, 'accounts.json');
  const GUESTS = join(dataDir, 'guests.json');
  const HISTORY_DIR = join(dataDir, 'history');
  mkdirSync(HISTORY_DIR, { recursive: true });

  // ---------- 极简 JSON 存储：读全量、内存改、防抖落盘 ----------
  const cache = new Map();
  function load(file, fallback) {
    if (!cache.has(file)) {
      try {
        cache.set(file, JSON.parse(readFileSync(file, 'utf8')));
      } catch {
        cache.set(file, fallback);
      }
    }
    return cache.get(file);
  }
  const dirty = new Set();
  let flushTimer = null;
  function mark(file) {
    dirty.add(file);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const f of dirty) {
        dirty.delete(f);
        try {
          writeFileSync(f + '.tmp', JSON.stringify(cache.get(f)));
          renameSync(f + '.tmp', f);
        } catch { /* 下次变更再试 */ }
      }
    }, 400);
    flushTimer.unref?.();
  }

  const accounts = () => load(ACCOUNTS, {});
  const guests = () => load(GUESTS, {});

  function saveAccount(email) { mark(ACCOUNTS); void email; }
  function saveGuests() { mark(GUESTS); }

  function historyFile(email) { return join(HISTORY_DIR, encodeURIComponent(email) + '.json'); }
  function readHistory(email) {
    const f = historyFile(email);
    if (cache.has(f)) return cache.get(f);
    let data = { sessions: [] };
    try { data = JSON.parse(readFileSync(f, 'utf8')); } catch { /* 首次 */ }
    cache.set(f, data);
    return data;
  }

  // ---------- 工具 ----------
  const hashOf = (password, salt) => scryptSync(password, salt, 32).toString('hex');
  const newToken = () => randomBytes(24).toString('hex');

  function mondayOf(d) {
    const m = new Date(d);
    m.setHours(0, 0, 0, 0);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
  }
  const emptyStats = () => ({
    treasures: 0, digs: 0, chats: 0,
    week_base: mondayOf(new Date()), week_treasures: 0, week_digs: 0, week_chats: 0,
    updated_at: '',
  });
  /** 累计列直接加；周列跨周归零后重计（与云端 RPC 语义一致） */
  function bumpRow(stats, delta) {
    const monday = mondayOf(new Date());
    if (stats.week_base !== monday) {
      stats.week_base = monday;
      stats.week_treasures = 0; stats.week_digs = 0; stats.week_chats = 0;
    }
    stats.treasures += num(delta.treasures);
    stats.digs += num(delta.digs);
    stats.chats += num(delta.chats);
    stats.week_treasures += num(delta.treasures);
    stats.week_digs += num(delta.digs);
    stats.week_chats += num(delta.chats);
    stats.updated_at = new Date().toISOString();
  }
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Number(v), 100000) : 0);
  const str = (v, max = 200) => String(v ?? '').slice(0, max);

  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }
  // body 由 local.mjs 预先读好传入（请求流只能消费一次）
  function bodyJson(bodyText) {
    if (!bodyText) return {};
    if (bodyText.length > 4 * 1024 * 1024) throw new Error('请求体过大');
    return JSON.parse(bodyText);
  }
  function bearer(req) {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  }
  /** token → 账号邮箱；无效返回 null */
  function userOfToken(req) {
    const token = bearer(req);
    if (!token) return null;
    for (const [email, acc] of Object.entries(accounts())) {
      if (acc.token === token) return email;
    }
    return null;
  }

  /** 排行榜行 → 统一输出形态 */
  function rowOut(name, stats, isGuest, key) {
    return {
      key, name,
      treasures: stats.treasures, digs: stats.digs, chats: stats.chats,
      week_treasures: stats.week_treasures, week_digs: stats.week_digs, week_chats: stats.week_chats,
      updated_at: stats.updated_at, isGuest,
    };
  }

  // ---------- 路由：返回 true 表示已处理 ----------
  return async function handleAccountApi(req, res, pathname, bodyText) {
    try {
      // 认证
      if (pathname === '/auth/register' && req.method === 'POST') {
        const { email, password, name } = bodyJson(bodyText);
        const em = str(email, 120).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return json(res, 400, { error: '邮箱格式不正确' });
        if (str(password).length < 6) return json(res, 400, { error: '密码至少 6 位' });
        const all = accounts();
        if (all[em]) return json(res, 409, { error: '该邮箱已注册，请直接登录' });
        const salt = randomBytes(16).toString('hex');
        all[em] = {
          name: str(name, 24) || em.split('@')[0],
          salt, hash: hashOf(String(password), salt),
          token: newToken(), stats: emptyStats(),
        };
        saveAccount(em);
        return json(res, 200, { token: all[em].token, email: em, name: all[em].name });
      }

      if (pathname === '/auth/login' && req.method === 'POST') {
        const { email, password } = bodyJson(bodyText);
        const em = str(email, 120).trim().toLowerCase();
        const acc = accounts()[em];
        const ok = acc && timingSafeEqual(Buffer.from(hashOf(String(password), acc.salt), 'hex'), Buffer.from(acc.hash, 'hex'));
        if (!ok) return json(res, 401, { error: '邮箱或密码不正确' });
        acc.token = newToken(); // 换发新 token（简单有效：旧端登出即失效）
        saveAccount(em);
        return json(res, 200, { token: acc.token, email: em, name: acc.name });
      }

      if (pathname === '/auth/me' && req.method === 'GET') {
        const em = userOfToken(req);
        if (!em) return json(res, 401, { error: '未登录或登录已过期' });
        return json(res, 200, { email: em, name: accounts()[em].name });
      }

      // 聊天历史（整快照同步：量小、幂等、好合并）
      if (pathname === '/history' && req.method === 'GET') {
        const em = userOfToken(req);
        if (!em) return json(res, 401, { error: '未登录或登录已过期' });
        return json(res, 200, readHistory(em));
      }

      if (pathname === '/history' && req.method === 'PUT') {
        const em = userOfToken(req);
        if (!em) return json(res, 401, { error: '未登录或登录已过期' });
        const body = bodyJson(bodyText);
        const sessions = Array.isArray(body.sessions) ? body.sessions.slice(0, 100) : [];
        cache.set(historyFile(em), { sessions, updated_at: new Date().toISOString() });
        mark(historyFile(em));
        return json(res, 200, { ok: true, count: sessions.length });
      }

      // 排行榜
      if (pathname === '/leaderboard' && req.method === 'GET') {
        const users = Object.entries(accounts())
          .map(([em, acc]) => rowOut(acc.name || em.split('@')[0], acc.stats ?? emptyStats(), false, `u:${em}`))
          .filter((r) => r.treasures > 0 || r.chats > 0)
          .sort((a, b) => b.treasures - a.treasures)
          .slice(0, 50);
        const guestRows = Object.entries(guests())
          .map(([device, g]) => rowOut(g.name || `访客-${device.slice(-4)}`, g.stats ?? emptyStats(), true, `g:${device}`))
          .filter((r) => r.treasures > 0 || r.chats > 0)
          .sort((a, b) => b.treasures - a.treasures)
          .slice(0, 50);
        return json(res, 200, { users, guests: guestRows });
      }

      if (pathname === '/stats/bump' && req.method === 'POST') {
        const body = bodyJson(bodyText);
        const em = userOfToken(req) ?? (str(body.token, 64) ? tokenEmail(body.token) : null);
        if (em) {
          const acc = accounts()[em];
          acc.stats ??= emptyStats();
          bumpRow(acc.stats, body);
          saveAccount(em);
          return json(res, 200, { ok: true });
        }
        const device = str(body.device, 64);
        if (!device) return json(res, 400, { error: '缺少 device' });
        const all = guests();
        all[device] ??= { name: null, stats: emptyStats() };
        bumpRow(all[device].stats, body);
        saveGuests();
        return json(res, 200, { ok: true });
      }

      // 登录时把本机游客期的累计成绩并入账号（一次性，前端合并后清零本地行）
      if (pathname === '/stats/merge' && req.method === 'POST') {
        const em = userOfToken(req);
        if (!em) return json(res, 401, { error: '未登录或登录已过期' });
        const body = bodyJson(bodyText);
        const acc = accounts()[em];
        acc.stats ??= emptyStats();
        bumpRow(acc.stats, body.totals ?? body);
        saveAccount(em);
        return json(res, 200, { ok: true });
      }

      if (pathname === '/stats/nickname' && req.method === 'POST') {
        const body = bodyJson(bodyText);
        const name = str(body.name, 24).trim();
        if (!name) return json(res, 400, { error: '昵称不能为空' });
        const em = userOfToken(req);
        if (em) {
          accounts()[em].name = name;
          saveAccount(em);
          return json(res, 200, { ok: true });
        }
        const device = str(body.device, 64);
        if (!device) return json(res, 400, { error: '缺少 device' });
        const all = guests();
        all[device] ??= { name: null, stats: emptyStats() };
        all[device].name = name;
        saveGuests();
        return json(res, 200, { ok: true });
      }

      return false; // 非账号路由，交回主 handler
    } catch (err) {
      json(res, 400, { error: String(err?.message || err) });
      return true;
    }
  };

  function tokenEmail(token) {
    for (const [email, acc] of Object.entries(accounts())) {
      if (acc.token === str(token, 64)) return email;
    }
    return null;
  }
}

export function defaultDataDir(root) {
  return process.env.DATA_DIR || (process.env.STATS_FILE ? dirname(resolve(process.env.STATS_FILE)) : join(root, 'server', 'data'));
}
