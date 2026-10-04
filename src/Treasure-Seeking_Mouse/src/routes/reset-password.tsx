// 忘记密码恢复页：邮件链接回跳后在 recovery session 中设置新密码
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { supabase } from "@/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage(): React.ReactElement {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // 确认当前 session 是邮件恢复会话（带 recovery 标记），否则要求重新发起找回
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await new Promise((r) => setTimeout(r, 600)); // 等待 URL hash / oauth 回调建立 session
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const isRecovery = data.session?.user?.user_metadata?.provider === "recover" ||
        window.location.hash.includes("type=recovery");
      if (isRecovery && data.session) setReady(true);
      else setMsg({ type: "error", text: "未检测到有效的重置链接，请回到登录页重新发起「忘记密码」" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(): Promise<void> {
    if (password.length < 6) {
      setMsg({ type: "error", text: "密码至少 6 位" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ type: "ok", text: "密码已更新，即将返回登录页…" });
      await supabase.auth.signOut();
      setTimeout(() => void navigate({ to: "/" }), 1200);
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "更新失败，请重试" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-grid ambient-glow flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-soft-lg">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-helix-soft text-helix ring-1 ring-helix/20">
            <BrandMark size={20} />
          </span>
          <div>
            <p className="font-display text-[16px] font-semibold tracking-tight">设置新密码</p>
            <p className="text-[11.5px] text-muted-foreground">GEO寻宝鼠</p>
          </div>
        </div>

        {!ready ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">正在校验重置链接…</p>
        ) : (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="new-pass" className="text-xs text-muted-foreground">新密码</Label>
              <Input
                id="new-pass"
                type="password"
                autoComplete="new-password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-lg border-border bg-card shadow-sm focus-visible:border-helix focus-visible:ring-2 focus-visible:ring-helix/20"
              />
            </div>
            {msg ? (
              <p className={`rounded-md border px-3 py-2 text-[12.5px] ${msg.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-helix/30 bg-helix-soft text-helix"}`}>
                {msg.text}
              </p>
            ) : null}
            <Button onClick={handleSave} disabled={busy || !password} className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? "保存中…" : "保存并返回登录"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
