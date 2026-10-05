// 【小程序版】文献联动前端封装：非流式 JSON 请求（选中 → 3s 内出文献卡片）
// 对应网页版 src/services/literature.ts：fetch→Taro.request、去掉 Supabase 鉴权头
// （小程序暂无云端账号，恒为访客身份）；缓存/TTL/优雅降级策略与网页版一致。
// not_found 是正常业务状态（返回卡片对象），只有网络/服务故障才走降级变体。
import Taro from "@tarojs/taro";
import { chatEndpoint } from "./seqoutChat";

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

// 前端进程内缓存：反复打开不重复打后端；ok 10 分钟 / not_found 5 分钟
const CACHE_TTL_OK = 10 * 60 * 1000;
const CACHE_TTL_NEG = 5 * 60 * 1000;
const litCache = new Map<string, { expires: number; card: LiteratureCardDTO }>();

/** 拉取文献卡片；3s 超时；never throws（错误统一转 not_found 变体由 UI 优雅降级） */
export async function fetchLiterature(kind: string, id: string): Promise<LiteratureCardDTO> {
  const cacheKey = `${kind}:${id}`;
  const hit = litCache.get(cacheKey);
  if (hit && Date.now() < hit.expires) return hit.card;
  const card = await fetchLiteratureRemote(kind, id);
  litCache.set(cacheKey, { expires: Date.now() + (card.status === "ok" ? CACHE_TTL_OK : CACHE_TTL_NEG), card });
  if (litCache.size > 300) {
    const drop = litCache.size - 200;
    let i = 0;
    for (const k of litCache.keys()) {
      if (i++ >= drop) break;
      litCache.delete(k);
    }
  }
  return card;
}

async function fetchLiteratureRemote(kind: string, id: string): Promise<LiteratureCardDTO> {
  try {
    const resp = await Taro.request<LiteratureCardDTO>({
      url: chatEndpoint(),
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: { action: "literature", kind, id },
      timeout: 3000, // 对齐网页版 AbortController 3s
    });
    if (resp.statusCode !== 200 || !resp.data) throw new Error(`HTTP ${resp.statusCode}`);
    return resp.data;
  } catch {
    // 网络/超时/服务故障：不算 error，走优雅降级
    return { status: "not_found", suggested_queries: [id] };
  }
}
