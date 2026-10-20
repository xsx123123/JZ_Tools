// 会话与消息的云端存取（Supabase Client，RLS 仅本人可见）
import { supabase } from "@/supabase/client";
import { readLang, translate } from "@/i18n";
import type { Json } from "@/supabase/types";
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

export async function listSessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionRow[];
}

export async function createSession(userId: string, title: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId, title })
    .select("id,title,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as SessionRow;
}

export async function renameSession(id: string, title: string): Promise<void> {
  const { error } = await supabase.from("chat_sessions").update({ title }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function touchSession(id: string): Promise<void> {
  await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function deleteSession(id: string): Promise<void> {
  const { data, error } = await supabase.from("chat_sessions").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(translate(readLang(), "err.deleteSession"));
}

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,role,content,cards,tool_logs")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MessageRow[];
}

export async function insertMessage(
  sessionId: string,
  userId: string,
  msg: { role: "user" | "assistant"; content: string; cards?: DatasetCard[] | null; tool_logs?: ToolLog[] | null },
): Promise<string> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      role: msg.role,
      content: msg.content,
      cards: (msg.cards ?? null) as Json,
      tool_logs: (msg.tool_logs ?? null) as Json,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
