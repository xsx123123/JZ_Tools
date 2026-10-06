// 挖宝排行榜：登录用户榜 + 访客榜；支持「本周 / 累计」时间维度切换与自定义显示昵称
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, RefreshCw, Sparkles, Trophy, X } from "lucide-react";
import { fetchLeaderboard, myGuestKey, updateNickname, type StatRow } from "@/services/statsStore";
import { useI18n } from "@/i18n/provider";
import type { TFunc } from "@/i18n";

type BoardTab = "diggers" | "guests";
type Range = "week" | "all";

interface LeaderboardProps {
  open: boolean;
  onClose: () => void;
  /** 当前登录用户 id（未登录传 null），用于在寻宝鼠榜高亮"我"并提供改名入口 */
  ownUserId?: string | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function metricOf(row: StatRow, range: Range) {
  return range === "week"
    ? { treasures: row.weekTreasures, digs: row.weekDigs, chats: row.weekChats }
    : { treasures: row.treasures, digs: row.digs, chats: row.chats };
}

function sortRows(rows: StatRow[], range: Range): StatRow[] {
  return [...rows].sort((a, b) => {
    const ma = metricOf(a, range);
    const mb = metricOf(b, range);
    if (mb.treasures !== ma.treasures) return mb.treasures - ma.treasures;
    if (mb.chats !== ma.chats) return mb.chats - ma.chats;
    return mb.digs - ma.digs;
  });
}

function fmtTime(t: TFunc, iso: string): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60_000) return t("board.justNow");
  if (diff < 3_600_000) return t("board.minutesAgo", { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("board.hoursAgo", { n: Math.floor(diff / 3_600_000) });
  if (diff < 7 * 86_400_000) return t("board.daysAgo", { n: Math.floor(diff / 86_400_000) });
  return new Date(time).toLocaleDateString();
}

function RankRow({
  row,
  rank,
  highlight,
  range,
  editing,
  onStartEdit,
}: {
  row: StatRow;
  rank: number;
  highlight: boolean;
  range: Range;
  editing: boolean;
  onStartEdit: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const m = metricOf(row, range);
  const top3 = rank <= 3;
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        highlight
          ? "border-pet-amber/40 bg-pet-gold-soft/60"
          : "border-transparent hover:border-border hover:bg-secondary/50"
      }`}
    >
      <span
        className={`w-7 shrink-0 text-center font-mono text-[13px] tabular-nums ${
          top3 ? "text-base" : "text-muted-foreground"
        }`}
        aria-label={t("board.rankAria", { n: rank })}
      >
        {top3 ? MEDALS[rank - 1] : rank}
      </span>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ring-1 ${
          row.isGuest
            ? "bg-helix-soft text-helix ring-helix/20"
            : "bg-pet-gold-soft text-pet-amber-deep ring-pet-amber/25"
        }`}
        aria-hidden
      >
        {row.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block min-w-0 truncate text-[13px] font-medium tracking-tight text-foreground">
            {row.name}
          </span>
          {highlight ? (
            <span className="shrink-0 rounded-full bg-pet-amber/15 px-1.5 py-0.5 font-mono text-[9.5px] text-pet-amber-deep">
              {t("board.me")}
            </span>
          ) : null}
          {editing ? (
            <button
              type="button"
              onClick={onStartEdit}
              title={t("board.editNick")}
              aria-label={t("board.editNick")}
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-helix"
            >
              <Pencil size={12} />
            </button>
          ) : null}
        </span>
        <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
          {t("board.rowMeta", { chats: m.chats, digs: m.digs })}
          {row.updated_at ? ` · ${fmtTime(t, row.updated_at)}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="flex items-center gap-1 font-mono text-[14px] font-semibold tabular-nums text-pet-amber-deep">
          <Sparkles size={12} className="text-pet-amber" />
          {m.treasures}
        </span>
        <span className="block font-mono text-[9.5px] text-muted-foreground">{t("board.treasures")}</span>
      </span>
    </li>
  );
}

export function Leaderboard({ open, onClose, ownUserId }: LeaderboardProps): React.ReactElement | null {
  const { t, lang } = useI18n();
  // 默认页签：登录（含自托管本地账号）优先「寻宝鼠」榜，纯游客看「临时矿工」榜
  const [tab, setTab] = useState<BoardTab>(ownUserId ? "diggers" : "guests");
  const [range, setRange] = useState<Range>("all");
  const [users, setUsers] = useState<StatRow[]>([]);
  const [guests, setGuests] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nickOpen, setNickOpen] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const [nickSaving, setNickSaving] = useState(false);
  const [nickMsg, setNickMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetchLeaderboard();
      setUsers(r.users);
      setGuests(r.guests);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        if (nickOpen) setNickOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, nickOpen]);

  const selfKey = ownUserId ? `u:${ownUserId}` : myGuestKey();
  // 「我」的行：登录态优先匹配 user 榜（index.tsx 传入的 ownUserId），否则匹配访客设备
  const rows = useMemo(() => sortRows(tab === "diggers" ? users : guests, range), [tab, users, guests, range]);
  const totalTreasures = useMemo(
    () =>
      range === "week"
        ? [...users, ...guests].reduce((a, r) => a + r.weekTreasures, 0)
        : [...users, ...guests].reduce((a, r) => a + r.treasures, 0),
    [users, guests, range],
  );

  async function saveNickname(): Promise<void> {
    const name = nickDraft.trim().slice(0, 16);
    if (!name) {
      setNickMsg(t("board.nickEmpty"));
      return;
    }
    setNickSaving(true);
    setNickMsg(null);
    const res = await updateNickname(name);
    setNickSaving(false);
    if (res.ok) {
      setNickOpen(false);
      void load();
    } else {
      setNickMsg(res.message ?? t("board.saveFailed"));
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("board.title")}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="shadow-soft-lg relative flex h-full w-full max-w-[420px] flex-col border-l border-border bg-card">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-border bg-panel/70 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pet-gold-soft text-pet-amber-deep ring-1 ring-pet-amber/25">
            <Trophy size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{t("board.title")}</h2>
            <p className="font-mono text-[10.5px] text-muted-foreground">
              {t(range === "week" ? "board.subtitleWeek" : "board.subtitleAll", { n: totalTreasures })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            title={t("board.refresh")}
            aria-label={t("board.refresh")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("board.close")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tab + 时间维度 */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="flex gap-1">
            {(
              [
                { id: "diggers", label: t("board.tabDiggers") },
                { id: "guests", label: t("board.tabGuests") },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setTab(tabItem.id)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium tracking-tight transition-colors ${
                  tab === tabItem.id
                    ? "bg-helix-soft text-helix ring-1 ring-helix/25"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
            {(
              [
                { id: "week", label: t("board.rangeWeek") },
                { id: "all", label: t("board.rangeAll") },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  range === r.id
                    ? "bg-card text-pet-amber-deep shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* 我的昵称行 */}
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={() => {
              const me = rows.find((r) => r.key === selfKey);
              setNickDraft(me?.name ?? "");
              setNickMsg(null);
              setNickOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left transition-colors hover:border-helix/40 hover:bg-helix-soft/40"
          >
            <Pencil size={13} className="shrink-0 text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">{t("board.setNickname")}</span>
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
          {error ? (
            <div className="mt-10 text-center">
              <p className="text-[13px] text-muted-foreground">{t("board.loadFailed")}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-lg bg-helix-soft px-3 py-1.5 text-[12.5px] text-helix ring-1 ring-helix/25 transition-colors hover:bg-helix/10"
              >
                {t("board.retry")}
              </button>
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="mt-16 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[13px]">{t("board.loading")}</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-16 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pet-gold-soft text-pet-amber-deep ring-1 ring-pet-amber/25">
                <Trophy size={22} />
              </span>
              <p className="mt-3 text-[13px] font-medium text-foreground">
                {t(range === "week" ? "board.emptyWeek" : "board.emptyAll")}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t(tab === "diggers" ? "board.emptyDiggersHint" : "board.emptyGuestsHint")}
              </p>
            </div>
          ) : (
            <ol className="space-y-1">
              {rows.map((r, i) => (
                <RankRow
                  key={r.key}
                  row={r}
                  rank={i + 1}
                  range={range}
                  highlight={r.key === selfKey}
                  editing={r.key === selfKey}
                  onStartEdit={() => {
                    setNickDraft(r.name);
                    setNickMsg(null);
                    setNickOpen(true);
                  }}
                />
              ))}
            </ol>
          )}
        </div>

        {/* 脚注 */}
        <div className="border-t border-border px-4 py-2.5">
          <p className="font-mono text-[10px] text-muted-foreground">
            {t("board.sortNote", { range: t(range === "week" ? "board.rangeWeek" : "board.rangeAll") })}
          </p>
        </div>
      </div>

      {/* 昵称编辑浮层 */}
      {nickOpen ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/30" onClick={() => setNickOpen(false)} />
          <div className="shadow-soft-lg relative w-full max-w-[320px] rounded-2xl border border-border bg-card p-5">
            <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{t("board.nickTitle")}</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">{t("board.nickDesc")}</p>
            <input
              autoFocus
              value={nickDraft}
              maxLength={16}
              onChange={(e) => setNickDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveNickname();
              }}
              placeholder={t("board.nickPlaceholder")}
              className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-helix/50"
            />
            {nickMsg ? <p className="mt-1.5 font-mono text-[11px] text-destructive">{nickMsg}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNickOpen(false)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {t("board.cancel")}
              </button>
              <button
                type="button"
                disabled={nickSaving}
                onClick={() => void saveNickname()}
                className="flex items-center gap-1.5 rounded-lg bg-helix px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {nickSaving ? <Loader2 size={13} className="animate-spin" /> : null}
                {t("board.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
