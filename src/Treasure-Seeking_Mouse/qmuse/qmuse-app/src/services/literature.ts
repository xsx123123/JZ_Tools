// T2 文献联动前端封装（QMuse 版）：走云函数非流式 action（选中 → 出文献卡片）
// not_found 是正常业务状态（返回卡片对象），只有网络/服务故障才转 not_found 变体优雅降级
import { executeQmuseFunction } from "./appwrite";

export interface OutlineSection {
  section: string;
  text: string;
}

export interface LiteratureCardDTO {
  status: "ok" | "not_found";
  pmid?: string;
  title?: string;
  journal?: string;
  year?: string;
  doi?: string;
  outline?: OutlineSection[];
  urls?: { pubmed?: string; doi?: string; full_text?: string };
  suggested_queries?: string[];
}

// 前端进程内缓存：hover 浮层反复打开不重复打云函数；ok 10 分钟 / not_found 5 分钟
const CACHE_TTL_OK = 10 * 60 * 1000;
const CACHE_TTL_NEG = 5 * 60 * 1000;
const litCache = new Map<string, { expires: number; card: LiteratureCardDTO }>();

/** 拉取文献卡片；never throws（错误统一转 not_found 变体由 UI 优雅降级） */
export async function fetchLiterature(kind: string, id: string): Promise<LiteratureCardDTO> {
  const cacheKey = `${kind}:${id}`;
  const hit = litCache.get(cacheKey);
  if (hit && Date.now() < hit.expires) return hit.card;
  const card = await fetchLiteratureRemote(kind, id);
  litCache.set(cacheKey, { expires: Date.now() + (card.status === "ok" ? CACHE_TTL_OK : CACHE_TTL_NEG), card });
  if (litCache.size > 300) {
    const drop = litCache.size - 200;
    let i = 0;
    for (const k of litCache.keys()) { if (i++ >= drop) break; litCache.delete(k); }
  }
  return card;
}

async function fetchLiteratureRemote(kind: string, id: string): Promise<LiteratureCardDTO> {
  try {
    const execution = await executeQmuseFunction({
      functionId: "seqout-chat",
      body: JSON.stringify({ action: "literature", kind, id }),
    });
    // QMuse 云函数返回 ExecutionResponse：responseBody 为 JSON 字符串（与 seqoutChat 的 parseResponseBody 一致）
    const raw = typeof (execution as { responseBody?: unknown }).responseBody === "string"
      ? (execution as { responseBody: string }).responseBody
      : "";
    const json = JSON.parse(raw) as LiteratureCardDTO & { error?: string };
    if (typeof json.error === "string") throw new Error(json.error);
    if (json.status !== "ok" && json.status !== "not_found") throw new Error("bad response");
    return json;
  } catch {
    // 网络/超时/服务故障：不算 error，走优雅降级
    return { status: "not_found", suggested_queries: [id] };
  }
}
