// 左侧会话栏：品牌头 / 新对话 CTA / 历史列表 / 重命名 / 删除 /
// 底部「视觉模式 + 界面语言」分段开关与用户行（登录态/游客态）
import { useCallback, useState } from "react";
import { LogIn, LogOut, MessageSquare, Moon, Pencil, Plus, Sun, Trash2, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useIsTouch } from "@/hooks/use-touch";
import { useI18n } from "@/i18n/provider";
import { readTheme, writeTheme, applyTheme, type Theme } from "@/services/petStore";
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
  const { t, lang, toggleLang } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const isTouch = useIsTouch();
  // 视觉模式分段开关：与对话页同一套存储/应用逻辑
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const apply = useCallback((next: Theme) => {
    writeTheme(next);
    applyTheme(next);
    setTheme(next);
  }, []);
  // 分段开关的选项样式（激活态高亮卡片底 + helix 描边）
  const segCls = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11.5px] transition-colors ${
      active ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-helix/25" : "text-muted-foreground hover:text-foreground"
    }`;

  function commitRename(id: string): void {
    const t = draft.trim();
    if (t) onRename(id, t);
    setEditingId(null);
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-pet-gold-soft shadow-sm ring-1 ring-pet-amber/30">
          <BrandMark size={30} />
        </span>
        <div className="min-w-0">
          <p className="font-display truncate text-[16px] font-semibold tracking-tight">{t("brand.name")}</p>
          <p className="truncate text-[11px] text-muted-foreground">{t("brand.tagline")}</p>
        </div>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-helix/30 bg-helix-soft/60 px-3 py-2.5 text-[13px] font-medium text-helix shadow-sm transition-all hover:bg-helix-soft hover:ring-1 hover:ring-helix/30 active:scale-[0.98]"
        >
          <Plus size={15} /> {t("sidebar.newChat")}
          <span className="text-muted-foreground/80">·</span>
          <span className="font-normal text-muted-foreground">{t("sidebar.compass")}</span>
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

      <div className="space-y-3 border-t border-border px-3 py-3">
        {/* 视觉模式：白昼 / 夜探矿洞 分段开关 */}
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">{t("sidebar.visualMode")}</p>
          <div className="flex rounded-lg border border-border bg-background/60 p-0.5">
            <button type="button" onClick={() => apply("light")} className={segCls(theme !== "dark")}>
              <Sun size={12} /> {t("sidebar.day")}
            </button>
            <button type="button" onClick={() => apply("dark")} className={segCls(theme === "dark")}>
              <Moon size={12} /> {t("sidebar.night")}
            </button>
          </div>
        </div>
        {/* 界面语言：中文 / EN 分段开关（两个词互相翻译，固定文案无需 i18n） */}
        <div>
          <p className="mb-1.5 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">{t("sidebar.uiLang")}</p>
          <div className="flex rounded-lg border border-border bg-background/60 p-0.5">
            <button type="button" onClick={() => lang !== "zh" && toggleLang()} className={segCls(lang === "zh")}>
              中文
            </button>
            <button type="button" onClick={() => lang !== "en" && toggleLang()} className={segCls(lang === "en")}>
              EN
            </button>
          </div>
        </div>

        {userLabel ? (
          <div className="flex items-center justify-between gap-2 pt-1">
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-foreground transition-colors hover:border-helix/50 hover:text-helix"
          >
            <LogIn size={13} /> {t("sidebar.guestContinue")}
          </button>
        ) : null}
        {!userLabel && storageNote ? (
          <p className="border-t border-border/60 pt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">{storageNote}</p>
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
