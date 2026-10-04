// v2.1 正文内嵌编号链接：L1 直达原始页 + L2 hover 300ms 浮层（复制 ID / 查看证据链）
// 查看证据链经 evidenceBus 抛给消息列表层（T2 文献联动）；浮层摘要来自消息卡片元数据
import { useState } from "react";
import { BookOpen, Copy, Check, ExternalLink } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { LINK_TYPE_LABEL, type IdMatch } from "@/lib/linkify";
import { requestEvidence } from "@/lib/evidenceBus";

export function IdLink({
  match,
  summary,
  hostMessageId,
}: {
  match: IdMatch;
  /** 消息卡片里带的摘要（hover 浮层展示用，无则省略） */
  summary?: string;
  /** 宿主消息 id：文献卡片渲染在该消息下方 */
  hostMessageId?: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  function copyId(): void {
    void navigator.clipboard
      ?.writeText(match.id)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  function showEvidence(): void {
    requestEvidence({ kind: match.type, id: match.type === "pubmed" ? match.id : match.id, match, hostMessageId });
  }

  return (
    <HoverCard openDelay={300} closeDelay={120}>
      <HoverCardTrigger asChild>
        <a
          href={match.url}
          target="_blank"
          rel="noreferrer noopener"
          className="id-link font-mono font-medium text-helix"
          title={LINK_TYPE_LABEL[match.type]}
        >
          {match.id}
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-display font-semibold text-foreground/70">{LINK_TYPE_LABEL[match.type]}</span>
            <span className="mx-1">·</span>
            <span className="font-mono">{match.id}</span>
          </p>
          {summary ? (
            <p className="line-clamp-4 text-[12px] leading-relaxed text-foreground/85">{summary}</p>
          ) : null}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={copyId}
              className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-secondary-foreground transition-colors hover:bg-accent"
            >
              {copied ? <Check size={11} className="text-helix" /> : <Copy size={11} />}
              {copied ? "已复制" : "复制 ID"}
            </button>
            <button
              type="button"
              onClick={showEvidence}
              className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-secondary-foreground transition-colors hover:bg-accent"
            >
              <BookOpen size={11} />
              查看证据链
            </button>
            <a
              href={match.url}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-helix"
            >
              <ExternalLink size={11} />
              原始页
            </a>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}