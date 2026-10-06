// 新会话空态：寻宝主题引导 + 按意图分组的示例提问
// 布局参考 docs/2026-10-06_21.23.22.png：左侧头像的英雄卡（右上「休息中」徽章）+ 分组任务牌（编号 + 适合胶囊 + 琥珀点 chips）
// 每次进入空态从示例池随机抽样展示（useMemo 一次抽定，本次空态内保持稳定不闪动）
// 示例池按语言分组，切语言时重新抽样（useMemo 依赖 lang）
import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { exampleGroups, type ExampleGroup } from "@/i18n";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import mouseBase from "@/assets/pet/mouse-base.webp";
import mouseWink from "@/assets/pet/mouse-wink.webp";

/** 连点次数窗口：相邻两次点击超过该间隔则重新计数 */
const EGG_WINDOW_MS = 1500;

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

/** 分组「适合」胶囊的配色：探矿定位=浅绿、验宝鉴宝=浅琥珀、清点矿藏=中性灰 */
const FIT_TINT = [
  "bg-miner-green-light text-miner-green-hover",
  "bg-gold-light text-gold-hover",
  "bg-secondary text-muted-foreground",
] as const;

export function EmptyState({ onPick }: { onPick: (q: string) => void }): React.ReactElement {
  const { t, lang } = useI18n();
  // 挂载时或语言切换时每组随机抽样一次；本次空态内保持稳定，重新进入会话再换一批
  const picked = useMemo<ExampleGroup[]>(
    () => exampleGroups(lang).map((g) => ({ ...g, items: sample(g.items, g.show) })),
    [lang],
  );

  // 彩蛋：连点头像 3 次弹出「鼠鼠我呀」弹窗（与右下角桌宠的连戳彩蛋相互独立）
  const [eggOpen, setEggOpen] = useState(false);
  const [bounceKey, setBounceKey] = useState(0);
  const eggClicksRef = useRef({ count: 0, last: 0 });
  const handleAvatarClick = (): void => {
    const now = Date.now();
    const c = eggClicksRef.current;
    c.count = now - c.last <= EGG_WINDOW_MS ? c.count + 1 : 1;
    c.last = now;
    setBounceKey((k) => k + 1); // 每次点击都回弹一下，给连点节奏反馈
    if (c.count >= 3) {
      c.count = 0;
      setEggOpen(true);
    }
  };
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8">
      {/* 英雄区（头像+标语+介绍）固定不动；只有示例任务清单在内部滚动 */}
      <div className="flex min-h-0 w-full max-w-[860px] flex-col items-center">
        <div className="hero-card reveal reveal-zoom relative w-full px-5 pb-6 pt-7 sm:px-8">
          {/* 状态徽章：冷启动时阿寻在休息 */}
          <span className="absolute right-4 top-4 rounded-full border border-pet-amber/40 bg-pet-gold-soft px-2.5 py-0.5 text-[11px] text-pet-amber-deep sm:right-6 sm:top-5">
            {t("empty.badgeIdle")}
          </span>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleAvatarClick}
              title={t("easterEgg.hint")}
              aria-label={t("easterEgg.hint")}
              className="gold-glow flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[24px] bg-pet-gold-soft ring-1 ring-pet-amber/30 transition-transform active:scale-95"
            >
              <img
                key={bounceKey}
                src={mouseBase}
                alt={t("pet.alt")}
                draggable={false}
                className="pet-hover-bounce h-full w-full scale-[1.18] object-contain drop-shadow-sm"
              />
            </button>
            <div className="min-w-0">
              <h1 className="reveal font-display text-[22px] font-bold tracking-tight text-foreground sm:text-[24px]" data-reveal-delay="80">
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
              <p className="reveal mt-2 text-[14px] leading-relaxed text-muted-foreground" data-reveal-delay="140">
                {t("empty.subHeadline")}
              </p>
            </div>
          </div>
          <p className="reveal mt-5 w-full rounded-xl bg-secondary p-4 text-left text-[13.5px] leading-relaxed text-muted-foreground" data-reveal-delay="200">
            {t("empty.intro")}
          </p>
        </div>

        {/* 探矿任务看板 */}
        <div className="reveal mt-7 w-full min-h-0 flex-1 space-y-7 overflow-y-auto pb-2" data-reveal-delay="280">
          {picked.map((g, gi) => (
            <section key={g.label}>
              <GroupHeader
                label={g.label}
                fit={t("empty.groupFit", { caption: g.caption })}
                index={String(gi + 1).padStart(2, "0")}
                emoji={GROUP_EMOJI[gi] ?? "⛏️"}
                tint={FIT_TINT[gi] ?? FIT_TINT[0]}
              />
              <ul className="mt-3 flex flex-wrap gap-2">
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

      {/* 彩蛋弹窗：鼠鼠我呀 */}
      <Dialog open={eggOpen} onOpenChange={setEggOpen}>
        <DialogContent className="border-border bg-card text-foreground shadow-soft-lg sm:max-w-[380px]">
          <div className="flex flex-col items-center px-2 pb-1 pt-2 text-center">
            <div className="gold-glow flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] bg-pet-gold-soft ring-1 ring-pet-amber/30">
              <img
                src={mouseWink}
                alt={t("pet.alt")}
                draggable={false}
                className="pet-reveal h-full w-full scale-[1.18] object-contain drop-shadow-sm"
              />
            </div>
            <DialogTitle className="font-display mt-4 text-[20px] font-bold tracking-tight">
              {lang === "zh" ? (
                <>
                  <span className="text-miner-green">鼠鼠</span>
                  <span className="text-gold">我呀</span>
                </>
              ) : (
                t("easterEgg.title")
              )}
            </DialogTitle>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{t("easterEgg.body")}</p>
            <button
              type="button"
              onClick={() => setEggOpen(false)}
              className="mt-5 h-10 w-full rounded-lg bg-helix text-[14px] font-medium text-primary-foreground transition-colors hover:bg-miner-green-hover active:scale-[0.98]"
            >
              {t("easterEgg.close")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupHeader({ label, fit, index, emoji, tint }: { label: string; fit: string; index: string; emoji: string; tint: string }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 编号牌 */}
      <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold text-miner-green">
        {index}
      </span>
      <span className="text-[13px] font-semibold tracking-wide text-foreground">
        {label} <span aria-hidden>{emoji}</span>
      </span>
      {/* 胶囊小标签：说明这一组适合什么时候用 */}
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${tint}`}>{fit}</span>
    </div>
  );
}

function ExampleRow({ q, onPick }: { q: string; onPick: (q: string) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onPick(q)}
      className="quest-pill group flex w-fit items-center gap-2 text-left"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-gold" aria-hidden />
      <span className="min-w-0 text-[13px] leading-snug text-foreground/85 transition-colors group-hover:text-gold-hover">
        {q}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        ⛏
      </span>
    </button>
  );
}
