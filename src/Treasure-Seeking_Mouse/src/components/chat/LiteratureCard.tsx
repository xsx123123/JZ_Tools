// T2 文献联动卡片：结构化摘要分段 outline + 原文链接（DOI / PubMed / OA 全文）
// not_found 显示建议检索词；加载中骨架 ≤3s；完全不阻塞主对话流程
import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, FileText, X } from "lucide-react";
import { fetchLiterature, type LiteratureCardDTO } from "@/services/literature";

export function LiteratureCardPanel({
  kind,
  id,
  onClose,
}: {
  kind: string;
  id: string;
  onClose?: () => void;
}): React.ReactElement {
  const [state, setState] = useState<"loading" | "done">("loading");
  const [card, setCard] = useState<LiteratureCardDTO | null>(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setCard(null);
    void fetchLiterature(kind, id).then((c) => {
      if (!alive) return;
      setCard(c);
      setState("done");
    });
    return () => {
      alive = false;
    };
  }, [kind, id]);

  return (
    <div className="card-in relative mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 bg-pet-gold-soft/40 px-3.5 py-2">
        <BookOpen size={13} className="shrink-0 text-pet-amber-deep" />
        <span className="font-display text-[12px] font-semibold tracking-wide text-foreground/80">文献证据链</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{id}</span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭文献卡片"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {state === "loading" ? (
        <div className="space-y-2 px-3.5 py-3">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-secondary" />
          <p className="pt-1 text-[11px] text-muted-foreground">正在检索文献（NCBI / Europe PMC）…</p>
        </div>
      ) : card?.status === "ok" ? (
        <div className="px-3.5 py-3">
          <p className="text-[13px] font-semibold leading-snug text-foreground">{card.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {[card.journal, card.year, card.pmid ? `PMID: ${card.pmid}` : null].filter(Boolean).join(" · ")}
          </p>
          {card.outline && card.outline.length > 0 ? (
            <div className="mt-2.5 space-y-2">
              {card.outline.slice(0, 8).map((s, i) => (
                <div key={i}>
                  <p className="font-display text-[11px] font-semibold tracking-wide text-helix">{s.section}</p>
                  <p className="mt-0.5 line-clamp-4 text-[12px] leading-relaxed text-foreground/85">{s.text}</p>
                </div>
              ))}
            </div>
          ) : null}
          {card.urls ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
              {card.urls.pubmed ? (
                <a
                  href={card.urls.pubmed}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-[11.5px] text-helix story-link"
                >
                  <ExternalLink size={11} /> PubMed
                </a>
              ) : null}
              {card.urls.doi ? (
                <a
                  href={card.urls.doi}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-[11.5px] text-helix story-link"
                >
                  <ExternalLink size={11} /> DOI 原文
                </a>
              ) : null}
              {card.urls.full_text ? (
                <a
                  href={card.urls.full_text}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-1 text-[11.5px] text-helix story-link"
                >
                  <FileText size={11} /> OA 全文
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-3.5 py-3">
          <p className="text-[12.5px] text-muted-foreground">未找到该编号直接关联的文献。</p>
          {card?.suggested_queries && card.suggested_queries.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {card.suggested_queries.slice(0, 3).map((q, i) => (
                <span key={i} className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {q}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground/70">可复制检索词到 PubMed 手动检索，或稍后再试。</p>
        </div>
      )}
    </div>
  );
}
