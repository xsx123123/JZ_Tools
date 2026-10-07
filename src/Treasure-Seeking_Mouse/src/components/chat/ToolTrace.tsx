// 工具执行轨迹：紧凑展示 Edge Function 内 seqout 工具调用过程
import { Check, Loader2, X } from "lucide-react";
import type { ToolLog } from "@/services/seqoutChat";
import { useI18n } from "@/i18n/provider";
import { toolLabel } from "@/i18n";
import { litSourceLabel } from "./DatasetCard";

export interface LiveToolEvent {
  name: string;
  label: string;
  status: "running" | "done" | "error";
  ms?: number;
}

function statusIcon(status: "running" | "done" | "error"): React.ReactNode {
  if (status === "running") return <Loader2 size={12} className="animate-spin text-helix" />;
  if (status === "done") return <Check size={12} className="text-helix" />;
  return <X size={12} className="text-destructive" />;
}

export function ToolTrace({
  logs,
  live,
  /** literature_search 完成后按来源拆分的命中数（来源 → 卡片数），无则保持单徽章 */
  litSources,
}: {
  logs: ToolLog[];
  live?: LiveToolEvent[];
  litSources?: [string, number][];
}): React.ReactElement | null {
  const { lang } = useI18n();
  const items: LiveToolEvent[] =
    live && live.length > 0 ? live : logs.map((l) => ({ name: l.name, label: l.label, status: l.ok ? "done" : "error", ms: l.ms }));
  if (items.length === 0) return null;

  // 文献检索完成后用一枚汇总标记承载来源分布，避免九个来源胶囊挤成一串。
  function renderItem(it: LiveToolEvent, i: number): React.ReactNode {
    const split = it.name === "literature_search" && it.status !== "running" && litSources && litSources.length > 0;
    const isLiterature = it.name === "literature_search";
    if (!split) {
      return (
        <span
          key={`${it.name}-${i}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none ${
            it.status === "running"
              ? "scan-line border-helix/30 bg-helix-soft text-helix"
              : it.status === "error"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-border bg-card text-muted-foreground shadow-sm"
          }`}
        >
          {statusIcon(it.status)}
          {isLiterature ? (lang === "zh" ? "文献检索" : "Literature search") : toolLabel(lang, it.name, it.label)}
          {it.status !== "running" && typeof it.ms === "number" ? (
            <span className="opacity-60">{it.ms}ms</span>
          ) : null}
        </span>
      );
    }
    const total = litSources!.reduce((sum, [, count]) => sum + count, 0);
    const sourceSummary = litSources!.map(([source, count]) => `${litSourceLabel(source)} ${count}`).join(" · ");
    return (
      <span
        key={`${it.name}-${i}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-helix/25 bg-helix-soft/55 px-2.5 py-1 font-mono text-[11px] leading-none text-helix"
        title={sourceSummary}
        aria-label={sourceSummary}
      >
        {statusIcon("done")}
        <span className="font-sans font-medium">{lang === "zh" ? "文献检索" : "Literature search"}</span>
        <span className="text-helix/75">{litSources!.length} {lang === "zh" ? "个来源" : "sources"}</span>
        <span className="text-helix/75">{total} {lang === "zh" ? "篇" : "results"}</span>
        {typeof it.ms === "number" ? <span className="text-helix/60">{it.ms}ms</span> : null}
      </span>
    );
  }

  return <div className="mb-2 flex flex-wrap gap-1.5">{items.map((it, i) => renderItem(it, i))}</div>;
}
