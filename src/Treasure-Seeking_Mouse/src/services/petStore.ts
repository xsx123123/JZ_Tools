// 寻宝鼠桌宠的本机偏好：位置 / 安静模式 / 互动计数 / 主题 / 成就（仅 localStorage，不涉云端）
const KEY_POS = "seqout-pet-pos";
const KEY_QUIET = "seqout-pet-quiet";
const KEY_POKE = "seqout-pet-poke";
const KEY_TREASURE = "seqout-pet-treasure";
const KEY_THEME = "seqout-theme";
const KEY_ACHIEVED = "seqout-pet-achievements";
const KEY_SIZE = "seqout-pet-size";
const KEY_ALWAYS = "seqout-pet-always";
const KEY_IDLE_ALIVE = "seqout-pet-idle-alive";

/** 桌宠体型：连续档位（宽 px），步进 ±12，显示为相对默认 144 的百分比 */
export const PET_SIZE_MIN = 72;
export const PET_SIZE_MAX = 240;
export const PET_SIZE_STEP = 12;
export const PET_SIZE_DEFAULT = 144;

export function readPetSize(): number {
  try {
    const n = Number(localStorage.getItem(KEY_SIZE) ?? String(PET_SIZE_DEFAULT));
    if (!Number.isFinite(n)) return PET_SIZE_DEFAULT;
    return Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, Math.round(n)));
  } catch {
    return PET_SIZE_DEFAULT;
  }
}

export function writePetSize(n: number): void {
  try {
    localStorage.setItem(KEY_SIZE, String(Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, Math.round(n)))));
  } catch {
    /* ignore */
  }
}

/** 闲置时自己活动：关闭后阿寻安静待命（不冒泡/溜达/张望/入睡） */
export function readPetIdleAlive(): boolean {
  try {
    return localStorage.getItem(KEY_IDLE_ALIVE) !== "0";
  } catch {
    return true;
  }
}

export function writePetIdleAlive(b: boolean): void {
  try {
    localStorage.setItem(KEY_IDLE_ALIVE, b ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** 是否一直存在：关闭后阿寻闲置时会自动藏起来（流式互动会再出现），可经设置找回 */
export function readPetAlways(): boolean {
  try {
    return localStorage.getItem(KEY_ALWAYS) !== "0";
  } catch {
    return true;
  }
}

export function writePetAlways(b: boolean): void {
  try {
    localStorage.setItem(KEY_ALWAYS, b ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export interface PetPos {
  x: number; // 距视口左缘 px
  y: number; // 距视口底缘 px
}

export function readPetPos(): PetPos | null {
  try {
    const raw = localStorage.getItem(KEY_POS);
    if (!raw) return null;
    const p = JSON.parse(raw) as PetPos;
    if (typeof p.x === "number" && typeof p.y === "number") return p;
    return null;
  } catch {
    return null;
  }
}

export function writePetPos(p: PetPos): void {
  try {
    localStorage.setItem(KEY_POS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function readPetQuiet(): boolean {
  try {
    return localStorage.getItem(KEY_QUIET) === "1";
  } catch {
    return false;
  }
}

export function writePetQuiet(q: boolean): void {
  try {
    localStorage.setItem(KEY_QUIET, q ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function bumpPokeCount(): number {
  try {
    const n = Number(localStorage.getItem(KEY_POKE) ?? "0") + 1;
    localStorage.setItem(KEY_POKE, String(n));
    return n;
  } catch {
    return 1;
  }
}

/** 累计挖到的宝藏（结果卡片）数 */
export function readTreasureCount(): number {
  try {
    return Number(localStorage.getItem(KEY_TREASURE) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function addTreasure(n: number): number {
  try {
    const total = readTreasureCount() + n;
    localStorage.setItem(KEY_TREASURE, String(total));
    return total;
  } catch {
    return n;
  }
}

/* ---------- 主题（夜探矿洞） ---------- */

export type Theme = "light" | "dark";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY_THEME) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY_THEME, t);
  } catch {
    /* ignore */
  }
}

/** 把主题应用到 <html>：dark 加 .dark 类；light 保持无类（:root 即亮色） */
export function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle("dark", t === "dark");
}

/* ---------- 挖宝成就里程碑 ---------- */

export interface Achievement {
  threshold: number;
  name: string;
  /** 徽章金属配色（CSS 渐变，明暗通用） */
  bg: string;
  ring: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { threshold: 10, name: "初代寻宝鼠", bg: "linear-gradient(135deg, oklch(0.72 0.14 60), oklch(0.55 0.11 55))", ring: "oklch(0.65 0.12 60 / 0.6)" },
  { threshold: 50, name: "矿脉老手", bg: "linear-gradient(135deg, oklch(0.88 0.02 250), oklch(0.68 0.03 250))", ring: "oklch(0.78 0.02 250 / 0.6)" },
  { threshold: 100, name: "组学淘金王", bg: "linear-gradient(135deg, oklch(0.88 0.16 95), oklch(0.72 0.16 78))", ring: "oklch(0.82 0.15 85 / 0.7)" },
];

export function readAchieved(): number[] {
  try {
    const raw = localStorage.getItem(KEY_ACHIEVED);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/** 标记某档成就已获得，返回是否首次（true = 该播庆祝动画） */
export function claimAchievement(threshold: number): boolean {
  const got = readAchieved();
  if (got.includes(threshold)) return false;
  try {
    localStorage.setItem(KEY_ACHIEVED, JSON.stringify([...got, threshold]));
  } catch {
    /* ignore */
  }
  return true;
}

/** 按当前累计宝藏数返回应展示的成就（存量高计数用户进页面即补发徽章、不播动画） */
export function earnedAchievements(total: number): Achievement[] {
  return ACHIEVEMENTS.filter((a) => total >= a.threshold);
}
