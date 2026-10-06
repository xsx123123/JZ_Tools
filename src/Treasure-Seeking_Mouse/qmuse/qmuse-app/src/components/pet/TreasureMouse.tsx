// 寻宝鼠「阿寻」：积木风桌宠。多造型切换 + 挖宝小剧场（土堆/尘土/宝石入袋）+
// 连击转圈、爱心飘浮、闲置散步张望、宝箱累计计数、里程碑成就庆祝，可拖拽、右键静默。
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { readPetPos, writePetPos, readPetQuiet, writePetQuiet, readPetSize, readPetAlways, bumpPokeCount, readTreasureCount, addTreasure, ACHIEVEMENTS, claimAchievement, earnedAchievements, type Achievement, type PetPos } from "@/services/petStore";
import { onPetSettingsChanged, onPetRecall, onPetQuiet, onPetTyping } from "@/lib/petBus";
import { PetSettingsPanel } from "@/components/pet/PetSettingsPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import IMG_BASE from "@/assets/pet/mouse-base.png";
import IMG_SHOVEL from "@/assets/pet/mouse-shovel.webp";
import IMG_NIGHT from "@/assets/pet/mouse-night.webp";
import IMG_SNIFF from "@/assets/pet/mouse-sniff.webp";
import IMG_SAD from "@/assets/pet/mouse-sad.webp";
import IMG_CHEST_OPEN from "@/assets/pet/mouse-chest-open.webp";
import IMG_WINK from "@/assets/pet/mouse-wink.webp";
import IMG_SPIN from "@/assets/pet/mouse-spin.webp";
import IMG_CROWN from "@/assets/pet/mouse-crown.webp";
import IMG_PEEK from "@/assets/pet/mouse-peek.webp";
import IMG_SLEEP from "@/assets/pet/mouse-sleep.webp";
import IMG_CHEST from "@/assets/pet/chest.png";

type PetState = "idle" | "digging" | "reveal" | "stow" | "miss" | "poke" | "spin" | "walk" | "look" | "celebrate" | "peek" | "sleep";

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

