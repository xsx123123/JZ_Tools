// 会话与消息的云端存取（QMuse TablesDB facade，行权限沿用平台默认：创建者本人可写）
import {
  createQmuseRow,
  deleteQmuseRow,
  listQmuseRows,
  Query,
  updateQmuseRow,
  type Models,
} from "./appwrite";
import type { DatasetCard, ToolLog } from "./seqoutChat";

export interface SessionRow {
  id: string;
  title: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: DatasetCard[] | null;
  tool_logs: ToolLog[] | null;
}

interface ChatSessionRow extends Models.Row {
  user_id: string;
  title: string;
  updated_at?: string;
}

interface ChatMessageRow extends Models.Row {
  session_id: string;
  user_id: string;
  role: string;
  content: string;
  cards?: string | null;
  tool_logs?: string | null;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export async function listSessions(userId: string): Promise<SessionRow[]> {
  const rows: ChatSessionRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await listQmuseRows<ChatSessionRow>({
      tableId: "chat_sessions",
      queries: [Query.equal("user_id", userId)],
      limit: 20,
      cursor,
    });
    rows.push(...res.rows);
    if (res.rows.length < 20 || rows.length >= res.total) break;
    cursor = res.rows[res.rows.length - 1].$id;
  }
  return rows
    .map((r) => ({
      id: r.$id,
      title: r.title,
      updated_at: r.updated_at ?? r.$updatedAt,
    }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 50);
}

export async function createSession(userId: string, title: string): Promise<SessionRow> {
  const row = await createQmuseRow<ChatSessionRow>({
    tableId: "chat_sessions",
    data: { user_id: userId, title, updated_at: new Date().toISOString() },
  });
  return {
    id: row.$id,
    title: row.title,
    updated_at: row.updated_at ?? row.$updatedAt,
  };
}

export async function renameSession(id: string, title: string): Promise<void> {
  await updateQmuseRow<ChatSessionRow>({
    tableId: "chat_sessions",
    rowId: id,
    data: { title },
  });
}

export async function touchSession(id: string): Promise<void> {
  await updateQmuseRow<ChatSessionRow>({
    tableId: "chat_sessions",
    rowId: id,
    data: { updated_at: new Date().toISOString() },
  });
}

export async function deleteSession(id: string): Promise<void> {
  await deleteQmuseRow({ tableId: "chat_sessions", rowId: id });
}

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  const rows: ChatMessageRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await listQmuseRows<ChatMessageRow>({
      tableId: "chat_messages",
      queries: [Query.equal("session_id", sessionId)],
      limit: 20,
      cursor,
    });
    rows.push(...res.rows);
    if (res.rows.length < 20 || rows.length >= res.total) break;
    cursor = res.rows[res.rows.length - 1].$id;
  }
  // facade 固定 $createdAt 降序，反转为时间升序
  rows.reverse();
  return rows.map((r) => ({
    id: r.$id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    cards: parseJsonArray<DatasetCard>(r.cards),
    tool_logs: parseJsonArray<ToolLog>(r.tool_logs),
  }));
}

export async function insertMessage(
  sessionId: string,
  userId: string,
  msg: { role: "user" | "assistant"; content: string; cards?: DatasetCard[] | null; tool_logs?: ToolLog[] | null },
): Promise<string> {
  const row = await createQmuseRow<ChatMessageRow>({
    tableId: "chat_messages",
    data: {
      session_id: sessionId,
      user_id: userId,
      role: msg.role,
      content: msg.content,
      cards: msg.cards ? JSON.stringify(msg.cards) : null,
      tool_logs: msg.tool_logs ? JSON.stringify(msg.tool_logs) : null,
    },
  });
  return row.$id;
}
