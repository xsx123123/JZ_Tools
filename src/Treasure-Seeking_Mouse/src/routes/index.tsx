// GEO寻宝鼠：主页（会话栏 + 对话区 + 登录弹窗 + 桌宠）
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, Info, Menu, Moon, Sun, Trophy } from "lucide-react";
import { supabase, isOfflineMode } from "@/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { EmptyState } from "@/components/chat/EmptyState";
import { ChatMessage, type ChatUIMessage } from "@/components/chat/ChatMessage";
import { Composer } from "@/components/chat/Composer";
import { SessionSidebar, MobileDrawerHeader } from "@/components/chat/SessionSidebar";
import { BrandMark } from "@/components/BrandMark";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { TreasureMouse, makePetEvent, type PetEvent } from "@/components/pet/TreasureMouse";
import { readTheme, writeTheme, applyTheme, type Theme } from "@/services/petStore";
import { bumpStats } from "@/services/statsStore";
import { Leaderboard } from "@/components/chat/Leaderboard";

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

interface LocalSession {
  id: string;
  title: string;
  messages: ChatUIMessage[];
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readLocalSessions(): LocalSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalSession[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSessions(list: LocalSession[]): void {
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(list.slice(-30)));
  } catch {
    /* 容量满时静默丢弃 */
  }
}

function ChatPage(): React.ReactElement {
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
  const petCardsRef = useRef(0);
  const [boardOpen, setBoardOpen] = useState(false); // 排行榜抽屉
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
  const user = session?.user ?? null;

  // 模型目录
  useEffect(() => {
    void fetchModelCatalog().then((c) => {
      if (c && c.models.length > 0) {
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

  // 登录后拉云端会话；退出后回到本地
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

  // 切换会话时加载消息
  useEffect(() => {
    if (!user || !activeId) return;
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

  // 本地临时会话持久化（未登录试用）
  useEffect(() => {
    if (user) return;
    const list = readLocalSessions();
    const idx = list.findIndex((s) => s.id === localId);
    const entry: LocalSession = {
      id: localId,
      title: messages.find((m) => m.role === "user")?.content.slice(0, 24) ?? "新对话",
      messages,
    };
    if (idx >= 0) list[idx] = entry;
    else if (messages.length > 0) list.push(entry);
    writeLocalSessions(list);
  }, [user, localId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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

  async function handleSend(text: string): Promise<void> {
    if (streaming) return;
    const history: { role: "user" | "assistant"; content: string }[] = messages
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

    function patch(fn: (m: ChatUIMessage) => ChatUIMessage): void {
      setMessages((prev) => prev.map((m) => (m.id === asstMsg.id ? fn(m) : m)));
    }

    await requestSeqoutChat(
      [...history, { role: "user", content: text }],
      model,
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
    );

    patch((m) => ({ ...m, streaming: false, liveTools: undefined, toolLogs: finalTools, cards: finalCards }));
    setStreaming(false);
    abortRef.current = null;

    // 排行榜统计上报（fire-and-forget，失败静默）
    void bumpStats(
      { treasures: statRef.current.cards, digs: statRef.current.digs, chats: 1 },
      { isGuest: !user, userId: user?.id, username: user?.email ?? "" },
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
        const snapshot = asstMsg;
        setMessages((cur) => {
          const latest = cur.find((m) => m.id === snapshot.id);
          if (latest && !latest.error) {
            void insertMessage(sid!, user.id, {
              role: "assistant",
              content: latest.content,
              cards: latest.cards ?? null,
              tool_logs: latest.toolLogs ?? null,
            }).catch(() => undefined);
          }
          return cur;
        });
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
    await supabase.auth.signOut();
    setMessages([]);
    setActiveId(null);
    setLocalId(uid());
  }

  /** 重新挖一次：截断到该助手消息之前，用其前最近一条用户提问重发 */
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
    setMessages(messages.slice(0, idx));
    void handleSend(q);
  }

  const sidebar = (
    <SessionSidebar
      sessions={sessions}
      activeId={activeId}
      userLabel={user ? user.email ?? user.id.slice(0, 8) : null}
      onSelect={selectSession}
      onNew={startNew}
      onRename={handleRename}
      onDelete={handleDelete}
      onLogin={isOfflineMode ? undefined : () => setAuthOpen(true)}
      onLogout={handleLogout}
    />
  );

  return (
    <div className="bg-grid flex h-dvh overflow-hidden">
      {/* PC 侧栏：默认收起为窄边条，点击展开 */}
      {collapsed ? (
        <div className="hidden w-12 shrink-0 flex-col items-center border-r border-border bg-panel py-3 md:flex">
          <button
            type="button"
            onClick={toggleCollapsed}
            title="展开会话列表"
            aria-label="展开会话列表"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronsRight size={17} />
          </button>
          <span className="mt-4 flex h-8 w-8 items-center justify-center rounded-lg bg-helix-soft text-helix ring-1 ring-helix/20">
            <BrandMark size={16} />
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "切回白昼" : "夜探矿洞"}
            aria-label="切换主题"
            className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep"
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
            title="收起会话列表"
            aria-label="收起会话列表"
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
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85%] shadow-soft-lg">
            <MobileDrawerHeader onClose={() => setDrawerOpen(false)} />
            <div className="h-[calc(100%-49px)]">{sidebar}</div>
          </div>
        </div>
      ) : null}

      {/* 主区 */}
      <main className="ambient-glow relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-panel/70 px-4 py-2.5 backdrop-blur-sm md:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
            aria-label="打开会话列表"
          >
            <Menu size={18} />
          </button>
          <h1 className="truncate text-[13.5px] font-medium tracking-tight">
            {activeId ? sessions.find((s) => s.id === activeId)?.title ?? "GEO寻宝鼠" : user ? "新对话" : "临时试用（未登录不保存）"}
          </h1>
          <button
            type="button"
            onClick={() => setBoardOpen(true)}
            title="寻宝排行榜"
            aria-label="打开寻宝排行榜"
            className={`${user ? "" : "ml-auto "}rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep`}
          >
            <Trophy size={17} />
          </button>
          <Link
            to="/about"
            title="关于 GEO寻宝鼠"
            aria-label="关于"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep"
          >
            <Info size={17} />
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "切回白昼" : "夜探矿洞"}
            aria-label="切换主题"
            className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep`}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {!user ? (
            <span className={`${user ? "ml-auto" : ""} rounded-full border border-helix/20 bg-helix-soft px-2.5 py-1 font-mono text-[10.5px] text-helix`}>
              guest mode
            </span>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onPick={(q) => void handleSend(q)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  msg={m}
                  onRegenerate={handleRegenerate}
                  onPickSuggestion={(q) => void handleSend(q)}
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
        onSuccess={() => {
          setAuthOpen(false);
          setMessages([]);
          setActiveId(null);
        }}
      />

      {/* 寻宝鼠桌宠 */}
      <TreasureMouse event={petEvent} />

      {/* 挖宝排行榜 */}
      <Leaderboard open={boardOpen} onClose={() => setBoardOpen(false)} ownUserId={user?.id ?? null} />
    </div>
  );
}
