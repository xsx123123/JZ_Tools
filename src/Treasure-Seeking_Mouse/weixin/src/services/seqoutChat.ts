// 【小程序版】seqout 对话服务客户端：流式请求 + 分块解析
//
// 与网页版的差异（务必留意）：
//   1. fetch/ReadableStream 不存在 → 改用 wx.request + enableChunked + onChunkReceived
//   2. 小程序无「同源反代」概念 → 后端必须是独立 HTTPS 域名，且已加入 request 合法域名
//   3. 无 supabase 登录态 → 登录改走 wx.login（详见 auth.ts），此处只带访客设备指纹
//
// SSE 帧格式与网页版完全一致（data: {...}\n\n 逐帧），因此解析逻辑可与网页版共用同一套
// 正则/JSON 处理；差异只在「怎么拿到字节流」这一层。
import Taro from "@tarojs/taro";
import { readLang, translate } from "@/i18n";
import { getDeviceId } from "./device";
import { createFrameParser, type SseHandlers } from "./sseParse";

/** 对话服务地址：构建期经 config/index.ts 的 defineConstants 注入（process.env.CHAT_API），
 *  本地未注入时回退占位符。必须是已配置到小程序后台的 HTTPS 合法域名 */
const CHAT_API: string = process.env.CHAT_API || "";

function chatEndpoint(): string {
  return CHAT_API || "https://YOUR_DOMAIN/chat-api";
}
// 供 literature.ts 等同域服务复用（保持单一占位符来源，R3 换域名只改这一处）
export { chatEndpoint };

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

export type StreamHandlers = SseHandlers;

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    // 使用统计去重标识：小程序端恒为访客设备指纹（登录后由 auth 层提供 openid）
    "X-Stats-Actor": getDeviceId(),
    // 可选防刷密钥：后端配置 CHAT_SHARED_SECRET 时必须匹配，否则 401；未配置时为空串无影响
    "X-Chat-Key": process.env.CHAT_SHARED_SECRET || "",
  };
}

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
    const resp = await Taro.request<UsageStats>({ url: `${chatEndpoint()}/stats`, header: headers() });
    if (resp.statusCode !== 200) return null;
    return resp.data;
  } catch {
    return null;
  }
}

/** GET 模型目录（失败由调用方兜底，不抛出） */
export async function fetchModelCatalog(): Promise<{ models: string[]; defaultModel: string | null } | null> {
  try {
    const resp = await Taro.request<{ models?: string[]; defaultModel?: string; data?: { id: string }[] }>({
      url: chatEndpoint(),
      header: headers(),
    });
    if (resp.statusCode !== 200) return null;
    const json = resp.data;
    if (Array.isArray(json.models)) return { models: json.models, defaultModel: json.defaultModel ?? null };
    if (Array.isArray(json.data)) {
      return { models: json.data.map((m) => m.id), defaultModel: json.defaultModel ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * SSE 帧解析器在 ./sseParse（纯函数、Node 可单测）。
 * 关键点：chunk 边界可能切断一帧，必须用 buffer 累积、只在见到完整行时才处理——
 * 这一点与网页版流式读取器的处理方式一致，只是数据源换成了 onChunkReceived。
 */

/** POST 流式对话；返回的 Promise 在流结束/出错时 resolve */
export function requestSeqoutChat(
  messages: ChatMessageDTO[],
  model: string,
  handlers: StreamHandlers,
  abortRef?: { current: { abort: () => void } | null },
  lang: "zh" | "en" = "zh",
): Promise<void> {
  return new Promise<void>((resolve) => {
    const parser = createFrameParser(handlers);
    let settled = false;
    // 双发防御：个别基础库版本既触发 onChunkReceived、success 的 res.data 又含完整 body，
    // 若两条路径都喂解析器会导致 delta 重复渲染——收到过任一分块就只信分块流
    let gotChunk = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const task = Taro.request({
      url: chatEndpoint(),
      method: "POST",
      header: headers(),
      data: { messages, model, stream: true, lang },
      // 小程序流式关键开关：开启分块传输，配合 onChunkReceived 收流
      enableChunked: true,
      responseType: "arraybuffer",
      success: (res) => {
        // 兜底：个别基础库/开发者工具版本不触发 onChunkReceived 时，
        // success 里拿到的是完整响应体（arraybuffer），整块喂给解析器结果一致
        const data = (res as unknown as { data?: unknown })?.data;
        if (!gotChunk && data instanceof ArrayBuffer) {
          try {
            parser.push(data);
          } catch {
            /* ignore */
          }
        }
        parser.flush();
        done();
      },
      fail: (err) => {
        const msg = String(err?.errMsg ?? "");
        if (/abort/i.test(msg)) {
          done();
          return;
        }
        handlers.onError(translate(readLang(), "err.connect"));
        done();
      },
      complete: () => done(),
    });

    // 暴露中断能力：供「停止生成」按钮调用
    if (abortRef) abortRef.current = { abort: () => task.abort() };

    task.onChunkReceived((res) => {
      gotChunk = true;
      try {
        parser.push(res.data);
      } catch {
        /* 忽略单块解析异常，不中断整体流 */
      }
    });
  });
}
