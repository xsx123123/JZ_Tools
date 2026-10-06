// GEO寻宝鼠：主页（会话栏 + 对话区 + 登录弹窗 + 桌宠）
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, Info, Menu, Moon, Sun, BarChart3, PawPrint, Trophy } from "lucide-react";
import { supabase, isOfflineMode } from "@/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { EmptyState } from "@/components/chat/EmptyState";
import { ChatMessage, type ChatUIMessage } from "@/components/chat/ChatMessage";
import { Composer } from "@/components/chat/Composer";
import { SessionSidebar, MobileDrawerHeader } from "@/components/chat/SessionSidebar";
import { BrandMark } from "@/components/BrandMark";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { TreasureMouse, makePetEvent, type PetEvent } from "@/components/pet/TreasureMouse";
import { PetSettingsPanel } from "@/components/pet/PetSettingsPanel";
import { onHintShown, onHintDismissed } from "@/lib/hintBus";
import { useIsTouch } from "@/hooks/use-touch";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { readTheme, writeTheme, applyTheme, type Theme } from "@/services/petStore";
import { bumpStats, mergeLocalStatsToAccount } from "@/services/statsStore";
import {
  localMe,
  localLogout,
  pullServerHistory,
  pushServerHistory,
  readLocalUser,
  type LocalUser,
} from "@/services/localAuth";
import { Leaderboard } from "@/components/chat/Leaderboard";
import { UsageStatsDialog } from "@/components/chat/UsageStatsDialog";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n/provider";

import { fetchModelCatalog, requestSeqoutChat, type DatasetCard, type ToolLog } from "@/services/seqoutChat";
import {
  createSession,
  deleteSession,
  insertMessage,
  listMessages,
  listSessions,
  renameSession,
  touchSession,
  type SessionRow,
} from "@/services/chatStore";

export const Route = createFileRoute("/")({
  component: ChatPage,
});

const FALLBACK_MODEL = "qwen3.8-flash";
const LOCAL_SESSION_KEY = "seqout-local-session";
const RAIL_COLLAPSED_KEY = "seqout-sidebar-collapsed"; // '1' = 收起（默认），'0' = 展开
const GUEST_MAX_SESSIONS = 50; // 游客（未登录）最多保留的会话条数
const GUEST_KEEP_DAYS = 7; // 游客会话最后活跃后保留天数

interface LocalSession {
  id: string;
  title: string;
  messages: ChatUIMessage[];
  ts: number; // 最后活跃时间（ms），用于 7 天过期清理
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readLocalSessions(): LocalSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (LocalSession & { ts?: number })[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - GUEST_KEEP_DAYS * 24 * 3600 * 1000;
    return parsed
      .map((s) => ({ ...s, ts: typeof s.ts === "number" ? s.ts : Date.now() })) // 旧数据补时间戳
      .filter((s) => s.ts >= cutoff) // 仅保留最近 7 天有活跃的会话
      .slice(-GUEST_MAX_SESSIONS);
  } catch {
    return [];
  }
}

function writeLocalSessions(list: LocalSession[]): void {
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(list.slice(-GUEST_MAX_SESSIONS)));
  } catch {
    /* 容量满时静默丢弃 */
  }
}

