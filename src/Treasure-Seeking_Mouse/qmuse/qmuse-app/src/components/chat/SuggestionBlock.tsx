// 「继续寻宝」建议块：默认折叠，展开后逐条可点击直接发送
import { useState } from "react";
import { ChevronDown, Compass } from "lucide-react";

export interface SuggestionItem {
  text: string;
}

/** 从模型回复中解析 :::followup 围栏（容错：允许列表/加粗前缀） */
export function extractFollowups(content: string): { main: string; items: string[] } {
  const m = content.match(/:::followup\s*\n([\s\S]*?)\n\s*:::/);
  if (!m) return { main: content, items: [] };
  const items = m[1]
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、])\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
  const main = (content.slice(0, m.index) + content.slice((m.index ?? 0) + m[0].length)).trimEnd();
  return { main, items };
}

export function SuggestionBlock({ items, onPick }: { items: string[]; onPick?: (q: string) => void }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="card-in mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/60"
      >
        <Compass size={13} className="shrink-0 text-helix" />
        <span className="text-[12.5px] font-medium text-foreground/80">阿寻的下一铲建议</span>
        <span className="rounded-full bg-helix-soft px-1.5 py-px font-mono text-[10px] text-helix">{items.length}</span>
        <ChevronDown size={14} className={`ml-auto shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul className="border-t border-border/70 px-1.5 py-1.5">
          {items.map((q, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(q)}
                className="flex w-full items-baseline gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:bg-helix-soft hover:text-helix disabled:pointer-events-none"
              >
                <span className="font-mono text-[11px] font-semibold text-pet-amber-deep">{i + 1}</span>
                <span className="min-w-0 flex-1">{q}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
