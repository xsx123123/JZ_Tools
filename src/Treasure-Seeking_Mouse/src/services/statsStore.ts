// 排行榜统计：登录用户走 user_stats（auth.uid 本人可写），访客走 guest_stats（匿名设备指纹）
// 离线模式（无 Supabase 配置）走 localStorage 本地统计：本地开发的排行榜也有数据
// 所有写入均为 fire-and-forget，失败静默，绝不打断对话主流程。
import { isOfflineMode, supabase } from "@/supabase/client";
import { readLang, translate } from "@/i18n";

const KEY_DEVICE = "seqout-device-id";
const KEY_LOCAL_STATS = "seqout-local-stats";
const DEVICE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** 未命名访客的默认昵称（按语言） */
function guestName(deviceId: string): string {
  return translate(readLang(), "board.guestName", { n: deviceId.slice(-4) });
}

export interface StatRow {
  key: string;
  name: string;
  treasures: number;
  digs: number;
  chats: number;
  updated_at: string;
  isGuest: boolean;
  weekTreasures: number;
  weekDigs: number;
  weekChats: number;
}

/** 本机匿名设备指纹：首次生成后长期存 localStorage，作为访客榜主键 */
export function getDeviceId(): string {
  try {
    const old = localStorage.getItem(KEY_DEVICE);
    if (old && old.length >= 6) return old;
  } catch {
    /* ignore */
  }
  let s = "";
  for (let i = 0; i < 24; i++) s += DEVICE_CHARS[Math.floor(Math.random() * DEVICE_CHARS.length)];
  try {
    localStorage.setItem(KEY_DEVICE, s);
  } catch {
    /* ignore */
  }
  return s;
}

