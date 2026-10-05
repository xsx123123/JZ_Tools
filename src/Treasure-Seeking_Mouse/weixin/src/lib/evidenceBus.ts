// v2.1/T2 事件桥：Markdown 渲染深处的 IdLink 与消息列表层之间的轻量通信
// IdLink 不持有路由状态，通过模块级监听器把"查看证据链"请求抛给上层（ChatMessage → 路由）
import type { IdMatch } from "@/lib/linkify";

export interface EvidenceRequest {
  kind: string; // "geo_series" | "geo_sample" | "go_term" | "pubmed"
  id: string;
  match?: IdMatch;
  /** 宿主消息 id：文献卡片渲染在该消息下方 */
  hostMessageId?: string;
}

type Listener = (req: EvidenceRequest) => void;

// 多播：每条挂了 IdLink/文献入口的消息各自注册，按 hostMessageId 认领自己的请求
const listeners = new Set<Listener>();

export function addEvidenceListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** IdLink / DatasetCard → 上层：请求打开文献证据链卡片 */
export function requestEvidence(req: EvidenceRequest): void {
  for (const fn of listeners) fn(req);
}
