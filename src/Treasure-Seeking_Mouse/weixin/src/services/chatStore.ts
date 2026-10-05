// 【小程序版】会话存储：小程序无同类会话栏后端，统一走本机存储
//
// 与网页版的差异：
//   网页版有「登录用户云端 Supabase / 游客本机网页存储」双路；小程序版暂无云端账号体系，
//   统一落本机存储（key 与网页版一致，便于日后打通迁移）。登录后如需跨设备同步，
//   在此对接 wx.login → 自建后端即可，接口形状保持不变。
import { getJSON, setJSON } from "./device";
import { readLang, translate } from "@/i18n";

export interface SessionRow {
  id: string;
  title: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: unknown;
  tool_logs: unknown;
}

interface LocalSession {
  id: string;
  title: string;
  messages: MessageRow[];
  ts: number;
}

const KEY_SESSIONS = "seqout-local-session";
const MAX_SESSIONS = 50;
const KEEP_DAYS = 7;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readAll(): LocalSession[] {
  const parsed = getJSON<(LocalSession & { ts?: number })[]>(KEY_SESSIONS);
  if (!Array.isArray(parsed)) return [];
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  return parsed
    .map((s) => ({ ...s, ts: typeof s.ts === "number" ? s.ts : Date.now() }))
    .filter((s) => s.ts >= cutoff)
    .slice(-MAX_SESSIONS);
}

function writeAll(list: LocalSession[]): void {
  setJSON(KEY_SESSIONS, list.slice(-MAX_SESSIONS));
}

export async function listSessions(): Promise<SessionRow[]> {
  return readAll()
    .filter((s) => s.messages.length > 0)
    .map((s) => ({ id: s.id, title: s.title, updated_at: new Date(s.ts).toISOString() }))
    .reverse();
}

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  return readAll().find((s) => s.id === sessionId)?.messages ?? [];
}

export async function createSession(title: string): Promise<SessionRow> {
  const now = Date.now();
  const row: LocalSession = { id: uid(), title: title.slice(0, 30), messages: [], ts: now };
  const list = readAll();
  list.push(row);
  writeAll(list);
  return { id: row.id, title: row.title, updated_at: new Date(now).toISOString() };
}

export async function renameSession(id: string, title: string): Promise<void> {
  const list = readAll();
  const hit = list.find((s) => s.id === id);
  if (hit) hit.title = title;
  writeAll(list);
}

export async function touchSession(id: string): Promise<void> {
  const list = readAll();
  const hit = list.find((s) => s.id === id);
  if (hit) hit.ts = Date.now();
  writeAll(list);
}

export async function deleteSession(id: string): Promise<void> {
  const list = readAll();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) throw new Error(translate(readLang(), "err.deleteSession"));
  writeAll(next);
}

export async function insertMessage(sessionId: string, msg: MessageRow): Promise<void> {
  const list = readAll();
  const hit = list.find((s) => s.id === sessionId);
  if (!hit) return;
  hit.messages.push(msg);
  hit.ts = Date.now();
  writeAll(list);
}
