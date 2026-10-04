// 排行榜统计：登录用户走 user_stats（auth.uid 本人可写），访客走 guest_stats（匿名设备指纹）
// 所有写入均为 fire-and-forget，失败静默，绝不打断对话主流程。
import { supabase } from "@/supabase/client";

const KEY_DEVICE = "seqout-device-id";
const DEVICE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

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

  // 周列与累计列同增量；week_base 过期时由 RPC 原子归零重计
  const week: Record<string, number> = {
    week_treasures: inc.treasures ?? 0,
    week_digs: inc.digs ?? 0,
    week_chats: inc.chats ?? 0,
  };

  try {
    if (opts.isGuest || !opts.userId) {
      const deviceId = getDeviceId();
      await supabase.rpc("bump_guest_stats", {
        p_device: deviceId,
        ...inc,
        ...week,
        p_week_base: mondayOf(new Date()),
      });
    } else {
      await supabase.rpc("bump_user_stats", {
        p_username: opts.username ?? "",
        ...inc,
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
  if (name.length < 1) return { ok: false, message: "昵称不能为空" };
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (uid) {
      const { error } = await supabase.from("user_stats").update({ display_name: name }).eq("user_id", uid);
      if (error) return { ok: false, message: "保存失败，请重试" };
      return { ok: true };
    }
    const deviceId = getDeviceId();
    const { error } = await supabase.from("guest_stats").update({ display_name: name }).eq("device_id", deviceId);
    if (error) return { ok: false, message: "保存失败，请重试" };
    return { ok: true };
  } catch {
    return { ok: false, message: "网络异常，请稍后再试" };
  }
}

/** 拉取双榜（合并排序用）；两张表 RLS 均为公开可读 */
export async function fetchLeaderboard(): Promise<{ users: StatRow[]; guests: StatRow[] }> {
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
      `游客${String(r.device_id).slice(-4)}`,
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
