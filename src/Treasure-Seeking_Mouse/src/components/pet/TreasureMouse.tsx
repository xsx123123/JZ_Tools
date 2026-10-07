// 寻宝鼠「阿寻」：积木风桌宠。多造型切换 + 挖宝小剧场（土堆/尘土/宝石入袋）+
// 连击转圈、爱心飘浮、闲置散步张望、宝箱累计计数、里程碑成就庆祝，可拖拽、右键静默。
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { readPetPos, writePetPos, readPetQuiet, writePetQuiet, readPetSize, readPetAlways, readPetIdleAlive, bumpPokeCount, readTreasureCount, addTreasure, ACHIEVEMENTS, claimAchievement, earnedAchievements, type Achievement, type PetPos } from "@/services/petStore";
import { onPetSettingsChanged, onPetRecall, onPetQuiet, onPetResetPos, onPetTyping, emitPetSettingsChanged } from "@/lib/petBus";
import { PetSettingsPanel } from "@/components/pet/PetSettingsPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useI18n } from "@/i18n/provider";
import { petLines, type MessageKey } from "@/i18n";
import IMG_BASE from "@/assets/pet/mouse-base.webp";
import IMG_CHEST from "@/assets/pet/chest.webp";
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

type PetState = "idle" | "digging" | "reveal" | "stow" | "miss" | "poke" | "spin" | "walk" | "look" | "celebrate" | "peek" | "sleep";

/** 外部流式事件 → 宠物动作 */
export type PetEvent =
  | { type: "tool_start"; seq: number }
  | { type: "cards"; count: number; seq: number }
  | { type: "done"; cards: number; seq: number }
  | { type: "error"; seq: number }
  | { type: "hint"; seq: number }
  | { type: "hint_end"; seq: number };

