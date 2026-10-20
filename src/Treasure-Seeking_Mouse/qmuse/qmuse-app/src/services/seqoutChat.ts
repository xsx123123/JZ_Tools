// seqout-chat 云函数前端封装（QMuse）：云函数整包返回 JSON + 前端本地模拟流式
// 云函数不支持 SSE，requestSeqoutChat 拿到 {text, cards, tools} 后按序回调 handlers，
// 并把正文切片喂 onDelta 营造打字机效果。
import { executeQmuseFunction } from "./appwrite";

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

interface ChatFunctionPayload {
  text?: string;
  cards?: DatasetCard[];
  tools?: ToolLog[];
  error?: string;
  models?: string[];
  defaultModel?: string;
}

/** 从云函数执行结果解析 JSON 响应体 */
function parseResponseBody(execution: unknown): ChatFunctionPayload | null {
  const body = (execution as { responseBody?: unknown } | null)?.responseBody;
  if (typeof body !== "string" || !body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" ? (parsed as ChatFunctionPayload) : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET 模型目录（失败由调用方兜底，不抛出） */
export async function fetchModelCatalog(): Promise<{ models: string[]; defaultModel: string | null } | null> {
  try {
    const execution = await executeQmuseFunction({
      functionId: "seqout-chat",
      body: JSON.stringify({ action: "models" }),
    });
    const json = parseResponseBody(execution);
    if (!json || typeof json.error === "string") return null;
    if (!Array.isArray(json.models)) return null;
    return {
      models: json.models,
      defaultModel: typeof json.defaultModel === "string" ? json.defaultModel : null,
    };
  } catch {
    return null;
  }
}

/** 对话请求；云函数整包返回，本地模拟流式回调，返回的 Promise 在结束/出错时 resolve */
export async function requestSeqoutChat(
  messages: ChatMessageDTO[],
  model: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let execution: unknown;
  try {
    execution = await executeQmuseFunction({
      functionId: "seqout-chat",
      body: JSON.stringify({ action: "chat", messages, model }),
    });
  } catch {
    handlers.onError("无法连接数据服务，请检查网络后重试");
    return;
  }

  const payload = parseResponseBody(execution);
  if (!payload) {
    handlers.onError("无法连接数据服务，请检查网络后重试");
    return;
  }
  if (typeof payload.error === "string") {
    handlers.onError(payload.error);
    return;
  }

  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const text = typeof payload.text === "string" ? payload.text : "";

  // 工具日志：先依次 running，再立即 done/error，还原主仓库的工具执行时序
  for (const tool of tools) {
    handlers.onTool({ name: tool.name, label: tool.label, status: "running" });
    handlers.onTool(
      tool.ok
        ? { name: tool.name, label: tool.label, status: "done", ms: tool.ms }
        : { name: tool.name, label: tool.label, status: "error", ms: tool.ms },
    );
  }

  if (cards.length) handlers.onCards(cards);

  // 模拟流式：正文切片喂 onDelta，abort 时停止喂剩余文本且不回调 onEnd
  const CHUNK = 8;
  const DELAY = 12;
  for (let i = 0; i < text.length; i += CHUNK) {
    if (signal?.aborted) return;
    handlers.onDelta(text.slice(i, i + CHUNK));
    await sleep(DELAY);
  }
  if (signal?.aborted) return;

  handlers.onEnd({ cards, tools });
}
