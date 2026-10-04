// seqout-chat Edge Function 前端封装：流式请求 + SSE 解析
import { projectUrlId, supabase, supabaseUrl } from "@/supabase/client";
import { getDeviceId } from "@/services/statsStore";

// 自托管模式：VITE_CHAT_API 指向任意 OpenAI 兼容对话服务（如本地 server/local.mjs 的 http://localhost:8787）
// 未设置时走 Meoo 平台 Edge Function（须带 OneDay-App-Id 头）
const CHAT_API: string = (import.meta.env.VITE_CHAT_API || "").trim();

function chatEndpoint(): string {
  return CHAT_API || `${supabaseUrl}/functions/v1/seqout-chat`;
}

export interface ChatMessageDTO {
  role: "user" | "assistant";
  content: string;
}

export interface DatasetCard {
  tool: string;
  accession: string;
  title: string;
  summary: string;
  meta: Record<string, string>;
}

export interface ToolLog {
  name: string;
  label: string;
  ok: boolean;
  ms: number;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onTool: (evt: { name: string; label: string; status: "running" | "done" | "error"; ms?: number; error?: string }) => void;
  onCards: (cards: DatasetCard[]) => void;
  onEnd: (payload: { cards: DatasetCard[]; tools: ToolLog[] }) => void;
  onError: (message: string) => void;
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = (await supabase.auth.getSession()).data.session;
  return {
    "Content-Type": "application/json",
    ...(projectUrlId ? { "OneDay-App-Id": projectUrlId } : {}),
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    // 使用统计去重标识：登录用户用 user id，访客用设备指纹（服务端只存哈希键，不关联对话内容）
    "X-Stats-Actor": session?.user?.id ?? getDeviceId(),
  };
}

/** 服务端使用统计（GET <endpoint>/stats）：对话次数 / token / 去重人数 / 每个工具调用次数 */
export interface UsageStats {
  chats: number;
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  toolCalls: number;
  toolErrors: number;
  actors: number;
  tools: { name: string; label: string; count: number; errors: number }[];
  since: string;
  updatedAt: string;
}

export async function fetchUsageStats(): Promise<UsageStats | null> {
  try {
    const resp = await fetch(`${chatEndpoint()}/stats`, { headers: await authHeaders() });
    if (!resp.ok) return null;
    return (await resp.json()) as UsageStats;
  } catch {
    return null;
  }
}

/** GET 模型目录（失败由调用方兜底，不抛出） */
export async function fetchModelCatalog(): Promise<{ models: string[]; defaultModel: string | null } | null> {
  try {
    const resp = await fetch(chatEndpoint(), {
      headers: await authHeaders(),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    // Meoo 网关形态：{ models: [...], defaultModel }
    if (Array.isArray(json.models)) return json;
    // 标准 OpenAI 形态：{ object: 'list', data: [{ id, ... }] }
    if (Array.isArray(json.data)) {
      const ids: string[] = [];
      for (const m of json.data as unknown[]) {
        if (m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string") {
          ids.push((m as { id: string }).id);
        }
      }
      return {
        models: ids,
        defaultModel: typeof json.defaultModel === "string" ? json.defaultModel : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** POST 流式对话；返回的 Promise 在流结束/出错时 resolve */
export async function requestSeqoutChat(
  messages: ChatMessageDTO[],
  model: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(chatEndpoint(), {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ messages, model, stream: true }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError("无法连接数据服务，请检查网络后重试");
    return;
  }
  if (!response.ok) {
    let detail = `请求失败（${response.status}）`;
    try {
      const j = await response.json();
      if (typeof j?.error === "string") detail = j.error;
    } catch {
      /* ignore */
    }
    handlers.onError(detail);
    return;
  }
  if (!response.body) {
    handlers.onError("当前环境不支持流式响应");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue; // 忽略 ": ping" 心跳
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const obj = JSON.parse(payload);
          if (typeof obj.delta === "string" && obj.delta) handlers.onDelta(obj.delta);
          else if (obj.event === "tool") handlers.onTool(obj);
          else if (obj.event === "cards" && Array.isArray(obj.cards)) handlers.onCards(obj.cards);
          else if (obj.event === "end") handlers.onEnd({ cards: obj.cards ?? [], tools: obj.tools ?? [] });
          else if (typeof obj.error === "string") handlers.onError(obj.error);
        } catch {
          /* 忽略非法行 */
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") handlers.onError("响应中断，请重试");
  }
}
