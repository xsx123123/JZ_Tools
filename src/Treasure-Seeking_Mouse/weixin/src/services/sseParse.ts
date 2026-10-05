// 【小程序版】SSE 帧解析器（纯函数，无平台依赖，可被 Node 直接单测）
//
// 从 seqoutChat.ts 抽离：TextDecoder 累积 → 按 \n 切行 → 只处理完整帧，
// 跨 chunk 的半帧留到下一块；flush() 冲刷流结束时的残留缓冲。
// 帧格式与网页版/后端一致（data: {...}\n\n 逐帧，另有 ": ping" 心跳与 [DONE]）。
//
// 刻意不 import Taro / seqoutChat：本文件是验证 harness（scripts/verify-stream.mjs）
// 的唯一依赖，类型全部就地结构声明（与 seqoutChat 的 DatasetCard/ToolLog 结构兼容）。

export interface SseToolEvent {
  name: string;
  label: string;
  status: "running" | "done" | "error";
  ms?: number;
  error?: string;
}

export interface SseCard {
  tool: string;
  accession: string;
  title: string;
  summary: string;
  meta: Record<string, string>;
}

export interface SseToolLog {
  name: string;
  label: string;
  ok: boolean;
  ms: number;
}

export interface SseHandlers {
  onDelta: (text: string) => void;
  onTool: (evt: SseToolEvent) => void;
  onCards: (cards: SseCard[]) => void;
  onEnd: (payload: { cards: SseCard[]; tools: SseToolLog[] }) => void;
  onError: (message: string) => void;
}

export function createFrameParser(handlers: SseHandlers) {
  let buffer = "";
  const decoder = new TextDecoder("utf-8");

  function handleLine(line: string): void {
    const t = line.trim();
    if (!t.startsWith("data:")) return; // 忽略 ": ping" 心跳
    const payload = t.slice(5).trim();
    if (payload === "[DONE]") return;
    try {
      const obj = JSON.parse(payload) as Record<string, unknown>;
      if (typeof obj.delta === "string" && obj.delta) handlers.onDelta(obj.delta);
      else if (obj.event === "tool") {
        handlers.onTool({
          name: String(obj.name ?? ""),
          label: String(obj.label ?? ""),
          status: obj.status === "running" || obj.status === "error" ? obj.status : "done",
          ms: typeof obj.ms === "number" ? obj.ms : undefined,
          error: typeof obj.error === "string" ? obj.error : undefined,
        });
      } else if (obj.event === "cards" && Array.isArray(obj.cards)) {
        handlers.onCards(obj.cards as SseCard[]);
      } else if (obj.event === "end") {
        handlers.onEnd({
          cards: Array.isArray(obj.cards) ? (obj.cards as SseCard[]) : [],
          tools: Array.isArray(obj.tools) ? (obj.tools as SseToolLog[]) : [],
        });
      } else if (typeof obj.error === "string") {
        handlers.onError(obj.error);
      }
    } catch {
      /* 忽略非法行（半帧/非 JSON 噪声），不中断整体流 */
    }
  }

  return {
    /** 收到一块字节，按行切分并处理完整行 */
    push(chunk: ArrayBuffer): void {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 最后一段可能不完整，留到下一块
      for (const line of lines) handleLine(line);
    },
    /** 流结束：冲刷残留缓冲 */
    flush(): void {
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      buffer = "";
    },
  };
}
