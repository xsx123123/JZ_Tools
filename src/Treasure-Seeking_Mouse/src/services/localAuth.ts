// 自托管本地账号：注册 / 登录 / 聊天历史快照同步 / 排行榜上报（走 VITE_CHAT_API 同一服务端）
// 仅在 isOfflineMode（未配 Supabase）时启用；token 存 localStorage，服务端 scrypt 校验口令。
import { chatEndpoint } from "@/services/seqoutChat";
import { getDeviceId } from "@/services/statsStore";

const KEY_TOKEN = "seqout-local-token";
const KEY_USER = "seqout-local-user"; // {email, name} 展示用快照，token 才是凭证

export interface LocalUser {
  id: string; // = email
  email: string;
  name: string;
}

export function getLocalToken(): string {
  try {
    return localStorage.getItem(KEY_TOKEN) ?? "";
  } catch {
    return "";
  }
}

export function readLocalUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    if (!raw) return null;
    const u = JSON.parse(raw) as LocalUser;
    return u && u.email ? u : null;
  } catch {
    return null;
  }
}

function persist(user: LocalUser | null, token?: string): void {
  try {
    if (user) localStorage.setItem(KEY_USER, JSON.stringify(user));
    else localStorage.removeItem(KEY_USER);
    if (token !== undefined) {
      if (token) localStorage.setItem(KEY_TOKEN, token);
      else localStorage.removeItem(KEY_TOKEN);
    }
  } catch {
    /* ignore */
  }
}

async function req<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = getLocalToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const resp = await fetch(`${chatEndpoint()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
  return data;
}

/** 启动时用本地 token 恢复登录态；服务端不可用时返回 null（保持游客） */
export async function localMe(): Promise<LocalUser | null> {
  if (!getLocalToken()) return null;
  try {
    const me = await req<{ email: string; name: string }>("/auth/me");
    const user: LocalUser = { id: me.email, email: me.email, name: me.name };
    persist(user);
    return user;
  } catch {
    return null;
  }
}

export async function localLogin(email: string, password: string): Promise<LocalUser> {
  const r = await req<{ token: string; email: string; name: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  const user: LocalUser = { id: r.email, email: r.email, name: r.name };
  persist(user, r.token);
  return user;
}

export async function localRegister(email: string, password: string, name: string): Promise<LocalUser> {
  const r = await req<{ token: string; email: string; name: string }>("/auth/register", {
    method: "POST",
    body: { email, password, name },
    auth: false,
  });
  const user: LocalUser = { id: r.email, email: r.email, name: r.name };
  persist(user, r.token);
  return user;
}

export function localLogout(): void {
  persist(null, "");
}

// ---------- 聊天历史快照（整包同步：小数据量、幂等、易合并） ----------

export interface LocalSessionSnapshot {
  id: string;
  title: string;
  messages: unknown[];
  ts: number;
}

export async function pullServerHistory(): Promise<LocalSessionSnapshot[]> {
  const r = await req<{ sessions?: LocalSessionSnapshot[] }>("/history");
  return Array.isArray(r.sessions) ? r.sessions : [];
}

export async function pushServerHistory(sessions: LocalSessionSnapshot[]): Promise<void> {
  await req("/history", { method: "PUT", body: { sessions } });
}

// ---------- 排行榜统计 ----------

export interface LocalStatTotals {
  treasures: number;
  digs: number;
  chats: number;
}

/** 累计上报：带 token 记账号行，否则记本机设备访客行 */
export async function pushServerStats(delta: Partial<LocalStatTotals>): Promise<void> {
  const body: Record<string, unknown> = { ...delta, device: getDeviceId() };
  const token = getLocalToken();
  if (token) body.token = token;
  await req("/stats/bump", { method: "POST", body, auth: false });
}

/** 登录时把游客期本机累计成绩并入账号行（一次性；调用方随后清零本地行防重复合并） */
export async function mergeServerStats(totals: LocalStatTotals): Promise<void> {
  await req("/stats/merge", { method: "POST", body: { totals } });
}

export async function pushServerNickname(name: string): Promise<void> {
  const body: Record<string, unknown> = { name, device: getDeviceId() };
  const token = getLocalToken();
  if (token) body.token = token;
  await req("/stats/nickname", { method: "POST", body, auth: false });
}

export interface ServerStatRow extends LocalStatTotals {
  key: string;
  name: string;
  week_treasures: number;
  week_digs: number;
  week_chats: number;
  updated_at: string;
  isGuest: boolean;
}

export async function pullServerLeaderboard(): Promise<{ users: ServerStatRow[]; guests: ServerStatRow[] }> {
  return req("/leaderboard", { auth: false });
}