const IDLE_LINES = [
  "师兄师姐催数据了？别慌，告诉我你想挖哪篇！",
  "刚进组看不懂 GSE/GSM 编号？把代号丢给我，阿寻去刨底细！",
  "今天想找小鼠还是人的转录组？阿寻的小铲子已经磨利了~",
  "哪怕只有一个模糊的研究方向，阿寻也能顺藤摸瓜！",
  "这片土里有单细胞的味道…", "今天也来挖 GSE 吧！", "嗅到了高分文献的气息", "我的铲子呢…哦在背包里", "宝藏藏在第三铲之后",
];
const DIG_LINES = ["挖挖挖…", "GEO? SRA?", "这块土有点硬", "快出来了快出来了", "阿寻挖矿中，请勿投喂"];
const POKE_LINES = ["吱!", "别戳啦~", "背包里掉出一张 GSM 卡片", "给你看我的宝贝收藏", "再戳就咬你哦（轻轻）"];
const SPIN_LINES = ["转圈圈！宝藏多多！", "被爱了吱吱吱", "嘿嘿，痒"];
const MISS_LINES = ["唉，只有石头…", "这铲土是空的", "一定是姿势不对，再试一次!"];
const WALK_LINES = ["去那边看看…", "闻着 RNA 的味儿就去了", "散步消食，顺便探矿"];
const WAKE_LINES = ["呜哇…梦到一大箱 GSE", "zzZ…啊！醒了醒了", "再让我睡五分钟嘛…"];
const TREASURE_LINES: [() => string, (n: number) => string] = [
  () => "宝藏还在路上，别急~",
  (n: number) => `本鼠已囤 ${n} 份宝藏，富甲一方！`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const MARGIN = 12;
const MOBILE_SIZE_CAP = 120; // 移动端即使选大档也封顶，避免遮挡对话

function clampPos(p: PetPos, size: number): PetPos {
  const w = window.innerWidth;
  const h = window.innerHeight;
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

export function TreasureMouse({ event }: { event: PetEvent | null }): React.ReactElement | null {
  const isMobile = useIsMobile();
  const [sizePref, setSizePref] = useState<number>(() => readPetSize()); // 用户所选档位（96/144/192）
  const [always, setAlways] = useState<boolean>(() => readPetAlways()); // 一直存在：关掉则闲置自动藏起来
  const [hidden, setHidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // 悬浮齿轮设置面板
  const size = isMobile ? Math.min(sizePref, MOBILE_SIZE_CAP) : sizePref; // 实际渲染宽度
  const [quiet, setQuiet] = useState<boolean>(() => readPetQuiet());
  const [pos, setPos] = useState<PetPos>(() => {
    const saved = readPetPos();
    if (saved) return clampPos(saved, size);
    return { x: window.innerWidth - size - 24, y: 120 };
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
  const [dark, setDark] = useState<boolean>(() => document.documentElement.classList.contains("dark"));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const [typing, setTyping] = useState(false); // 用户正在输入框键入：立绘挂「竖起耳朵」跃动 class
  const bodyRef = useRef<HTMLSpanElement>(null); // 立绘包裹层：hover 回弹动画挂在它身上
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeq = useRef(0);
  const pokeStreak = useRef<{ n: number; at: number }>({ n: 0, at: 0 });
  const lastAct = useRef(Date.now()); // 最近一次互动（事件/戳/拖拽），闲置超时后入睡
  const busyRef = useRef(false); // 有剧情在演时，闲置行为让路
  busyRef.current = state !== "idle";
  const alwaysRef = useRef(always);
  alwaysRef.current = always;

  // 页面层设置入口（顶栏按钮 / 共享面板）⇆ 桌宠：改设置即时生效、找回退出静默与隐藏
  useEffect(() => {
    const offSettings = onPetSettingsChanged(() => {
      lastAct.current = Date.now(); // 用户在调设置，别睡着了/藏起来
      setSizePref(readPetSize());
      setAlways(readPetAlways());
      if (readPetAlways()) setHidden(false);
    });
    const offRecall = onPetRecall(() => {
      lastAct.current = Date.now();
      if (stateTimer.current) clearTimeout(stateTimer.current);
      writePetQuiet(false);
      setQuiet(false);
      setHidden(false);
      setState("idle");
      setBubble(null);
    });
    const offQuiet = onPetQuiet(() => {
      writePetQuiet(true);
      setQuiet(true);
      setPanelOpen(false);
      setState("idle");
      setBubble(null);
    });
    return () => {
      offSettings();
      offRecall();
      offQuiet();
    };
  }, []);

  // 有剧情开演时收起设置面板
  useEffect(() => {
    if (state !== "idle" && panelOpen) setPanelOpen(false);
  }, [state, panelOpen]);

  // 夜探矿洞主题：跟随 <html> 的 .dark 类
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // 输入联动：用户在输入框键入时竖起耳朵，清空即恢复
  useEffect(() => onPetTyping(setTyping), []);

  // 气泡轮播：闲置时每 12s 从语录库平滑淡入下一句；点击气泡手动切换。
  // 只在 idle 且无台词时接管，避免打断挖宝/出错等实时台词
  const idleLineIdx = useRef(0);
  useEffect(() => {
    if (quiet) return;
    const timer = setInterval(() => {
      setState((s) => {
        if (s !== "idle") return s;
        setBubble((b) => {
          if (b !== null) return b; // 当前有台词（可能是剧情/手点）就先让它演完
          idleLineIdx.current = (idleLineIdx.current + 1) % IDLE_LINES.length;
          const next = IDLE_LINES[idleLineIdx.current];
          setTimeout(() => setBubble((cur) => (cur === next ? null : cur)), 10_000);
          return next;
        });
        return s;
      });
    }, 12_000);
    return () => clearInterval(timer);
  }, [quiet]);

  /** 手动点气泡：立刻换一句（从语录库顺序取下一句，不打扰剧情台词） */
  function cycleBubble(): void {
    if (state !== "idle") return; // 剧情台词不打扰
    lastAct.current = Date.now();
    idleLineIdx.current = (idleLineIdx.current + 1) % IDLE_LINES.length;
    setBubble(IDLE_LINES[idleLineIdx.current]);
    if (stateTimer.current) clearTimeout(stateTimer.current);
    stateTimer.current = setTimeout(() => {
      setState("idle");
      setBubble(null);
    }, 10_000);
  }

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
    lastAct.current = Date.now();
    setHidden(false); // 「一直存在」关闭时，有互动就回来
    if (state === "sleep") { // 有动静就醒
      setState("idle");
      setBubble(null);
    }
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

  // 闲置剧场：入睡 / 冒泡 / 散步 / 张望 / 探头
  useEffect(() => {
    if (quiet) return;
    idleTimer.current = setInterval(() => {
      if (state === "sleep") return; // 睡着时保持安静，等互动唤醒
      // 未开「一直存在」：闲置 15s 后藏起来（互动/流式事件会叫它回来）
      if (!alwaysRef.current && !busyRef.current && Date.now() - lastAct.current > 15_000) {
        setHidden(true);
        return;
      }
      // 45s 无互动 → 趴在土堆上睡着
      if (!busyRef.current && Date.now() - lastAct.current > 45_000) {
        setState("sleep");
        setBubble("Zzz…");
        return;
      }
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
          setPos(clampPos({ x: base + dir * Math.sin(t * Math.PI) * 46, y: pos.y }, size));
        }, 50);
      } else if (r < 0.54) {
        transient("look", null, 3200);
      } else if (r < 0.64) {
        transient("peek", null, 2800); // 从地洞里探出脑袋张望
      }
    }, 9000);
    return () => {
      if (idleTimer.current) clearInterval(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiet, pos.x, pos.y, transient, state]);

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
    lastAct.current = Date.now();
    const now = Date.now();
    pokeStreak.current = now - pokeStreak.current.at < 1500 ? { n: pokeStreak.current.n + 1, at: now } : { n: 1, at: now };
    const n = bumpPokeCount();
    if (state === "sleep") {
      // 睡梦中被戳醒：迷糊回应，不计连击
      spawnHearts(1);
      transient("poke", pick(WAKE_LINES), 1400);
      return;
    }
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
    lastAct.current = Date.now();
    const total = readTreasureCount();
    const line = total > 0 ? `宝箱里已囤 ${total} 份宝藏，都是阿寻一铲一铲挖的！` : TREASURE_LINES[0]();
    transient("poke", line, 1800);
  }

  // Pointer 拖拽
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    lastAct.current = Date.now();
    if (state === "sleep") { // 拖动也叫醒
      setState("idle");
      setBubble(null);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      setPos(clampPos({ x: d.origX + dx, y: d.origY - dy }, size)); // y 是距底部距离
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

  if (hidden) return null; // 「一直存在」关闭时的闲置隐藏，经顶栏/设置面板「找回阿寻」恢复

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
                  : state === "look" || state === "peek" ? "pet-look"
                    : state === "celebrate" ? "pet-celebrate"
                      : state === "sleep" ? "pet-sleep" : "pet-idle";

  // 造型与状态一一对应：挖土(暗色换夜探矿洞)/开宝箱/空铲失望/转圈卖萌/加冕/眨眼/嗅探/探头/睡土堆
  const imgSrc =
    state === "digging" || state === "walk" ? (dark ? IMG_NIGHT : IMG_SHOVEL)
      : state === "reveal" || state === "stow" ? IMG_CHEST_OPEN
        : state === "miss" ? IMG_SAD
          : state === "poke" ? IMG_WINK
            : state === "spin" ? IMG_SPIN
              : state === "celebrate" ? IMG_CROWN
                : state === "look" ? IMG_SNIFF
                  : state === "peek" ? IMG_PEEK
                    : state === "sleep" ? IMG_SLEEP : IMG_BASE;

  return (
    <div
      role="img"
      aria-label="寻宝鼠阿寻"
      className="group fixed z-30 select-none touch-none"
      style={{ left: pos.x, bottom: pos.y, width: size }}
    >
      {/* 悬浮设置齿轮（hover 显现），点开为与顶栏同款的设置面板 */}
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        title="桌宠设置"
        aria-label="桌宠设置"
        className={`absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-opacity hover:text-helix ${panelOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <Settings size={13} />
      </button>
      {panelOpen ? (
        <div className="absolute -top-2 right-0 z-20 -translate-y-full">
          <PetSettingsPanel onClose={() => setPanelOpen(false)} />
        </div>
      ) : null}
      {/* 气泡（点击手动切换语录） */}
      {bubble ? (
        <button
          type="button"
          onClick={cycleBubble}
          className="pet-bubble absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-border bg-card px-2.5 py-1 text-[11.5px] text-foreground shadow-soft transition-colors hover:border-pet-amber/60"
        >
          {bubble}
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-card" />
        </button>
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

      {/* 主体（可拖/可点；hover 回弹缩放；用户键入时竖起耳朵跃动） */}
      <div
        className={`relative cursor-grab active:cursor-grabbing ${animCls}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={() => {
          if (state === "idle" && !isMobile) {
            const el = bodyRef.current;
            el?.classList.remove("pet-hover-bounce");
            void el?.offsetWidth; // 重新触发动画
            el?.classList.add("pet-hover-bounce");
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleQuiet(true);
        }}
      >
        <span ref={bodyRef} className={`block ${typing && state === "idle" ? "pet-ears-perk" : ""}`}>
          {/* 脚下土堆（挖宝/出货时出现） */}
          {state === "digging" || state === "reveal" || state === "stow" ? <span className="pet-mound pet-mound-pop" /> : null}
          <img src={imgSrc} alt="" draggable={false} className="pointer-events-none relative block w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.12)]" />
        </span>
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
              <path d="M6 3h12l4 6-10 12L2 9z" fill="#D97706" stroke="#B45309" strokeWidth="1" strokeLinejoin="round" />
              <path d="M2 9h20M9 3l-3 6 6 12M15 3l3 6-6 12" fill="none" stroke="#FEF3C7" strokeWidth="0.9" />
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
