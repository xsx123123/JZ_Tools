// 新会话空态：寻宝主题引导 + 按意图分组的示例提问（藏宝任务板式排版）
// 每次进入空态从示例池随机抽样展示（useMemo 一次抽定，本次空态内保持稳定不闪动）
// 示例池按语言分组，切语言时重新抽样（useMemo 依赖 lang）
import { useMemo } from "react";
import { useI18n } from "@/i18n/provider";
import { exampleGroups, type ExampleGroup } from "@/i18n";
import mouseBase from "@/assets/pet/mouse-base.webp";

/** Fisher-Yates 洗牌后取前 n 条（不改动原数组） */
function sample<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const take = Math.min(n, pool.length);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

export function EmptyState({ onPick }: { onPick: (q: string) => void }): React.ReactElement {
  const { t, lang } = useI18n();
  // 挂载时或语言切换时每组随机抽样一次；本次空态内保持稳定，重新进入会话再换一批
  const picked = useMemo<ExampleGroup[]>(
    () => exampleGroups(lang).map((g) => ({ ...g, items: sample(g.items, g.show) })),
    [lang],
  );
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      {/* 英雄区（图标+标题+简介）固定不动；只有示例任务清单在内部滚动 */}
      <div className="flex min-h-0 w-full max-w-2xl flex-col items-center">
        <div className="reveal reveal-zoom gold-glow flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-pet-gold-soft ring-1 ring-pet-amber/30">
          <img
            src={mouseBase}
            alt={t("pet.alt")}
            draggable={false}
            className="h-full w-full scale-[1.18] object-contain drop-shadow-sm"
          />
        </div>
        <h2 className="reveal font-display mt-5 text-[26px] font-semibold tracking-tight text-foreground" data-reveal-delay="80">
          {lang === "zh" ? (
            <>GEO<span className="text-pet-amber-deep">寻宝鼠</span></>
          ) : (
            <>Geo<span className="text-pet-amber-deep">Muse</span></>
          )}
        </h2>
        <p className="reveal mt-2 max-w-lg text-center text-[13.5px] leading-relaxed text-muted-foreground" data-reveal-delay="160">
          {t("empty.intro")}
        </p>

        <div className="reveal mt-9 w-full min-h-0 flex-1 space-y-7 overflow-y-auto pb-2" data-reveal-delay="240">
          {picked.map((g, gi) => (
            <section key={g.label}>
              <GroupHeader label={g.label} caption={g.caption} index={String(gi + 1).padStart(2, "0")} />
              <ul className="mt-1 divide-y divide-border/70 border-y border-border/70">
                {g.items.map((q) => (
                  <li key={q}>
                    <ExampleRow q={q} onPick={onPick} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ label, caption, index }: { label: string; caption: string; index: string }): React.ReactElement {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="font-display text-[15px] font-semibold text-helix">{index}</span>
      <span className="text-[13px] font-semibold tracking-wide text-foreground">{label}</span>
      <span className="truncate text-[11px] text-muted-foreground/80">{caption}</span>
    </div>
  );
}

function ExampleRow({ q, onPick }: { q: string; onPick: (q: string) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onPick(q)}
      className="group flex w-full items-center gap-2 py-2.5 pl-1 pr-2 text-left transition-colors hover:bg-accent/60"
    >
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/85 transition-colors group-hover:text-helix">
        {q}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        ↵
      </span>
    </button>
  );
}
