// 左侧会话栏：新建 / 历史列表 / 重命名 / 删除 / 登录入口
import { useState } from "react";
import { LogIn, LogOut, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useIsTouch } from "@/hooks/use-touch";
import { useI18n } from "@/i18n/provider";
import type { SessionRow } from "@/services/chatStore";

export function SessionSidebar({
  sessions,
  activeId,
  userLabel,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onLogin,
  onLogout,
  storageNote,
}: {
  sessions: SessionRow[];
  activeId: string | null;
  userLabel: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onLogin?: () => void;
  onLogout: () => void;
  storageNote?: string; // 游客存储策略提示（未登录时展示在侧栏底部）
}): React.ReactElement {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const isTouch = useIsTouch();

  function commitRename(id: string): void {
    const t = draft.trim();
    if (t) onRename(id, t);
    setEditingId(null);
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pet-gold-soft text-pet-amber-deep shadow-sm ring-1 ring-pet-amber/30">
          <BrandMark size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-display truncate text-[15px] font-semibold tracking-tight">{t("brand.name")}</p>
          <p className="text-[11px] font-mono text-muted-foreground">{t("brand.tagline")}</p>
        </div>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-all hover:border-helix/40 hover:bg-accent hover:text-helix active:scale-[0.98]"
        >
          <Plus size={14} /> {t("sidebar.newChat")}
        </button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <p className="mt-6 text-center text-xs text-muted-foreground/70">{t("sidebar.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <div
                  className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                    s.id === activeId
                      ? "bg-card text-foreground shadow-sm ring-1 ring-helix/25"
                      : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                  }`}
                >
                  <MessageSquare size={13} className="shrink-0 opacity-60" />
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(s.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={40}
                      className="min-w-0 flex-1 rounded border border-helix/50 bg-background px-1.5 py-0.5 text-[13px] outline-none"
                    />
                  ) : (
                    <button type="button" onClick={() => onSelect(s.id)} className="min-w-0 flex-1 truncate text-left">
                      {s.title}
                    </button>
                  )}
                  <span className={`${isTouch ? "flex" : "hidden group-hover:flex"} shrink-0 items-center gap-1`}>
                    <button
                      type="button"
                      title={t("sidebar.rename")}
                      onClick={() => {
                        setEditingId(s.id);
                        setDraft(s.title);
                      }}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      title={t("sidebar.delete")}
                      onClick={() => onDelete(s.id)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-3 py-3">
        {userLabel ? (
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground" title={userLabel}>
              {userLabel}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
            >
              <LogOut size={12} /> {t("sidebar.logout")}
            </button>
          </div>
        ) : onLogin ? (
          <button
            type="button"
            onClick={onLogin}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground transition-colors hover:border-helix/50 hover:text-helix"
          >
            <LogIn size={14} /> {t("sidebar.login")}
          </button>
        ) : null}
        {!userLabel && storageNote ? (
          <p className="mt-2.5 border-t border-border/60 pt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
            {storageNote}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export function MobileDrawerHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <span className="text-sm font-semibold">{t("sidebar.listTitle")}</span>
      <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
    </div>
  );
}
