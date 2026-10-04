// T2 文献联动前端封装：非流式 JSON 请求（选中 → 3s 内出文献卡片）
// not_found 是正常业务状态（返回卡片对象），只有网络/服务故障才 reject
import { projectUrlId, supabase, supabaseUrl } from "@/supabase/client";

const CHAT_API: string = (import.meta.env.VITE_CHAT_API || "").trim();

function chatEndpoint(): string {
  return CHAT_API || `${supabaseUrl}/functions/v1/seqout-chat`;
}

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

/** 拉取文献卡片；3s 超时；never throws（错误统一转 not_found 变体由 UI 优雅降级） */
export async function fetchLiterature(kind: string, id: string): Promise<LiteratureCardDTO> {
  const session = (await supabase.auth.getSession()).data.session;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(chatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(projectUrlId ? { "OneDay-App-Id": projectUrlId } : {}),
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action: "literature", kind, id }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()) as LiteratureCardDTO;
  } catch {
    // 网络/超时/服务故障：不算 error，走优雅降级
    return { status: "not_found", suggested_queries: [id] };
  } finally {
    clearTimeout(timer);
  }
}