/** 本周周一（本地时区）的 YYYY-MM-DD，用于周计数滚动归零判断 */
function mondayOf(d: Date): string {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  const y = m.getFullYear();
  const mo = String(m.getMonth() + 1).padStart(2, "0");
  const da = String(m.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export interface StatDelta {
  treasures?: number;
  digs?: number;
  chats?: number;
}

// ---------- 本地统计（离线模式）：localStorage 单行 upsert，字段语义与云端 RPC 一致 ----------

interface LocalStatRow {
  device_id: string;
  display_name: string | null;
  treasures: number;
  digs: number;
  chats: number;
  week_base: string;
  week_treasures: number;
  week_digs: number;
  week_chats: number;
  updated_at: string;
}

function readLocalStats(): LocalStatRow | null {
  try {
    const raw = localStorage.getItem(KEY_LOCAL_STATS);
    return raw ? (JSON.parse(raw) as LocalStatRow) : null;
  } catch {
    return null;
  }
}

function writeLocalStats(row: LocalStatRow): void {
  try {
    localStorage.setItem(KEY_LOCAL_STATS, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

function bumpLocalStats(delta: StatDelta): void {
  const existing = readLocalStats();
  const monday = mondayOf(new Date());
  const base: LocalStatRow = existing && existing.device_id === getDeviceId()
    ? existing
    : {
        device_id: getDeviceId(),
        display_name: existing?.display_name ?? null,
        treasures: 0,
        digs: 0,
        chats: 0,
        week_base: monday,
        week_treasures: 0,
        week_digs: 0,
        week_chats: 0,
        updated_at: "",
      };
  // 跨周归零（与云端 RPC 的 week_base 逻辑一致）
  if (base.week_base !== monday) {
    base.week_base = monday;
    base.week_treasures = 0;
    base.week_digs = 0;
    base.week_chats = 0;
  }
  base.treasures += delta.treasures ?? 0;
  base.digs += delta.digs ?? 0;
  base.chats += delta.chats ?? 0;
  base.week_treasures += delta.treasures ?? 0;
  base.week_digs += delta.digs ?? 0;
  base.week_chats += delta.chats ?? 0;
  base.updated_at = new Date().toISOString();
  writeLocalStats(base);
}

/** 一次挖宝回合结束后累加统计（累计 + 本周双轨）；isGuest=true 时按 device_id upsert 访客表 */
export async function bumpStats(
  delta: StatDelta,
  opts: { isGuest: boolean; userId?: string; username?: string },
): Promise<void> {
  const inc: Record<string, number> = {};
  if (delta.treasures) inc.treasures = delta.treasures;
  if (delta.digs) inc.digs = delta.digs;
  if (delta.chats) inc.chats = delta.chats;
  if (Object.keys(inc).length === 0) return;

  // 离线模式：走 localStorage 本地统计（本地开发无 Supabase 配置时排行榜也有数据）
  if (isOfflineMode) {
    bumpLocalStats(delta);
    return;
  }

  // 周列与累计列同增量；week_base 过期时由 RPC 原子归零重计
  // 注意：RPC 参数名带 p_ 前缀（见 src/supabase/types.ts Functions），名字不匹配会被静默忽略 → 统计恒为 0
  const week = {
    p_week_treasures: inc.treasures ?? 0,
    p_week_digs: inc.digs ?? 0,
    p_week_chats: inc.chats ?? 0,
  };

  try {
    if (opts.isGuest || !opts.userId) {
      const deviceId = getDeviceId();
      await supabase.rpc("bump_guest_stats", {
        p_device: deviceId,
        p_treasures: inc.treasures ?? 0,
        p_digs: inc.digs ?? 0,
        p_chats: inc.chats ?? 0,
        ...week,
        p_week_base: mondayOf(new Date()),
      });
    } else {
      await supabase.rpc("bump_user_stats", {
        p_username: opts.username ?? "",
        p_treasures: inc.treasures ?? 0,
        p_digs: inc.digs ?? 0,
        p_chats: inc.chats ?? 0,
        ...week,
        p_week_base: mondayOf(new Date()),
      });
    }
  } catch {
    /* 统计失败不影响使用 */
  }
}

/** 修改显示昵称（仅本人行）；返回是否成功 */
export async function updateNickname(nick: string): Promise<{ ok: boolean; message?: string }> {
  const name = nick.trim().slice(0, 16);
  if (name.length < 1) return { ok: false, message: translate(readLang(), "err.nickEmpty") };

  // 离线模式：改本地统计行的昵称
  if (isOfflineMode) {
    const row = readLocalStats();
    if (row) {
      row.display_name = name;
      writeLocalStats(row);
      return { ok: true };
    }
    // 还没有统计行也允许先占位昵称
    bumpLocalStats({});
    const fresh = readLocalStats();
    if (fresh) {
      fresh.display_name = name;
      writeLocalStats(fresh);
    }
    return { ok: true };
  }
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (uid) {
      const { error } = await supabase.from("user_stats").update({ display_name: name }).eq("user_id", uid);
      if (error) return { ok: false, message: translate(readLang(), "err.nickSave") };
      return { ok: true };
    }
    const deviceId = getDeviceId();
    const { error } = await supabase.from("guest_stats").update({ display_name: name }).eq("device_id", deviceId);
    if (error) return { ok: false, message: translate(readLang(), "err.nickSave") };
    return { ok: true };
  } catch {
    return { ok: false, message: translate(readLang(), "err.network") };
  }
}

/** 拉取双榜（合并排序用）；两张表 RLS 均为公开可读 */
export async function fetchLeaderboard(): Promise<{ users: StatRow[]; guests: StatRow[] }> {
  // 离线模式：本地统计行作为访客榜（users 恒为空，登录/云同步未接入）
  if (isOfflineMode) {
    const row = readLocalStats();
    const guests: StatRow[] = row && (row.treasures > 0 || row.chats > 0)
      ? [{
          key: `g:${row.device_id}`,
          name: row.display_name?.trim() || guestName(row.device_id),
          treasures: row.treasures,
          digs: row.digs,
          chats: row.chats,
          weekTreasures: row.week_treasures,
          weekDigs: row.week_digs,
          weekChats: row.week_chats,
          updated_at: row.updated_at,
          isGuest: true,
        }]
      : [];
    return { users: [], guests };
  }
  const [u, g] = await Promise.all([
    supabase
      .from("user_stats")
      .select("user_id,username,display_name,treasures,digs,chats,week_treasures,week_digs,week_chats,updated_at")
      .order("treasures", { ascending: false })
      .limit(50),
    supabase
      .from("guest_stats")
      .select("device_id,nickname,display_name,treasures,digs,chats,week_treasures,week_digs,week_chats,updated_at")
      .order("treasures", { ascending: false })
      .limit(50),
  ]);
  const users: StatRow[] = (u.data ?? []).map((r) => ({
    key: `u:${String(r.user_id)}`,
    name: String(r.display_name ?? "").trim() || String(r.username ?? "").split("@")[0] || String(r.user_id).slice(0, 8),
    treasures: Number(r.treasures ?? 0),
    digs: Number(r.digs ?? 0),
    chats: Number(r.chats ?? 0),
    weekTreasures: Number(r.week_treasures ?? 0),
    weekDigs: Number(r.week_digs ?? 0),
    weekChats: Number(r.week_chats ?? 0),
    updated_at: String(r.updated_at ?? ""),
    isGuest: false,
  }));
  const guests: StatRow[] = (g.data ?? []).map((r) => ({
    key: `g:${String(r.device_id)}`,
    name:
      String(r.display_name ?? "").trim() ||
      String(r.nickname ?? "").trim() ||
      guestName(String(r.device_id)),
    treasures: Number(r.treasures ?? 0),
    digs: Number(r.digs ?? 0),
    chats: Number(r.chats ?? 0),
    weekTreasures: Number(r.week_treasures ?? 0),
    weekDigs: Number(r.week_digs ?? 0),
    weekChats: Number(r.week_chats ?? 0),
    updated_at: String(r.updated_at ?? ""),
    isGuest: true,
  }));
  return { users, guests };
}

/** 当前访客设备的 device_id（用于在榜单里高亮"我"） */
export function myGuestKey(): string {
  return `g:${getDeviceId()}`;
}
