// v2.1 正文内嵌编号链接：L1 直达原始页 + L2 浮层（自动预取论文 + 复制 ID / 查看证据链）
// 桌面端 hover 300ms 出浮层（HoverCard）；触摸端点击出浮层（Popover）——触屏无 hover，
// HoverCard 在触屏上点击会直接跳转、浮层永不出现，故按输入设备自动切换容器，浮层内容完全共用。
// 浮层打开时经 T2 fetchLiterature 自动拉论文元数据（前端 TTL 缓存，反复 hover 不重复请求）；
// 「查看证据链」经 evidenceBus 抛给消息列表层，渲染完整文献卡片
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { BookOpen, Copy, Check, ExternalLink } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { linkTypeLabel, type IdMatch } from "@/lib/linkify";
import { requestEvidence } from "@/lib/evidenceBus";
import { consumeIdLinkHint } from "@/lib/linkHint";
import { fireTreasureBurst } from "@/lib/treasureBurst";
import { AllowLinkHintContext } from "@/components/chat/Markdown";
import { copyText } from "@/lib/clipboard";
import { useIsTouch } from "@/hooks/use-touch";
import { useI18n } from "@/i18n/provider";
import { fetchLiterature, type LiteratureCardDTO } from "@/services/literature";

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
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const isTouch = useIsTouch();
  // 新用户发现性提示：全站只展示一次（见 lib/linkHint）。消费必须走 effect 且受 AllowLinkHintContext
  // 门控——流式期间 Markdown 树反复重建会卸载重建本组件，useState 初始器会把提示「吃掉」（闪一下就没了）。
  const allowHint = useContext(AllowLinkHintContext);
  const [hintOn, setHintOn] = useState(false);
  useEffect(() => {
    if (!allowHint || hintOn) return;
    setHintOn(consumeIdLinkHint());
  }, [allowHint, hintOn]);
  useEffect(() => {
    if (!hintOn) return;
    const id = setTimeout(() => setHintOn(false), 6000);
    return () => clearTimeout(id);
  }, [hintOn]);
  // 浮层自动预取的论文元数据（loading 骨架 → 标题/期刊/年份；not_found 显示提示）
  const [lit, setLit] = useState<LiteratureCardDTO | null>(null);
  const [litState, setLitState] = useState<"idle" | "loading" | "done">("idle");
  // 「顺着提示来挖」标记：打开浮层时若提示气泡还在，记为首次发现之旅——
  // 这次真挖到文献就全屏烟花庆祝（fireTreasureBurst 本身每浏览器只放一次）
  const hintedRef = useRef(false);

  const loadLiterature = useCallback(() => {
    if (litState !== "idle") return; // 已加载/加载中不重复请求
    setLitState("loading");
    void fetchLiterature(match.type, match.id).then((card) => {
      setLit(card);
      setLitState("done");
      if (card.status === "ok" && hintedRef.current) {
        hintedRef.current = false;
        fireTreasureBurst();
      }
    });
  }, [litState, match.type, match.id]);

  // 打开浮层：关闭提示气泡；若气泡本就在展示，标记这次为「首次发现」
  const onLayerOpen = (open: boolean) => {
    if (!open) return;
    loadLiterature();
    if (hintOn) {
      hintedRef.current = true;
      setHintOn(false);
    }
  };

  function copyId(): void {
    void copyText(match.id).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function showEvidence(): void {
    requestEvidence({ kind: match.type, id: match.id, match, hostMessageId });
  }

  const litTitle = lit?.status === "ok" ? lit.title : null;
  const litMeta = lit?.status === "ok"
    ? [lit.journal, lit.year].filter(Boolean).join(" · ")
    : null;

  const trigger = (
    <span className="relative inline-block">
      <a
        href={match.url}
        target="_blank"
        rel="noreferrer noopener"
        className={`id-link font-mono font-medium text-helix${hintOn ? " id-link--hint" : ""}`}
        title={linkTypeLabel(lang, match.type)}
        // 触摸端：拦截默认跳转，改为打开浮层（跳转交给浮层内的「原始页」按钮）
        onClick={(e) => {
          if (isTouch) e.preventDefault();
        }}
      >
        {match.id}
      </a>
      {hintOn ? <span className="id-link-hint-bubble">{t("idlink.hint")}</span> : null}
    </span>
  );

  const content = (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        <span className="font-display font-semibold text-foreground/70">{linkTypeLabel(lang, match.type)}</span>
        <span className="mx-1">·</span>
        <span className="font-mono">{match.id}</span>
      </p>
      {/* 自动预取的论文信息：loading 骨架 → 标题/期刊；查不到显示轻提示 */}
      {litState === "loading" ? (
        <div className="space-y-1.5 py-0.5" aria-label={t("idlink.fetching")}>
          <div className="h-3 w-4/5 animate-pulse rounded bg-secondary" />
          <div className="h-2.5 w-2/5 animate-pulse rounded bg-secondary" />
        </div>
      ) : litTitle ? (
        <div>
          <p className="line-clamp-3 text-[12px] font-medium leading-relaxed text-foreground/90">{litTitle}</p>
          {litMeta ? <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{litMeta}</p> : null}
        </div>
      ) : litState === "done" ? (
        <p className="text-[11px] text-muted-foreground/70">{t("idlink.noPaper")}</p>
      ) : null}
      {summary && !litTitle ? (
        <p className="line-clamp-4 text-[12px] leading-relaxed text-foreground/85">{summary}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={copyId}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-secondary-foreground transition-colors hover:bg-accent"
        >
          {copied ? <Check size={11} className="text-helix" /> : <Copy size={11} />}
          {copied ? t("idlink.copied") : t("idlink.copyId")}
        </button>
        <button
          type="button"
          onClick={showEvidence}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-secondary-foreground transition-colors hover:bg-accent"
        >
          <BookOpen size={11} />
          {t("idlink.viewEvidence")}
        </button>
        <a
          href={match.url}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-helix"
        >
          <ExternalLink size={11} />
          {t("idlink.original")}
        </a>
      </div>
    </div>
  );

  // 触摸端：点击触发（Popover）；桌面端：悬停触发（HoverCard）。打开浮层时同时关掉提示。
  if (isTouch) {
    return (
      <Popover onOpenChange={onLayerOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-80" side="top">
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard openDelay={300} closeDelay={120} onOpenChange={onLayerOpen}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        {content}
      </HoverCardContent>
    </HoverCard>
  );
}
