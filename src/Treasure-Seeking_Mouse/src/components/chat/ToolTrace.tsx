// 工具执行轨迹：紧凑展示 Edge Function 内 seqout 工具调用过程
import { Check, Loader2, X } from "lucide-react";
import type { ToolLog } from "@/services/seqoutChat";
import { useI18n } from "@/i18n/provider";
import { toolLabel } from "@/i18n";

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
}: {
  logs: ToolLog[];
  live?: LiveToolEvent[];
}): React.ReactElement | null {
  const { lang } = useI18n();
  const items: LiveToolEvent[] =
    live && live.length > 0 ? live : logs.map((l) => ({ name: l.name, label: l.label, status: l.ok ? "done" : "error", ms: l.ms }));
  if (items.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {items.map((it, i) => (
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
          {toolLabel(lang, it.name, it.label)}
          {it.status !== "running" && typeof it.ms === "number" ? (
            <span className="opacity-60">{it.ms}ms</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