let petSeq = 0;
/** 发送方调用：产生带唯一序号的事件，保证同类事件连续触发也能被消费 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export function makePetEvent(e: DistributiveOmit<PetEvent, "seq">): PetEvent {
  return { ...e, seq: ++petSeq } as PetEvent;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const MOBILE_MAX_W = 768; // 与 useIsMobile / Tailwind md: 断点一致
const MOBILE_SIZE_CAP = 120; // 移动端即使选大档也封顶，避免遮挡对话
const MARGIN = 12;

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
  const { t, lang } = useI18n();
  const L = petLines(lang);
  const isMobile = useIsMobile();
  const [sizePref, setSizePref] = useState<number>(() => readPetSize()); // 体型宽 px（72–240，步进 12）
  const [always, setAlways] = useState<boolean>(() => readPetAlways()); // 一直存在：关掉则闲置自动藏起来
  const [idleAlive, setIdleAlive] = useState<boolean>(() => readPetIdleAlive()); // 闲置时自己活动（冒泡/溜达/入睡）
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
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 触摸端长按静默计时器
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeq = useRef(0);
  const hintActiveRef = useRef(false); // hint 剧场是否进行中（hint_end 只收尾 hint，不打扰别的剧场）
  const pokeStreak = useRef<{ n: number; at: number }>({ n: 0, at: 0 });
  const lastAct = useRef(Date.now()); // 最近一次互动（事件/戳/拖拽），闲置超时后入睡
  const busyRef = useRef(false); // 有剧情在演时，闲置行为让路
  busyRef.current = state !== "idle";
  const alwaysRef = useRef(always);
  alwaysRef.current = always;
  const idleAliveRef = useRef(idleAlive);
  idleAliveRef.current = idleAlive;

  // 页面层设置入口（顶栏按钮 / 共享面板）⇆ 桌宠：改设置即时生效、找回退出静默与隐藏
  useEffect(() => {
    const offSettings = onPetSettingsChanged(() => {
      lastAct.current = Date.now(); // 用户在调设置，别睡着了/藏起来
      setSizePref(readPetSize());
      setAlways(readPetAlways());
      setIdleAlive(readPetIdleAlive());
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
    const offResetPos = onPetResetPos(() => {
      const p = clampPos({ x: window.innerWidth - size - 24, y: 120 }, size);
      setPos(p);
      writePetPos(p);
      lastAct.current = Date.now();
    });
    return () => {
      offSettings();
      offRecall();
      offQuiet();
      offResetPos();
    };
  }, [size]);

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
  // 只在 idle 且无剧情气泡时接管，避免打断挖宝/出错等实时台词
  const idleLineIdx = useRef(0);
  useEffect(() => {
    if (quiet || !idleAlive) return;
    const timer = setInterval(() => {
      setState((s) => {
        if (s !== "idle") return s;
        setBubble((b) => {
          if (b !== null) return b; // 当前有台词（可能是剧情/手点）就先让它演完
          idleLineIdx.current = (idleLineIdx.current + 1) % L.idle.length;
          const next = L.idle[idleLineIdx.current];
          setTimeout(() => setBubble((cur) => (cur === next ? null : cur)), 10_000);
          return next;
        });
        return s;
      });
    }, 12_000);
    return () => clearInterval(timer);
  }, [quiet, idleAlive, lang, L.idle]);

  /** 手动点气泡：立刻换一句（从语录库顺序取下一句，不重复当前句） */
  function cycleBubble(): void {
    if (state !== "idle") return; // 剧情台词不打扰
    lastAct.current = Date.now();
    idleLineIdx.current = (idleLineIdx.current + 1) % L.idle.length;
    setBubble(L.idle[idleLineIdx.current]);
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
        transient("digging", pick(L.dig), 10_000); // 兜底超时回 idle；done/error 会提前打断
        break;
      case "cards": {
        setGemCount(event.count);
        countedRef.current = true;
        revealStow(event.count, t("pet.foundData", { n: event.count }), 1800, false);
        break;
      }
      case "done":
        if (event.cards > 0 && state !== "reveal" && state !== "stow" && state !== "celebrate") {
          setGemCount(event.cards);
          revealStow(event.cards, t("pet.worthIt"), 1600, countedRef.current);
        } else if (event.cards === 0) {
          transient("miss", pick(L.miss), 2400);
        }
        break;
      case "error":
        transient("miss", pick(L.miss), 2400);
        break;
      case "hint":
        // 新用户发现性提示（lib/hintBus 联动）：阿寻兴奋地挖宝并喊话「那里有宝藏」，
        // 引导用户去悬停带感叹号的编号；6.5s 兜底回 idle，用户悬停/点开（hint_end）立即收尾
        hintActiveRef.current = true;
        transient("digging", t("pet.hintBubble"), 6500, () => {
          hintActiveRef.current = false;
        });
        break;
      case "hint_end":
        // 用户已响应提示（悬停/点开编号）：立即收起台词与动作，形成「对话感」
        if (hintActiveRef.current) {
          hintActiveRef.current = false;
          if (stateTimer.current) clearTimeout(stateTimer.current);
          setState("idle");
          setBubble(null);
        }
        break;
      default:
        break;
    }
  }, [event, quiet, transient, state, checkMilestones, lang]);

  // 闲置剧场：入睡 / 冒泡 / 散步 / 张望 / 探头（「闲置时自己活动」关闭时整体停演，安静待命）
  useEffect(() => {
    if (quiet || !idleAlive) return;
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
        setBubble(pick(L.idle));
        setTimeout(() => setBubble((b) => (b && L.idle.includes(b) ? null : b)), 3200);
      } else if (r < 0.44) {
        // 溜达一小段
        const dir = Math.random() < 0.5 ? -1 : 1;
        setState("walk");
        setBubble(pick(L.walk));
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
  }, [quiet, idleAlive, pos.x, pos.y, transient, lang, state]);

  useEffect(() => () => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
    if (longPressRef.current) clearTimeout(longPressRef.current);
  }, []);

  function toggleQuiet(q: boolean): void {
    setQuiet(q);
    writePetQuiet(q);
    if (q) {
      setState("idle");
      setBubble(null);
    }
    emitPetSettingsChanged(); // 通知设置面板刷新「从桌面收起」开关等状态
  }

  function handlePoke(): void {
    lastAct.current = Date.now();
    const now = Date.now();
    pokeStreak.current = now - pokeStreak.current.at < 1500 ? { n: pokeStreak.current.n + 1, at: now } : { n: 1, at: now };
    const n = bumpPokeCount();
    if (state === "sleep") {
      // 睡梦中被戳醒：迷糊回应，不计连击
      spawnHearts(1);
      transient("poke", pick(L.wake), 1400);
      return;
    }
    if (pokeStreak.current.n >= 3) {
      // 连击彩蛋：转圈 + 爱心雨 + 报宝藏库存
      pokeStreak.current = { n: 0, at: 0 };
      spawnHearts(5);
      const line = L.treasureStash(readTreasureCount());
      transient("spin", line, 1400);
      return;
    }
    spawnHearts(1);
    const line = n > 6 && pokeStreak.current.n === 1 ? t("pet.readNoReply") : pick([...L.poke, ...L.spin.slice(0, 1)]);
    transient("poke", line, 900);
  }

  function handleChestClick(): void {
    lastAct.current = Date.now();
    const total = readTreasureCount();
    const line = total > 0 ? t("pet.chestStock", { n: total }) : L.treasureEmpty;
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
    // 触摸端无右键：长按 600ms 静默（与桌面右键等价）。拖动会先取消该计时器
    if (e.pointerType === "touch") {
      longPressRef.current = setTimeout(() => {
        longPressRef.current = null;
        dragRef.current = null; // 取消后续拖拽/点击判定
        toggleQuiet(true);
      }, 600);
    }
  };
  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // 触摸端阈值放宽（手指抖动比鼠标大，4px 会把"点击"误判成"拖拽"）
    const threshold = e.pointerType === "touch" ? 10 : 4;
    if (Math.abs(dx) + Math.abs(dy) > threshold) {
      d.moved = true;
      cancelLongPress(); // 已在拖动，不再触发长按静默
    }
    if (d.moved) {
      setPos(clampPos({ x: d.origX + dx, y: d.origY - dy }, size)); // y 是距底部距离
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    cancelLongPress();
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
        title={t("pet.recall")}
        className="fixed bottom-4 right-4 z-30 flex h-9 w-9 items-end justify-center rounded-b-full border border-dashed border-helix/40 bg-helix-soft/60 pb-1 text-helix shadow-soft transition-transform hover:scale-110"
        aria-label={t("pet.recall")}
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
      aria-label={t("pet.alt")}
      className="group fixed z-30 select-none touch-none"
      style={{ left: pos.x, bottom: pos.y, width: size, ["--pet-size" as string]: `${size}px` }}
    >
      {/* 悬浮设置齿轮（hover 显现），点开为与顶栏同款的设置面板 */}
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        title={t("pet.settings.gear")}
        aria-label={t("pet.settings.gear")}
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
          {t("pet.banner", { name: t(`pet.achievements.${milestone.threshold}` as MessageKey), n: milestone.threshold })}
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

      {/* 环形附件轮盘：宝箱与成就徽章围绕阿寻分布，避免挤成一排 */}
      <div className="pet-orbit" aria-label={t("pet.attachments")}>
        <span className="pet-orbit-ring" aria-hidden />
        <button
          type="button"
          onClick={handleChestClick}
          title={t("pet.chestHover", { n: treasure })}
          aria-label={t("pet.chestHover", { n: treasure })}
          className="pet-orbit-item pet-orbit-chest"
          style={{ ["--orbit-angle" as string]: "255deg" }}
        >
          <img key={chestPopKey} src={IMG_CHEST} alt={t("pet.chest")} draggable={false} className={`pointer-events-none block h-full w-full drop-shadow-[0_3px_5px_rgb(0_0_0/0.15)] ${chestPopKey > 0 ? "pet-chest-pop" : ""}`} />
          {treasure > 0 ? (
            <span className="absolute -right-2 -top-2 min-w-[17px] rounded-full bg-pet-amber-deep px-1 text-center font-mono text-[9px] leading-[17px] text-white shadow-sm">{treasure > 99 ? "99+" : treasure}</span>
          ) : null}
        </button>
        {earned.map((a, i) => (
          <span
            key={a.threshold}
            title={t("pet.badgeTitle", { name: t(`pet.achievements.${a.threshold}` as MessageKey), n: a.threshold })}
            className={`pet-orbit-item pet-orbit-badge ${milestone?.threshold === a.threshold ? "pet-badge-in" : ""}`}
            style={{
              // Fan on the mouse's left at body height (254°-290°, 18° apart): beside the
              // body, cannot reach the face above or the caption/gear.
              ["--orbit-angle" as string]: `${254 + i * 18}deg`,
              background: a.bg,
              boxShadow: `0 0 8px ${a.ring}`,
              ["--tw-ring-color" as string]: a.ring,
              animationDelay: `${i * 0.12}s`,
            }}
          >
            🏅
          </span>
        ))}
      </div>

      {/* 小字提示：触摸端无右键，提示长按 */}
      <p className="mt-0.5 text-center font-mono text-[9px] text-muted-foreground/60">
        {t("pet.hint", { mode: isMobile ? t("pet.modeLongPress") : t("pet.modeRightClick") })}
      </p>
    </div>
  );
}
