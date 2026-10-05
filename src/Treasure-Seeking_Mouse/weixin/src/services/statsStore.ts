// 【小程序版】挖宝统计（排行榜数据源）
//
// 网页版双路：登录走 Supabase user_stats、访客走 guest_stats；小程序版暂无云端账号，
// 本机统计即榜单唯一数据源（等价于网页版的「离线模式」分支），字段语义保持一致，
// 便于日后接后端时无缝替换。
import { getDeviceId, getJSON, setJSON } from "./device";
import { readLang, translate } from "@/i18n";

export interface StatRow {
  key: string;
  name: string;
  treasures: number;
  digs: number;
  chats: number;
  weekTreasures: number;
  weekDigs: number;
  weekChats: number;
  updated_at: string;
  isGuest: boolean;
}

interface LocalStats {
  device_id: string;
  display_name?: string;
  treasures: number;
  digs: number;
  chats: number;
  week_treasures: number;
  week_digs: number;
  week_chats: number;
  week_base?: string;
  updated_at: string;
}

const KEY_LOCAL_STATS = "seqout-local-stats";

/** 本周一的 YYYY-MM-DD（跨周归零的基准） */
function mondayOf(d: Date): string {
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7; // 周一=0
  t.setDate(t.getDate() - day);
  return t.toISOString().slice(0, 10);
}

function readLocalStats(): LocalStats | null {
  const row = getJSON<LocalStats>(KEY_LOCAL_STATS);
  if (!row) return null;
  // 跨周归零：week_base 不是本周一就把周列清零
  const thisMonday = mondayOf(new Date());
  if (row.week_base !== thisMonday) {
    row.week_treasures = 0;
    row.week_digs = 0;
    row.week_chats = 0;
    row.week_base = thisMonday;
    writeLocalStats(row);
  }
  return row;
}

function writeLocalStats(row: LocalStats): void {
  setJSON(KEY_LOCAL_STATS, row);
}

/** 本机统计累加（treasures=出土卡片数、digs=工具回合数、chats=每轮+1） */
export function bumpLocalStats(inc: { treasures?: number; digs?: number; chats?: number }): void {
  const deviceId = getDeviceId();
  const row: LocalStats = readLocalStats() ?? {
    device_id: deviceId,
    treasures: 0,
    digs: 0,
    chats: 0,
    week_treasures: 0,
    week_digs: 0,
    week_chats: 0,
    week_base: mondayOf(new Date()),
    updated_at: new Date().toISOString(),
  };
  row.treasures += inc.treasures ?? 0;
  row.digs += inc.digs ?? 0;
  row.chats += inc.chats ?? 0;
  row.week_treasures += inc.treasures ?? 0;
  row.week_digs += inc.digs ?? 0;
  row.week_chats += inc.chats ?? 0;
  row.week_base = mondayOf(new Date());
  row.updated_at = new Date().toISOString();
  writeLocalStats(row);
}

/** 排行榜上报（对齐网页版 bumpStats 签名；小程序恒为访客身份） */
export async function bumpStats(inc: { treasures: number; digs: number; chats: number }): Promise<void> {
  try {
    bumpLocalStats(inc);
  } catch {
    /* 统计失败不影响使用 */
  }
}

/** 修改显示昵称；返回是否成功 */
export async function updateNickname(nick: string): Promise<{ ok: boolean; message?: string }> {
  const name = nick.trim().slice(0, 16);
  if (name.length < 1) return { ok: false, message: translate(readLang(), "err.nickEmpty") };
  const row = readLocalStats();
  if (row) {
    row.display_name = name;
    writeLocalStats(row);
    return { ok: true };
  }
  bumpLocalStats({});
  const fresh = readLocalStats();
  if (fresh) {
    fresh.display_name = name;
    writeLocalStats(fresh);
  }
  return { ok: true };
}

/** 拉取榜单：本机统计即访客榜（登录榜暂空，待接后端） */
export async function fetchLeaderboard(): Promise<{ users: StatRow[]; guests: StatRow[] }> {
  const row = readLocalStats();
  const guests: StatRow[] =
    row && (row.treasures > 0 || row.chats > 0)
      ? [
          {
            key: `g:${row.device_id}`,
            name: row.display_name?.trim() || translate(readLang(), "board.guestName", { n: row.device_id.slice(-4) }),
            treasures: row.treasures,
            digs: row.digs,
            chats: row.chats,
            weekTreasures: row.week_treasures,
            weekDigs: row.week_digs,
            weekChats: row.week_chats,
            updated_at: row.updated_at,
            isGuest: true,
          },
        ]
      : [];
  return { users: [], guests };
}

/** 当前访客设备在榜单里的 key（用于高亮「我」） */
export function myGuestKey(): string {
  return `g:${getDeviceId()}`;
}
