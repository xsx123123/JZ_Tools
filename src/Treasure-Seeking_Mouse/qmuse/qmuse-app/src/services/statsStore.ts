// 排行榜统计：登录用户走前端 RMW 写 user_stats，访客按设备指纹走 seqout-chat 云函数 action 写 guest_stats
// 所有写入均为 fire-and-forget，失败静默，绝不打断对话主流程。
import {
  createQmuseRow,
  executeQmuseFunction,
  getQmusePlatformUserId,
  listQmuseRows,
  Query,
  updateQmuseRow,
  type Models,
} from "./appwrite";

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

interface UserStatsRow extends Models.Row {
  user_id: string;
  username?: string | null;
  display_name?: string | null;
  treasures?: number | null;
  digs?: number | null;
  chats?: number | null;
  week_treasures?: number | null;
  week_digs?: number | null;
  week_chats?: number | null;
  week_base?: string | null;
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

/** 一次挖宝回合结束后累加统计（累计 + 本周双轨）；isGuest=true 时按 device_id 经云函数 upsert 访客表 */
export async function bumpStats(
  delta: StatDelta,
  opts: { isGuest: boolean; userId?: string; username?: string },
): Promise<void> {
  const inc: Record<string, number> = {};
  if (delta.treasures) inc.treasures = delta.treasures;
  if (delta.digs) inc.digs = delta.digs;
  if (delta.chats) inc.chats = delta.chats;
  if (Object.keys(inc).length === 0) return;

  const weekBase = mondayOf(new Date());

  try {
    if (opts.isGuest || !opts.userId) {
      const body = JSON.stringify({
        action: "bump_guest",
        device: getDeviceId(),
        treasures: delta.treasures,
        digs: delta.digs,
        chats: delta.chats,
        week_base: weekBase,
        display_name: opts.username || undefined,
      });
      await executeQmuseFunction({ functionId: "seqout-chat", body });
    } else {
      // 前端 RMW：先查本人行，无则建、有则叠加（week_base 过期先清零周列）
      const res = await listQmuseRows<UserStatsRow>({
        tableId: "user_stats",
        queries: [Query.equal("user_id", opts.userId)],
        limit: 20,
      });
      const row = res.rows[0];
      if (!row) {
        await createQmuseRow<UserStatsRow>({
          tableId: "user_stats",
          data: {
            user_id: opts.userId,
            username: opts.username ?? "",
            treasures: inc.treasures ?? 0,
            digs: inc.digs ?? 0,
            chats: inc.chats ?? 0,
            week_treasures: inc.treasures ?? 0,
            week_digs: inc.digs ?? 0,
            week_chats: inc.chats ?? 0,
            week_base: weekBase,
          },
        });
      } else {
        const sameWeek = row.week_base === weekBase;
        await updateQmuseRow<UserStatsRow>({
          tableId: "user_stats",
          rowId: row.$id,
          data: {
            treasures: Number(row.treasures ?? 0) + (inc.treasures ?? 0),
            digs: Number(row.digs ?? 0) + (inc.digs ?? 0),
            chats: Number(row.chats ?? 0) + (inc.chats ?? 0),
            week_treasures: (sameWeek ? Number(row.week_treasures ?? 0) : 0) + (inc.treasures ?? 0),
            week_digs: (sameWeek ? Number(row.week_digs ?? 0) : 0) + (inc.digs ?? 0),
            week_chats: (sameWeek ? Number(row.week_chats ?? 0) : 0) + (inc.chats ?? 0),
            week_base: weekBase,
          },
        });
      }
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
    const userId = getQmusePlatformUserId();
    if (userId) {
      const res = await listQmuseRows<UserStatsRow>({
        tableId: "user_stats",
        queries: [Query.equal("user_id", userId)],
        limit: 20,
      });
      const row = res.rows[0];
      if (!row) {
        await createQmuseRow<UserStatsRow>({
          tableId: "user_stats",
          data: { user_id: userId, username: "", display_name: name, week_base: mondayOf(new Date()) },
        });
      } else {
        await updateQmuseRow<UserStatsRow>({
          tableId: "user_stats",
          rowId: row.$id,
          data: { display_name: name },
        });
      }
      return { ok: true };
    }
    const body = JSON.stringify({
      action: "set_guest_name",
      device: getDeviceId(),
      display_name: name,
    });
    await executeQmuseFunction({ functionId: "seqout-chat", body });
    return { ok: true };
  } catch {
    return { ok: false, message: "网络异常，请稍后再试" };
  }
}

/** 拉取双榜（云函数聚合，行已映射为 StatRow 形状） */
export async function fetchLeaderboard(): Promise<{ users: StatRow[]; guests: StatRow[] }> {
  const execution = await executeQmuseFunction({
    functionId: "seqout-chat",
    body: JSON.stringify({ action: "leaderboard" }),
  });
  const parsed = JSON.parse(execution.responseBody ?? "{}") as {
    users?: StatRow[];
    guests?: StatRow[];
  };
  return { users: parsed.users ?? [], guests: parsed.guests ?? [] };
}

/** 当前访客设备的 device_id（用于在榜单里高亮"我"） */
export function myGuestKey(): string {
  return `g:${getDeviceId()}`;
}
