// 寻宝鼠「阿寻」：积木风桌宠。多造型切换 + 挖宝小剧场（土堆/尘土/宝石入袋）+
// 连击转圈、爱心飘浮、闲置散步张望、宝箱累计计数、里程碑成就庆祝，可拖拽、右键静默。
import { useCallback, useEffect, useRef, useState } from "react";
import { readPetPos, writePetPos, readPetQuiet, writePetQuiet, bumpPokeCount, readTreasureCount, addTreasure, ACHIEVEMENTS, claimAchievement, earnedAchievements, type Achievement, type PetPos } from "@/services/petStore";
import IMG_BASE from "@/assets/pet/mouse-base.webp";
import IMG_DIG from "@/assets/pet/mouse-dig.webp";
import IMG_CHEER from "@/assets/pet/mouse-cheer.webp";
import IMG_CHEST from "@/assets/pet/chest.webp";

type PetState = "idle" | "digging" | "reveal" | "stow" | "miss" | "poke" | "spin" | "walk" | "look" | "celebrate";

/** 外部流式事件 → 宠物动作 */
export type PetEvent =
  | { type: "tool_start"; seq: number }
  | { type: "cards"; count: number; seq: number }
  | { type: "done"; cards: number; seq: number }
  | { type: "error"; seq: number };

