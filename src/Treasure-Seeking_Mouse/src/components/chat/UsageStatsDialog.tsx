// 使用统计弹窗：累计对话 / token 消耗 / 去重使用人数 / 每个工具的调用次数
// 数据源：对话服务内存聚合（GET <chatEndpoint>/stats），Node 自托管落盘 server/.stats.json 重启恢复
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, Pickaxe, RefreshCw, Users, MessagesSquare, Coins, X } from "lucide-react";
import { fetchUsageStats, type UsageStats } from "@/services/seqoutChat";

export function UsageStatsDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement | null {
  const [data, setData] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const snap = await fetchUsageStats();
    if (snap) setData(snap);
    else setError("统计服务暂不可用（对话服务未启动或不支持）");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const maxTool = data && data.tools.length ? data.tools[0].count : 0;
  const fmt = (n: number) => n.toLocaleString("zh-CN");
  /** 大数字缩写：1,234,567 → 1.2M；44,836 → 44.8K（Token 用量专用） */
  const fmtK = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
    : String(n);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="使用统计">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft-lg">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <BarChart3 size={16} className="text-helix" />
          <h2 className="font-display text-[15px] font-semibold tracking-tight">使用统计</h2>
          <span className="text-[11px] text-muted-foreground/70">本服务自托管实例</span>
          <button
            type="button"
            onClick={() => void load()}
            title="刷新"
            aria-label="刷新统计"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">{error}</p>
          ) : !data ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> 加载中…
            </div>
          ) : (
            <>
              {/* 四宫格指标 */}
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard icon={<MessagesSquare size={15} />} label="累计对话" value={fmt(data.chats)} />
                <StatCard
                  icon={<Coins size={15} />}
                  label="Token 消耗"
                  value={fmtK(data.totalTokens)}
                  hint={
                    data.totalTokens > 0
                      ? `输入 ${fmtK(data.promptTokens)} · 输出 ${fmtK(data.completionTokens)}`
                      : "网关未回传用量"
                  }
                />
                <StatCard icon={<Users size={15} />} label="使用人数" value={fmt(data.actors)} hint="按登录用户 / 访客设备去重" />
                <StatCard
                  icon={<Pickaxe size={15} />}
                  label="工具调用"
                  value={fmt(data.toolCalls)}
                  hint={data.toolErrors > 0 ? `成功 ${fmt(data.toolCalls - data.toolErrors)} · 失败 ${fmt(data.toolErrors)}` : `LLM 请求 ${fmt(data.llmCalls)} 次`}
                />
              </div>

              {/* 每个工具的使用情况 */}
              <h3 className="mt-5 mb-2 flex items-baseline gap-2">
                <span className="text-[13px] font-semibold tracking-wide text-foreground">每个工具的使用情况</span>
                <span className="text-[11px] text-muted-foreground/80">
                  共 {data.tools.length} 种 / {fmt(data.toolCalls)} 次
                </span>
              </h3>
              {data.tools.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                  还没有工具调用记录，去问阿寻一个问题吧
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.tools.map((t) => (
                    <li key={t.name} className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[12.5px] text-foreground/90" title={t.name}>
                          {t.label}
                          <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground/70">{t.name.replace(/^seqout_/, "")}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[12px] text-foreground">
                          {fmt(t.count)}
                          {t.errors > 0 ? <span className="ml-1 text-[10.5px] text-red-500">失败 {t.errors}</span> : null}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-helix/70 transition-[width] duration-500"
                          style={{ width: `${maxTool ? Math.max(4, Math.round((t.count / maxTool) * 100)) : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* 底部：统计口径说明 */}
        {data ? (
          <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground/70">
            统计自 {new Date(data.since).toLocaleString("zh-CN")} 起 · 最后更新 {new Date(data.updatedAt || data.since).toLocaleString("zh-CN")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span className="text-helix">{icon}</span>
        {label}
      </div>
      <p className="font-display mt-1 text-[22px] font-semibold leading-none tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 truncate text-[10.5px] text-muted-foreground/70" title={hint}>{hint}</p> : null}
    </div>
  );
}
