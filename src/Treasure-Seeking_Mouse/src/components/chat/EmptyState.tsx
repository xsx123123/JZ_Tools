// 新会话空态：寻宝主题引导 + 按意图分组的示例提问（探矿任务牌 Pill 式排版）
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

/** 分组序号对应的主题 emoji（与「探矿定位 / 验宝鉴宝 / 清点矿藏」一一对应） */
const GROUP_EMOJI = ["⛏️", "💎", "📜"] as const;

export function EmptyState({ onPick }: { onPick: (q: string) => void }): React.ReactElement {
  const { t, lang } = useI18n();
  // 挂载时或语言切换时每组随机抽样一次；本次空态内保持稳定，重新进入会话再换一批
  const picked = useMemo<ExampleGroup[]>(
    () => exampleGroups(lang).map((g) => ({ ...g, items: sample(g.items, g.show) })),
    [lang],
  );
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8">
      {/* 英雄区（头像+标语+介绍）固定不动；只有示例任务清单在内部滚动 */}
      <div className="flex min-h-0 w-full max-w-[780px] flex-col items-center">
        <div className="hero-card reveal reveal-zoom w-full px-5 pb-6 pt-7 sm:px-8">
          <div className="flex flex-col items-center">
            <div className="gold-glow flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-pet-gold-soft ring-1 ring-pet-amber/30">
              <img
                src={mouseBase}
                alt={t("pet.alt")}
                draggable={false}
                className="h-full w-full scale-[1.18] object-contain drop-shadow-sm"
              />
            </div>
            <h1 className="reveal font-display mt-4 text-center text-[24px] font-bold tracking-tight text-foreground" data-reveal-delay="80">
              {lang === "zh" ? (
                <>
                  <span className="text-miner-green">GEO寻宝</span>
                  <span className="text-gold">鼠</span>
                  <span className="text-foreground"> · 你的同门生信探险搭子</span>
                </>
              ) : (
                <>
                  <span className="text-miner-green">GEO Treasure</span>
                  <span className="text-gold"> Mouse</span>
                  <span className="text-foreground"> · your lab-mate for bio-discovery</span>
                </>
              )}
            </h1>
            <p className="reveal mt-2 max-w-lg text-center text-[14px] leading-relaxed text-muted-foreground" data-reveal-delay="140">
              {t("empty.subHeadline")}
            </p>
            <p className="reveal mt-4 w-full rounded-xl bg-secondary p-4 text-center text-[13.5px] leading-relaxed text-muted-foreground" data-reveal-delay="200">
              {t("empty.intro")}
            </p>
          </div>
        </div>

        {/* 探矿任务看板 */}
        <div className="reveal mt-7 w-full min-h-0 flex-1 space-y-7 overflow-y-auto pb-2" data-reveal-delay="280">
          {picked.map((g, gi) => (
            <section key={g.label}>
              <GroupHeader label={g.label} caption={g.caption} index={String(gi + 1).padStart(2, "0")} emoji={GROUP_EMOJI[gi] ?? "⛏️"} />
              <ul className="mt-2 flex flex-col gap-2">
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

function GroupHeader({ label, caption, index, emoji }: { label: string; caption: string; index: string; emoji: string }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="font-display text-[15px] font-semibold text-miner-green">{index}</span>
      <span className="text-[13px] font-semibold tracking-wide text-foreground">
        {label} <span aria-hidden>{emoji}</span>
      </span>
      {/* 胶囊小标签：探矿定位=浅绿、验宝鉴宝/清点矿藏=浅琥珀 */}
      <span className="rounded-full bg-miner-green-light px-2 py-0.5 text-[11px] text-miner-green-hover">
        {label}
      </span>
    </div>
  );
}

function ExampleRow({ q, onPick }: { q: string; onPick: (q: string) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onPick(q)}
      className="quest-pill group flex w-full items-center gap-2 text-left"
    >
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/85 transition-colors group-hover:text-gold-hover">
        {q}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        ⛏
      </span>
    </button>
  );
}