let petSeq = 0;
/** 发送方调用：产生带唯一序号的事件，保证同类事件连续触发也能被消费 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export function makePetEvent(e: DistributiveOmit<PetEvent, "seq">): PetEvent {
  return { ...e, seq: ++petSeq } as PetEvent;
}

const IDLE_LINES = ["这片土里有单细胞的味道…", "今天也来挖 GSE 吧！", "嗅到了高分文献的气息", "我的铲子呢…哦在背包里", "宝藏藏在第三铲之后"];
const DIG_LINES = ["挖挖挖…", "GEO? SRA?", "这块土有点硬", "快出来了快出来了", "阿寻挖矿中，请勿投喂"];
const POKE_LINES = ["吱!", "别戳啦~", "背包里掉出一张 GSM 卡片", "给你看我的宝贝收藏", "再戳就咬你哦（轻轻）"];
const SPIN_LINES = ["转圈圈！宝藏多多！", "被爱了吱吱吱", "嘿嘿，痒"];
const MISS_LINES = ["唉，只有石头…", "这铲土是空的", "一定是姿势不对，再试一次!"];
const WALK_LINES = ["去那边看看…", "闻着 RNA 的味儿就去了", "散步消食，顺便探矿"];
const TREASURE_LINES: [() => string, (n: number) => string] = [
  () => "宝藏还在路上，别急~",
  (n: number) => `本鼠已囤 ${n} 份宝藏，富甲一方！`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SIZE = 192; // 宠物宽（px），H5 下缩小
const MARGIN = 12;

function clampPos(p: PetPos): PetPos {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const size = w < 768 ? 144 : SIZE;
  return {
    x: Math.min(Math.max(MARGIN, p.x), w - size - MARGIN),
    y: Math.min(Math.max(MARGIN, p.y), h - size - 120),
  };
}

interface Heart {
  id: number;
  glyph: string;
  hx: string;
}
let heartId = 0;

interface Burst {
  id: number;
  mx: string;
  my: string;
  glyph: string;
}
let burstId = 0;

export function TreasureMouse({ event }: { event: PetEvent | null }): React.ReactElement {
  const [quiet, setQuiet] = useState<boolean>(() => readPetQuiet());
  const [pos, setPos] = useState<PetPos>(() => {
    const saved = readPetPos();
    if (saved) return clampPos(saved);
    return { x: window.innerWidth - SIZE - 24, y: 120 };
  });
  const [state, setState] = useState<PetState>("idle");
  const [bubble, setBubble] = useState<string | null>(null);
  const [gemCount, setGemCount] = useState<number | null>(null);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [treasure, setTreasure] = useState<number>(() => readTreasureCount());
  const [chestPopKey, setChestPopKey] = useState(0);
  const [earned, setEarned] = useState<Achievement[]>(() => earnedAchievements(readTreasureCount()));
  const [milestone, setMilestone] = useState<Achievement | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeq = useRef(0);
  const pokeStreak = useRef<{ n: number; at: number }>({ n: 0, at: 0 });
  const busyRef = useRef(false); // 有剧情在演时，闲置行为让路
  busyRef.current = state !== "idle";

  /** 临时状态：ms 后回 idle */
  const transient = useCallback((s: PetState, line: string | null, ms: number, onEnd?: () => void) => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
    setState(s);
    setBubble(line);
    stateTimer.current = setTimeout(() => {
      setState("idle");
      setBubble(null);
      onEnd?.();
    }, ms);
  }, []);

  const spawnHearts = useCallback((n: number) => {
    const batch: Heart[] = Array.from({ length: n }, (_, i) => ({
      id: ++heartId,
      glyph: pick(["✦", "♥", "◆"]),
      hx: `${-14 + i * 14 + Math.round(Math.random() * 6)}px`,
    }));
    setHearts((h) => [...h, ...batch]);
    setTimeout(() => setHearts((h) => h.filter((x) => !batch.includes(x))), 1000);
  }, []);

  /** 里程碑庆祝：举宝石跳圈 + 光环 + 星尘放射 + 横幅宣告（每档仅播一次） */
  const celebrate = useCallback((ach: Achievement) => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
    setMilestone(ach);
    setState("celebrate");
    setBubble(null);
    const batch: Burst[] = Array.from({ length: 8 }, (_, i) => {
      const ang = (i / 8) * Math.PI * 2;
      return {
        id: ++burstId,
        mx: `${Math.round(Math.cos(ang) * 44)}px`,
        my: `${Math.round(Math.sin(ang) * 40 - 8)}px`,
        glyph: pick(["✦", "✧", "◆", "★"]),
      };
    });
    setBursts(batch);
    stateTimer.current = setTimeout(() => {
      setState("idle");
      setMilestone(null);
      setBursts([]);
    }, 4300);
  }, []);

  /** cards/done 事件里累加宝藏后检测跨过的里程碑（同批只庆祝最高一档） */
  const checkMilestones = useCallback((total: number) => {
    const newly = ACHIEVEMENTS.filter((a) => total >= a.threshold && claimAchievement(a.threshold));
    if (newly.length > 0) {
      setEarned(earnedAchievements(total));
      celebrate(newly[newly.length - 1]);
      return true;
    }
    return false;
  }, [celebrate]);

  /** 出货小剧场：宝石飞入宝箱；若跨过成就里程碑则由庆祝演出接管。
   *  counted=true 表示本轮 cards 事件已累加过，done 只演动画不重复计数 */
  const countedRef = useRef(false);
  const revealStow = useCallback(
    (count: number, line: string, ms: number, counted: boolean): void => {
      if (!counted) {
        const total = addTreasure(count);
        setTreasure(total);
        setChestPopKey((k) => k + 1);
        if (checkMilestones(total)) return;
      }
      transient("reveal", line, ms, () => {
        setState("stow");
        stateTimer.current = setTimeout(() => {
          setState("idle");
          setBubble(null);
          setGemCount(null);
        }, 600);
      });
    },
    [checkMilestones, transient],
  );

  // 响应外部流式事件
  useEffect(() => {
    if (!event || quiet) return;
    if (event.seq <= lastSeq.current) return;
    lastSeq.current = event.seq;
    switch (event.type) {
      case "tool_start":
        setGemCount(null);
        countedRef.current = false;
        transient("digging", pick(DIG_LINES), 10_000); // 兜底超时回 idle；done/error 会提前打断
        break;
      case "cards": {
        setGemCount(event.count);
        countedRef.current = true;
        revealStow(event.count, `找到 ${event.count} 份数据!`, 1800, false);
        break;
      }
      case "done":
        if (event.cards > 0 && state !== "reveal" && state !== "stow" && state !== "celebrate") {
          setGemCount(event.cards);
          revealStow(event.cards, "这一铲，值了!", 1600, countedRef.current);
        } else if (event.cards === 0) {
          transient("miss", pick(MISS_LINES), 2400);
        }
        break;
      case "error":
        transient("miss", pick(MISS_LINES), 2400);
        break;
      default:
        break;
    }
  }, [event, quiet, transient, state, checkMilestones]);

  // 闲置剧场：冒泡 / 散步 / 张望
  useEffect(() => {
    if (quiet) return;
    idleTimer.current = setInterval(() => {
      if (busyRef.current) return;
      const r = Math.random();
      if (r < 0.3) {
        setBubble(pick(IDLE_LINES));
        setTimeout(() => setBubble((b) => (b && IDLE_LINES.includes(b) ? null : b)), 3200);
      } else if (r < 0.44) {
        // 溜达一小段
        const dir = Math.random() < 0.5 ? -1 : 1;
        setState("walk");
        setBubble(pick(WALK_LINES));
        const start = Date.now();
        const base = pos.x;
        const step = setInterval(() => {
          const t = (Date.now() - start) / 1600;
          if (t >= 1) {
            clearInterval(step);
            setState("idle");
            setBubble(null);
            writePetPos(pos);
            return;
          }
          setPos(clampPos({ x: base + dir * Math.sin(t * Math.PI) * 46, y: pos.y }));
        }, 50);
      } else if (r < 0.54) {
        transient("look", null, 3200);
      }
    }, 9000);
    return () => {
      if (idleTimer.current) clearInterval(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiet, pos.x, pos.y, transient]);

  useEffect(() => () => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
  }, []);

  function toggleQuiet(q: boolean): void {
    setQuiet(q);
    writePetQuiet(q);
    if (q) {
      setState("idle");
      setBubble(null);
    }
  }

  function handlePoke(): void {
    const now = Date.now();
    pokeStreak.current = now - pokeStreak.current.at < 1500 ? { n: pokeStreak.current.n + 1, at: now } : { n: 1, at: now };
    const n = bumpPokeCount();
    if (pokeStreak.current.n >= 3) {
      // 连击彩蛋：转圈 + 爱心雨 + 报宝藏库存
      pokeStreak.current = { n: 0, at: 0 };
      spawnHearts(5);
      const line = TREASURE_LINES[1](readTreasureCount());
      transient("spin", line, 1400);
      return;
    }
    spawnHearts(1);
    const line = n > 6 && pokeStreak.current.n === 1 ? "…吱…（已读不回）" : pick([...POKE_LINES, ...SPIN_LINES.slice(0, 1)]);
    transient("poke", line, 900);
  }

  function handleChestClick(): void {
    const total = readTreasureCount();
    const line = total > 0 ? `宝箱里已囤 ${total} 份宝藏，都是阿寻一铲一铲挖的！` : TREASURE_LINES[0]();
    transient("poke", line, 1800);
  }

  // Pointer 拖拽
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      setPos(clampPos({ x: d.origX + dx, y: d.origY - dy })); // y 是距底部距离
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d) return;
    if (d.moved) writePetPos(pos);
    else handlePoke();
  };

  if (quiet) {
    return (
      <button
        type="button"
        onClick={() => toggleQuiet(false)}
        title="唤回寻宝鼠"
        className="fixed bottom-4 right-4 z-30 flex h-9 w-9 items-end justify-center rounded-b-full border border-dashed border-helix/40 bg-helix-soft/60 pb-1 text-helix shadow-soft transition-transform hover:scale-110"
        aria-label="唤回寻宝鼠"
      >
        <span className="h-2 w-2 rounded-full bg-helix/50" />
      </button>
    );
  }

  const animCls =
    state === "digging" ? "pet-digging"
      : state === "reveal" ? "pet-reveal"
        : state === "stow" ? "pet-reveal"
          : state === "miss" ? "pet-miss"
            : state === "poke" ? "pet-poke"
              : state === "spin" ? "pet-spin"
                : state === "walk" ? "pet-walk"
                  : state === "look" ? "pet-look"
                    : state === "celebrate" ? "pet-celebrate" : "pet-idle";

  const imgSrc =
    state === "digging" || state === "walk" || state === "look" ? IMG_DIG
      : state === "reveal" || state === "stow" || state === "spin" || state === "celebrate" ? IMG_CHEER : IMG_BASE;

  return (
    <div
      role="img"
      aria-label="寻宝鼠阿寻"
      className="fixed z-30 select-none touch-none"
      style={{ left: pos.x, bottom: pos.y, width: 144 }}
    >
      {/* 气泡 */}
      {bubble ? (
        <div className="pet-bubble absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-border bg-card px-2.5 py-1 text-[11.5px] text-foreground shadow-soft">
          {bubble}
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-card" />
        </div>
      ) : null}

      {/* 飘浮爱心/星星 */}
      {hearts.map((h, i) => (
        <span key={h.id} className="pet-heart" style={{ ["--hx" as string]: h.hx, animationDelay: `${i * 0.08}s` }}>
          {h.glyph}
        </span>
      ))}

      {/* 里程碑星尘放射 + 光环 */}
      {state === "celebrate" ? (
        <>
          <span className="pet-halo" />
          {bursts.map((b) => (
            <span key={b.id} className="pet-burst" style={{ ["--mx" as string]: b.mx, ["--my" as string]: b.my }}>{b.glyph}</span>
          ))}
        </>
      ) : null}

      {/* 成就横幅 */}
      {milestone ? (
        <div className="pet-banner absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-pet-amber/60 bg-card px-3 py-1 text-[11px] font-semibold text-pet-amber-deep shadow-soft-lg">
          🏅 成就解锁 · {milestone.name}（{milestone.threshold} 份宝藏）
        </div>
      ) : null}

      {/* 主体（可拖/可点） */}
      <div
        className={`relative cursor-grab active:cursor-grabbing ${animCls}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleQuiet(true);
        }}
      >
        {/* 脚下土堆（挖宝/出货时出现） */}
        {state === "digging" || state === "reveal" || state === "stow" ? <span className="pet-mound pet-mound-pop" /> : null}
        <img src={imgSrc} alt="" draggable={false} className="pointer-events-none relative block w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.12)]" />
        {/* 挖宝尘土 */}
        {state === "digging" ? (
          <>
            <span className="pet-dust" style={{ ["--dx" as string]: "-14px", animationDelay: "0s" }} />
            <span className="pet-dust" style={{ ["--dx" as string]: "12px", animationDelay: "0.2s" }} />
            <span className="pet-dust" style={{ ["--dx" as string]: "2px", animationDelay: "0.4s" }} />
          </>
        ) : null}
        {/* 出货宝石（stow 时飞向宝箱） */}
        {(state === "reveal" || state === "stow") && gemCount !== null ? (
          <span className={`absolute -right-1 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-pet-gold-soft ring-2 ring-pet-amber/50 ${state === "stow" ? "pet-gem-stow" : "pet-gem"}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M6 3h12l4 6-10 12L2 9z" fill="oklch(0.6 0.118 184.704)" stroke="oklch(0.45 0.1 185)" strokeWidth="1" strokeLinejoin="round" />
              <path d="M2 9h20M9 3l-3 6 6 12M15 3l3 6-6 12" fill="none" stroke="oklch(0.98 0.02 185)" strokeWidth="0.9" />
            </svg>
            {gemCount > 1 ? (
              <span className="absolute -right-1 -bottom-1 rounded-full bg-pet-amber-deep px-1 font-mono text-[9px] text-white">×{gemCount}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* 宝箱（点击报库存） */}
      <button
        type="button"
        onClick={handleChestClick}
        title={`已累计挖到 ${treasure} 份宝藏`}
        className="absolute -left-7 bottom-0 block h-8 w-8 transition-transform hover:scale-110 active:scale-95"
      >
        <img key={chestPopKey} src={IMG_CHEST} alt="宝箱" draggable={false} className={`pointer-events-none block h-full w-full drop-shadow-[0_3px_5px_rgb(0_0_0/0.15)] ${chestPopKey > 0 ? "pet-chest-pop" : ""}`} />
        {treasure > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[15px] rounded-full bg-pet-amber-deep px-1 text-center font-mono text-[9px] leading-[15px] text-white shadow-sm">{treasure > 99 ? "99+" : treasure}</span>
        ) : null}
      </button>

      {/* 成就徽章行（已获得才展示） */}
      {earned.length > 0 ? (
        <div className="absolute -left-8 bottom-8 flex gap-1">
          {earned.map((a, i) => (
            <span
              key={a.threshold}
              title={`成就「${a.name}」· 累计挖到 ${a.threshold} 份宝藏`}
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] leading-none shadow-sm ring-1 ${milestone?.threshold === a.threshold ? "pet-badge-in" : ""}`}
              style={{ background: a.bg, boxShadow: `0 0 6px ${a.ring}`, ["--tw-ring-color" as string]: a.ring, animationDelay: `${i * 0.12}s` }}
            >
              🏅
            </span>
          ))}
        </div>
      ) : null}

      {/* 小字提示 */}
      <p className="mt-0.5 text-center font-mono text-[9px] text-muted-foreground/60">阿寻 · 右键静默</p>
    </div>
  );
}
