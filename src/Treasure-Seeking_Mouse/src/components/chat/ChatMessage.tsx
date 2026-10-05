// 单条聊天消息：用户右对齐气泡 / 助手左对齐 + Markdown + 工具轨迹 + 结果卡片 + 复制/重试
// v2.1/T2：接收 evidenceBus 请求，在本条消息下方渲染文献证据链卡片
import { useEffect, useState } from "react";
import { Check, Copy, RotateCcw, User } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Markdown } from "./Markdown";
import { ToolTrace, type LiveToolEvent } from "./ToolTrace";
import { DatasetCardGrid } from "./DatasetCard";
import { DownloadBoostCard } from "./DownloadBoostCard";
import { SuggestionBlock, extractFollowups } from "./SuggestionBlock";
import { LiteratureCardPanel } from "./LiteratureCard";
import { addEvidenceListener, type EvidenceRequest } from "@/lib/evidenceBus";
import { copyText } from "@/lib/clipboard";
import { useIsTouch } from "@/hooks/use-touch";
import { useI18n } from "@/i18n/provider";
import type { DatasetCard, ToolLog } from "@/services/seqoutChat";

/**
 * 操作按钮组的显隐类：桌面端悬停/聚焦浮现，触摸端常显
 * （触屏无 hover，若沿用悬停显隐会导致复制/重发按钮永久不可见）
 */
const REVEAL_ON_HOVER = "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100";
const ALWAYS_SHOWN = "opacity-100 transition-opacity duration-150";

export interface ChatUIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: DatasetCard[] | null;
  toolLogs?: ToolLog[] | null;
  /** 本轮调用过下载链接工具 → 推送 polariseq「下载加速」卡片；accession 为 null 表示未解析到 BioProject 编号 */
  boost?: { accession: string | null } | null;
  streaming?: boolean;
  liveTools?: LiveToolEvent[];
  error?: string | null;
}

interface MsgActions {
  onCopy?: () => void;
  onRetry?: () => void;
  copied?: boolean;
}

function ActionButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** 悬停浮现的操作按钮组（复制成功 2s 内保持勾选态） */
function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  function copy(text: string): void {
    void copyText(text).then((ok) => {
      if (!ok) return; // 两种通道都失败就不显示"已复制"，避免假成功
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return [copied, copy];
}

export function ChatMessage({
  msg,
  onRegenerate,
  onPickSuggestion,
  linkHint = false,
}: {
  msg: ChatUIMessage;
  onRegenerate?: (id: string) => void;
  onPickSuggestion?: (q: string) => void;
  /** 本消息是否参与「任务感叹号」抽签（仅最后一条定稿的助手消息应为 true，历史消息不参与） */
  linkHint?: boolean;
}): React.ReactElement {
  const { t } = useI18n();
  const [copied, copy] = useCopy();
  const isTouch = useIsTouch();
  // T2：本条消息挂载的文献证据链请求（来自正文 IdLink 或 DatasetCard 的文献入口）
  const [evidence, setEvidence] = useState<EvidenceRequest | null>(null);
  useEffect(() => {
    // 多播监听：只认领 hostMessageId 是本条消息的请求
    return addEvidenceListener((req) => {
      if (req.hostMessageId === msg.id) setEvidence(req);
    });
  }, [msg.id]);

  if (msg.role === "user") {
    return (
      <div className="group flex items-center justify-end gap-1.5">
        <div className={`flex items-center gap-0.5 ${isTouch ? ALWAYS_SHOWN : REVEAL_ON_HOVER}`}>
          <ActionButton label={copied ? t("msg.copied") : t("msg.copyQuestion")} onClick={() => copy(msg.content)}>
            {copied ? <Check size={13} className="text-helix" /> : <Copy size={13} />}
          </ActionButton>
        </div>
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-4 py-2.5 text-[14px] leading-relaxed text-primary-foreground shadow-soft whitespace-pre-wrap break-words">
          {msg.content}
        </div>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
          <User size={14} />
        </span>
      </div>
    );
  }

  const hasBody = msg.content.length > 0 || msg.streaming;
  const { main, items } = extractFollowups(msg.content);
  const showActions = !msg.streaming && msg.content.length > 0;
  return (
    <div className="group flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-helix-soft text-helix ring-1 ring-helix/20">
        <BrandMark size={15} />
      </span>
      <div className="min-w-0 max-w-[92%] flex-1">
        <p className="mb-1 flex items-baseline gap-2 text-[11px] text-muted-foreground/80">
          <span className="font-display font-semibold tracking-wide text-foreground/70">{t("brand.name")}</span>
          {msg.toolLogs && msg.toolLogs.length > 0 && !msg.streaming ? (
            <span className="font-mono opacity-70">
              {t("msg.searches", { n: msg.toolLogs.length, ms: msg.toolLogs.reduce((a, l) => a + (l.ms ?? 0), 0) })}
            </span>
          ) : null}
        </p>
        {(msg.toolLogs?.length ?? 0) > 0 || (msg.liveTools?.length ?? 0) > 0 ? (
          <ToolTrace logs={msg.toolLogs ?? []} live={msg.liveTools} />
        ) : null}
        {hasBody ? (
          <div className="rounded-xl rounded-tl-sm border border-border bg-card px-4 py-3 shadow-soft">
            {main ? <Markdown text={main} hostMessageId={msg.id} allowLinkHint={linkHint && !msg.streaming} /> : null}
            {!msg.content && msg.streaming ? (
              <span className="text-[13px] text-muted-foreground">{t("msg.thinking")}</span>
            ) : null}
            {msg.streaming && msg.content ? (
              <span className="typing-caret inline-block" aria-hidden />
            ) : null}
          </div>
        ) : null}
        {!msg.streaming && msg.cards && msg.cards.length > 0 ? (
          <DatasetCardGrid cards={msg.cards} hostMessageId={msg.id} />
        ) : null}
        {!msg.streaming && msg.boost ? <DownloadBoostCard accession={msg.boost.accession} /> : null}
        {evidence ? (
          <LiteratureCardPanel kind={evidence.kind} id={evidence.id} onClose={() => setEvidence(null)} />
        ) : null}
        {!msg.streaming && items.length > 0 ? <SuggestionBlock items={items} onPick={onPickSuggestion} /> : null}
        {msg.error ? (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {msg.error}
          </p>
        ) : null}
        {showActions ? (
          <div className={`mt-1.5 flex items-center gap-0.5 ${isTouch ? ALWAYS_SHOWN : REVEAL_ON_HOVER}`}>
            <ActionButton label={copied ? t("msg.copied") : t("msg.copyAnswer")} onClick={() => copy(main)}>
              {copied ? <Check size={13} className="text-helix" /> : <Copy size={13} />}
            </ActionButton>
            {onRegenerate ? (
              <ActionButton label={t("msg.regenerate")} onClick={() => onRegenerate(msg.id)}>
                <RotateCcw size={13} />
              </ActionButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