function ChatPage(): React.ReactElement {
  // 软键盘适配：写入 --vvh，根容器据此收缩（见 use-visual-viewport.ts）
  useVisualViewport();
  const { t, lang } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // null = 本地临时会话
  const [localId, setLocalId] = useState<string>(() => uid());
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<string[]>([FALLBACK_MODEL]);
  const [model, setModel] = useState(FALLBACK_MODEL);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      writeTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);
  const [petEvent, setPetEvent] = useState<PetEvent | null>(null); // 桌宠事件流（仅 UI 反馈，不影响消息逻辑）
  const [petPanelOpen, setPetPanelOpen] = useState(false); // 顶栏「阿寻设置」弹层：找回阿寻 / 大小 / 常驻
  // 编号发现提示 ⇆ 桌宠联动：抽签点亮某个编号时让阿寻喊话「那里有宝藏」；
  // 用户悬停/点开该编号（提示消失）时立即收起台词，形成一来一回的对话感
  useEffect(() => {
    const offShown = onHintShown(() => setPetEvent(makePetEvent({ type: "hint" })));
    const offDismiss = onHintDismissed(() => setPetEvent(makePetEvent({ type: "hint_end" })));
    return () => {
      offShown();
      offDismiss();
    };
  }, []);
  const petCardsRef = useRef(0);
  const [boardOpen, setBoardOpen] = useState(false); // 排行榜抽屉
  const [statsOpen, setStatsOpen] = useState(false); // 使用统计弹窗
  const isTouch = useIsTouch();
  const statRef = useRef({ digs: 0, cards: 0 }); // 本轮挖宝统计（下铲次数 / 出土卡片数）
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(RAIL_COLLAPSED_KEY);
      return v === null ? true : v === "1"; // 从未设置过 → 默认收起；否则记住上次选择
    } catch {
      return true;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatUIMessage[]>(messages); // 最新消息快照：异步收尾时读，避免闭包过期
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const catalogOkRef = useRef(false); // 模型目录是否加载成功；失败时发送空模型名，由服务端 LLM_MODEL 兜底，避免前端兜底模型在网关上不存在
  const user = session?.user ?? null;

  // 自托管本地账号（离线模式）：启动用本地缓存立即恢复，再向服务端校验 token
  const [localUser, setLocalUser] = useState<LocalUser | null>(() => (isOfflineMode ? readLocalUser() : null));
  useEffect(() => {
    if (!isOfflineMode) return;
    void localMe().then((u) => {
      if (u) setLocalUser(u);
    });
  }, []);
  /** 有效用户：云端登录优先，其次自托管本地账号；未登录为 null */
  const effUser = user ?? localUser;

  // 模型目录
  useEffect(() => {
    void fetchModelCatalog().then((c) => {
      if (c && c.models.length > 0) {
        catalogOkRef.current = true;
        setModels(c.models);
        const def = c.defaultModel && c.models.includes(c.defaultModel) ? c.defaultModel : c.models[0];
        setModel(def);
      }
    });
  }, []);

  // 认证状态
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // 登录后拉云端会话；未登录时侧栏显示 localStorage 本地会话（一直在保存，此前未展示）
  useEffect(() => {
    if (!user) {
      setSessions([]);
      setActiveId(null);
      return;
    }
    void listSessions()
      .then(setSessions)
      .catch(() => undefined);
  }, [user]);

  // 未登录：本地会话列表状态（localSessions 变化时同步到侧栏）
  const [localSessions, setLocalSessions] = useState<LocalSession[]>(() => readLocalSessions());

  // 本地临时会话持久化（未登录试用）：写 localStorage 并同步侧栏列表
  // 流式期间 messages 每 delta 变一次，直接落盘会全量 JSON 序列化 + 刷新侧栏 → 回答越长越卡；
  // 这里对中间态做 400ms debounce，仅在停止变化（或流结束）后统一落盘
  useEffect(() => {
    if (user) return;
    const timer = setTimeout(() => {
      const list = readLocalSessions();
      const idx = list.findIndex((s) => s.id === localId);
      const entry: LocalSession = {
        id: localId,
        title: messages.find((m) => m.role === "user")?.content.slice(0, 24) ?? "新对话",
        messages,
        ts: Date.now(),
      };
      if (idx >= 0) list[idx] = entry;
      else if (messages.length > 0) list.push(entry);
      writeLocalSessions(list);
      setLocalSessions(list.filter((s) => s.messages.length > 0).reverse()); // 侧栏显示：最近活跃在前
    }, 400);
    return () => clearTimeout(timer);
  }, [user, localId, messages]);

  // 侧栏数据源：登录走云端，未登录走本地
  const displaySessions: SessionRow[] = user
    ? sessions
    : localSessions.map((s) => ({ id: s.id, title: s.title, updated_at: new Date(s.ts).toISOString() }));

  // 自托管本地登录：本地会话仍是消息状态的唯一来源，这里把整份快照防抖同步到服务端账号
  // （localStorage 写入 ⇄ 侧栏刷新都会触发 localSessions 变化，800ms 防抖合并多次落盘）
  useEffect(() => {
    if (!isOfflineMode || !localUser) return;
    const timer = setTimeout(() => {
      void pushServerHistory(readLocalSessions().filter((s) => s.messages.length > 0)).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [localUser, localSessions]);

  // 本地登录成功：合并云端与本机会话（同 id 取较新），并把游客期累计成绩并入账号排行榜
  async function handleLocalAuthSuccess(u: LocalUser): Promise<void> {
    setLocalUser(u);
    setAuthOpen(false);
    try {
      const remote = await pullServerHistory();
      if (remote.length > 0) {
        const local = readLocalSessions();
        const merged = [...remote];
        for (const s of local) {
          const i = merged.findIndex((r) => r.id === s.id);
          if (i >= 0) {
            if ((s.ts ?? 0) > ((merged[i] as LocalSession).ts ?? 0)) merged[i] = s;
          } else {
            merged.push(s);
          }
        }
        writeLocalSessions(merged as LocalSession[]);
        setLocalSessions(merged.filter((s) => (s.messages?.length ?? 0) > 0).reverse() as LocalSession[]);
      }
    } catch {
      /* 服务端历史不可达时保留本地现状 */
    }
    void mergeLocalStatsToAccount();
  }

  // 切换会话时加载消息（登录走云端；未登录走本地会话）
  // 不依赖 localSessions：它被持久化 effect 高频刷新，靠 ref 读取避免流式期间整组 effect 重跑
  const localSessionsRef = useRef<LocalSession[]>(localSessions);
  useEffect(() => {
    localSessionsRef.current = localSessions;
  }, [localSessions]);
  useEffect(() => {
    if (!activeId) return;
    if (!user) {
      const local = localSessionsRef.current.find((s) => s.id === activeId);
      setMessages(local ? local.messages : []);
      return;
    }
    let cancelled = false;
    void listMessages(activeId)
      .then((rows) => {
        if (cancelled) return;
        setMessages(
          rows.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
            cards: r.cards,
            toolLogs: r.tool_logs,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, activeId]);

  // 流式期间每分片一次 smooth scrollIntoView 会互相打断产生抖动：
  // 中间态直接把容器 scrollTop 推到底（auto），仅流结束/消息数变化时平滑滚动
  const lastCountRef = useRef(0);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (streaming) {
      el.scrollTop = el.scrollHeight;
      lastCountRef.current = messages.length;
      return;
    }
    if (messages.length !== lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      lastCountRef.current = messages.length;
    }
  }, [messages, streaming]);

  const startNew = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    if (user) setActiveId(null); // 首条消息发送时再建云端会话
    else setLocalId(uid());
    setDrawerOpen(false);
  }, [streaming, user]);

  const selectSession = useCallback(
    (id: string) => {
      if (streaming) return;
      setActiveId(id);
      setDrawerOpen(false);
    },
    [streaming],
  );

  async function handleSend(text: string, historyOverride?: ChatUIMessage[]): Promise<void> {
    if (streaming) return;
    // historyOverride：重新生成时传入截断后的消息，避免闭包里的全量 messages 把已废弃回答带给模型
    const source = historyOverride ?? messages;
    const history: { role: "user" | "assistant"; content: string }[] = source
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: ChatUIMessage = { id: uid(), role: "user", content: text };
    const asstMsg: ChatUIMessage = { id: uid(), role: "assistant", content: "", streaming: true, liveTools: [] };
    setMessages((prev) => [...prev, userMsg, asstMsg]);

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    let finalCards: DatasetCard[] = [];
    const finalTools: ToolLog[] = [];
    statRef.current = { digs: 0, cards: 0 };
    petCardsRef.current = 0; // 每轮重置：否则开箱动画只在当页第一个回答触发一次

    function patch(fn: (m: ChatUIMessage) => ChatUIMessage): void {
      setMessages((prev) => prev.map((m) => (m.id === asstMsg.id ? fn(m) : m)));
    }

    await requestSeqoutChat(
      [...history, { role: "user", content: text }],
      catalogOkRef.current ? model : "", // 目录加载失败时留空，由服务端 LLM_MODEL 兜底
      {
        onDelta: (t) => patch((m) => ({ ...m, content: m.content + t })),
        onTool: (evt) => {
          if (evt.status === "running") {
            statRef.current.digs += 1;
            setPetEvent(makePetEvent({ type: "tool_start" }));
          }
          patch((m) => {
            const live = [...(m.liveTools ?? [])];
            if (evt.status === "running") live.push({ name: evt.name, label: evt.label, status: "running" });
            else {
              const i = live.findIndex((l) => l.name === evt.name && l.status === "running");
              if (i >= 0) live[i] = { name: evt.name, label: evt.label, status: evt.status, ms: evt.ms };
              else live.push({ name: evt.name, label: evt.label, status: evt.status, ms: evt.ms });
            }
            return { ...m, liveTools: live };
          });
        },
        onCards: (cards) => {
          finalCards = cards;
          if (petCardsRef.current === 0 && cards.length > 0) setPetEvent(makePetEvent({ type: "cards", count: cards.length }));
          petCardsRef.current = Math.max(petCardsRef.current, cards.length);
          patch((m) => ({ ...m, cards }));
        },
        onPolariseq: (accession) => {
          patch((m) => ({ ...m, boost: { accession } }));
        },
        onEnd: (p) => {
          finalCards = p.cards.length > 0 ? p.cards : finalCards;
          finalTools.push(...p.tools);
          statRef.current.cards = Math.max(p.cards.length, petCardsRef.current);
          setPetEvent(makePetEvent({ type: "done", cards: statRef.current.cards }));
        },
        onError: (message) => {
          setPetEvent(makePetEvent({ type: "error" }));
          patch((m) => ({ ...m, error: message }));
        },
      },
      controller.signal,
      lang,
    );

    patch((m) => ({ ...m, streaming: false, liveTools: undefined, toolLogs: finalTools, cards: finalCards }));
    setStreaming(false);
    abortRef.current = null;

    // 排行榜统计上报（fire-and-forget，失败静默）
    void bumpStats(
      { treasures: statRef.current.cards, digs: statRef.current.digs, chats: 1 },
      { isGuest: !effUser, userId: effUser?.id, username: effUser?.email ?? "" },
    );

    // 持久化
    if (user) {
      try {
        let sid = activeId;
        if (!sid) {
          const row = await createSession(user.id, text.slice(0, 30));
          sid = row.id;
          setActiveId(sid);
          setSessions((prev) => [row, ...prev]);
        } else {
          void touchSession(sid);
          setSessions((prev) =>
            prev.map((s) => (s.id === sid ? { ...s, updated_at: new Date().toISOString() } : s)),
          );
        }
        await insertMessage(sid, user.id, { role: "user", content: text });
        // 流已结束，asstMsg 内容即最终值；不在 setState updater 里做网络副作用（StrictMode 下 updater 双调用会重复入库）
        const snapshot = asstMsg;
        const latest = messagesRef.current.find((m) => m.id === snapshot.id);
        if (latest && !latest.error) {
          void insertMessage(sid, user.id, {
            role: "assistant",
            content: latest.content,
            cards: latest.cards ?? null,
            tool_logs: latest.toolLogs ?? null,
          }).catch(() => undefined);
        }
      } catch {
        /* 持久化失败不打断对话，内容仍在内存 */
      }
    }
  }

  async function handleRename(id: string, title: string): Promise<void> {
    try {
      await renameSession(id, title);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    } catch {
      /* ignore */
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!user) {
      // 未登录：删除 localStorage 本地会话
      writeLocalSessions(readLocalSessions().filter((s) => s.id !== id));
      setLocalSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        setLocalId(uid());
      }
      return;
    }
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleLogout(): Promise<void> {
    if (streaming) return;
    if (isOfflineMode) {
      // 自托管账号：服务端无状态会话，清本地 token 即登出；本机聊天记录保留在 localStorage
      localLogout();
      setLocalUser(null);
      setMessages([]);
      setActiveId(null);
      setLocalId(uid());
      return;
    }
    await supabase.auth.signOut();
    setMessages([]);
    setActiveId(null);
    setLocalId(uid());
  }

  /** 重新挖一次：截断到该助手消息之前，用其前最近一条用户提问 + 截断后的历史重发 */
  function handleRegenerate(id: string): void {
    if (streaming) return;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    let q: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        q = messages[i].content;
        break;
      }
    }
    if (!q) return;
    const truncated = messages.slice(0, idx);
    setMessages(truncated);
    void handleSend(q, truncated);
  }

  const sidebar = (
    <SessionSidebar
      sessions={displaySessions}
      activeId={activeId}
      userLabel={user ? (user.email ?? user.id.slice(0, 8)) : (localUser?.email ?? null)}
      onSelect={selectSession}
      onNew={startNew}
      onRename={handleRename}
      onDelete={handleDelete}
      onLogin={() => setAuthOpen(true)}
      onGuestTry={() => {
        setDrawerOpen(false);
        setCollapsed(true);
      }}
      onLogout={handleLogout}
      storageNote={
        user
          ? undefined
          : t("sidebar.guestNote", {
              n: GUEST_MAX_SESSIONS,
              d: GUEST_KEEP_DAYS,
              loginSuffix: t("sidebar.guestNoteLogin"),
            })
      }
    />
  );

  return (
    <div
      className="bg-grid touch-clean flex overflow-hidden"
      style={{ height: "var(--vvh, 100dvh)" }}
    >
      {/* PC 侧栏：默认收起为窄边条，点击展开 */}
      {collapsed ? (
        <div className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-panel py-3 md:flex">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={t("header.expandSessions")}
            aria-label={t("header.expandSessions")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-rail-icon transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronsRight size={17} />
          </button>
          <span className="mt-4 flex h-8 w-8 items-center justify-center rounded-lg bg-helix-soft text-helix ring-1 ring-helix/20">
            <BrandMark size={16} />
          </span>
          {/* 窄边条背景是浅米面板，muted-foreground 太淡近乎看不见；
              用 rail-icon 纯色（见 styles.css：alpha 修饰符的 oklab 描边在 Chromium 有渲染 bug） */}
          <div className="mt-auto [&_button]:text-rail-icon">
            <LanguageToggle size={16} />
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? t("header.themeDark") : t("header.themeLight")}
            aria-label={t("header.themeAria")}
            className="mt-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-rail-icon transition-colors hover:bg-secondary hover:text-pet-amber-deep"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      ) : (
        <div className="relative hidden w-[270px] shrink-0 md:block">
          {sidebar}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={t("header.collapseSessions")}
            aria-label={t("header.collapseSessions")}
            className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-helix/50 hover:text-helix"
          >
            <ChevronsLeft size={13} />
          </button>
        </div>
      )}

      {/* H5 抽屉 */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
          <div className="safe-t absolute inset-y-0 left-0 w-[280px] max-w-[85%] shadow-soft-lg">
            <MobileDrawerHeader onClose={() => setDrawerOpen(false)} />
            <div className="h-[calc(100%-49px)]">{sidebar}</div>
          </div>
        </div>
      ) : null}

      {/* 主区 */}
      <main className="ambient-glow relative flex min-w-0 flex-1 flex-col">
        <header className="safe-t flex items-center gap-2 border-b border-border bg-panel/70 px-4 py-2.5 backdrop-blur-sm md:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
            aria-label={t("header.openSessions")}
          >
            <Menu size={18} />
          </button>
          <h1 className="truncate text-[13.5px] font-medium tracking-tight">
            {activeId
              ? sessions.find((s) => s.id === activeId)?.title ?? t("brand.name")
              : user
                ? t("header.newChat")
                : t("brand.name")}
          </h1>
          <button
            type="button"
            onClick={() => setBoardOpen(true)}
            title={t("header.leaderboard")}
            aria-label={t("header.leaderboardAria")}
            className={`${user ? "" : "ml-auto "}rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep`}
          >
            <Trophy size={17} />
          </button>
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            title={t("header.stats")}
            aria-label={t("header.statsAria")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-helix"
          >
            <BarChart3 size={17} />
          </button>
          <Link
            to="/about"
            title={t("header.about")}
            aria-label={t("header.aboutAria")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep"
          >
            <Info size={17} />
          </Link>
          <LanguageToggle />
          <span className="relative">
            <button
              type="button"
              onClick={() => setPetPanelOpen((o) => !o)}
              title={t("pet.settings.gear")}
              aria-label={t("pet.settings.gear")}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep"
            >
              <PawPrint size={17} />
            </button>
            {petPanelOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPetPanelOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5">
                  <PetSettingsPanel onClose={() => setPetPanelOpen(false)} />
                </div>
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? t("header.themeDark") : t("header.themeLight")}
            aria-label={t("header.themeAria")}
            className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep`}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onPick={(q) => void handleSend(q)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {messages.map((m, idx) => (
                <ChatMessage
                  key={m.id}
                  msg={m}
                  onRegenerate={handleRegenerate}
                  onPickSuggestion={(q) => void handleSend(q)}
                  linkHint={m.role === "assistant" && idx === messages.length - 1}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <Composer
          models={models}
          model={model}
          onModelChange={setModel}
          streaming={streaming}
          onSend={(t) => void handleSend(t)}
          onStop={() => abortRef.current?.abort()}
        />
      </main>

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(u) => {
          if (u) {
            // 自托管本地登录：保留当前画面，合并服务端历史 + 排行榜成绩
            void handleLocalAuthSuccess(u);
            return;
          }
          setAuthOpen(false);
          setMessages([]);
          setActiveId(null);
        }}
      />

      {/* 寻宝鼠桌宠 */}
      <TreasureMouse event={petEvent} />

      {/* 挖宝排行榜：离线本地账号的 id 即邮箱，行键 u:<email> 可直接高亮"我" */}
      <Leaderboard open={boardOpen} onClose={() => setBoardOpen(false)} ownUserId={effUser?.id ?? null} />
      <UsageStatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} />
    </div>
  );
}
