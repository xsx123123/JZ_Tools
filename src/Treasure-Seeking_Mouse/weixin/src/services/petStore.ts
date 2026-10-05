// 【小程序版】寻宝鼠桌宠的本机偏好：位置 / 安静模式 / 互动计数 / 主题 / 成就（仅本机存储，不涉云端）
import Taro from "@tarojs/taro";
import { getItem, setItem } from "./device";

const KEY_POS = "seqout-pet-pos";
const KEY_QUIET = "seqout-pet-quiet";
const KEY_POKE = "seqout-pet-poke";
const KEY_TREASURE = "seqout-pet-treasure";
const KEY_THEME = "seqout-theme";
const KEY_ACHIEVED = "seqout-pet-achievements";

export interface PetPos {
  x: number; // 距视口左缘 px
  y: number; // 距视口底缘 px
}

export function readPetPos(): PetPos | null {
  try {
    const raw = getItem(KEY_POS);
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
    setItem(KEY_POS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function readPetQuiet(): boolean {
  try {
    return getItem(KEY_QUIET) === "1";
  } catch {
    return false;
  }
}

export function writePetQuiet(q: boolean): void {
  try {
    setItem(KEY_QUIET, q ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function bumpPokeCount(): number {
  try {
    const n = Number(getItem(KEY_POKE) ?? "0") + 1;
    setItem(KEY_POKE, String(n));
    return n;
  } catch {
    return 1;
  }
}

/** 累计挖到的宝藏（结果卡片）数 */
export function readTreasureCount(): number {
  try {
    return Number(getItem(KEY_TREASURE) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function addTreasure(n: number): number {
  try {
    const total = readTreasureCount() + n;
    setItem(KEY_TREASURE, String(total));
    return total;
  } catch {
    return n;
  }
}

/* ---------- 主题（夜探矿洞） ---------- */

export type Theme = "light" | "dark";

export function readTheme(): Theme {
  try {
    return getItem(KEY_THEME) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(t: Theme): void {
  try {
    setItem(KEY_THEME, t);
  } catch {
    /* ignore */
  }
}

/**
 * 把主题应用到页面根节点：dark 加 .dark 类，light 移除。
 * 【小程序适配】网页版操作根元素类名；小程序无 DOM，
 * 改用 Taro 的页面类名开关——给 page 根节点挂 .dark，WXSS 里 `.dark .xxx` 才能命中。
 * 注：需在页面根 View 上保留一个可被选择器命中的容器类（见 index.tsx 的 .theme-root）。
 */
export function applyTheme(t: Theme): void {
  try {
    // @ts-ignore 小程序端页面栈 API，类型未覆盖 page 级别的 class 操作
    const pages = Taro.getCurrentPages?.() ?? [];
    const cur = pages[pages.length - 1] as unknown as { setData?: (d: Record<string, unknown>) => void } | undefined;
    cur?.setData?.({ __theme: t });
  } catch {
    /* ignore */
  }
}

/* ---------- 挖宝成就里程碑 ---------- */

export interface Achievement {
  threshold: number;
  name: string;
  /** 徽章金属配色（CSS 渐变，明暗通用） */
  bg: string;
  ring: string;
}

// 注：原用 oklch 渐变，小程序不支持 → 已转 rgb（本次转换 9 处）
export const ACHIEVEMENTS: Achievement[] = [
  { threshold: 10, name: "初代寻宝鼠", bg: "linear-gradient(135deg, rgb(227, 141, 61), rgb(162, 94, 43))", ring: "rgba(196, 124, 59, 0.6)" },
  { threshold: 50, name: "矿脉老手", bg: "linear-gradient(135deg, rgb(206, 217, 229), rgb(139, 154, 171))", ring: "rgba(174, 185, 196, 0.6)" },
  { threshold: 100, name: "组学淘金王", bg: "linear-gradient(135deg, rgb(249, 213, 68), rgb(218, 149, 0))", ring: "rgba(240, 187, 59, 0.7)" },
];

export function readAchieved(): number[] {
  try {
    const raw = getItem(KEY_ACHIEVED);
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
    setItem(KEY_ACHIEVED, JSON.stringify([...got, threshold]));
  } catch {
    /* ignore */
  }
  return true;
}

/** 按当前累计宝藏数返回应展示的成就（存量高计数用户进页面即补发徽章、不播动画） */
export function earnedAchievements(total: number): Achievement[] {
  return ACHIEVEMENTS.filter((a) => total >= a.threshold);
}
