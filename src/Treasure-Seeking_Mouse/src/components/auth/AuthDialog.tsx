// 邮箱验证码 + 密码：登录 / 注册（signUp→verifyOtp 两步状态机）/ 忘记密码
import { useState } from "react";
import { supabase } from "@/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Mode = "login" | "register" | "forgot";

function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(m)) return "邮箱或密码不正确";
  if (/already registered|already exists/i.test(m)) return "该邮箱已注册，请直接登录";
  if (/rate limit/i.test(m)) return "操作过于频繁，请稍后再试";
  return m;
}

export function AuthDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}): React.ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<"form" | "verify">("form"); // 注册两步状态机
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [pendingUsername, setPendingUsername] = useState("");

  function reset(): void {
    setStep("form");
    setPassword("");
    setToken("");
    setMsg(null);
    setPendingUsername("");
  }

  function switchMode(m: Mode): void {
    setMode(m);
    reset();
  }

  async function handleLogin(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      onSuccess();
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(): Promise<void> {
    if (password.length < 6) {
      setMsg({ type: "error", text: "密码至少 6 位" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const prefix = email.trim().split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
      const username = `${prefix || "user"}_${Math.random().toString(36).slice(2, 8)}`;
      setPendingUsername(username);
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username } },
      });
      if (error) throw error;
      setStep("verify");
      setMsg({ type: "ok", text: "确认邮件已发送，请输入邮件中的 6 位验证码完成注册" });
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "signup" });
      if (error) throw error;
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) throw new Error("登录状态尚未同步，请稍后重试");
      const { error: upErr } = await supabase
        .from("profiles")
        .upsert({ id: data.user.id, username: pendingUsername })
        .select("id")
        .single();
      if (upErr) throw new Error(upErr.message);
      onSuccess();
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMsg({ type: "ok", text: "重置链接已发送到邮箱，请查收邮件并点击链接设置新密码" });
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  const fieldCls = "h-10 rounded-lg border-border bg-card shadow-sm focus-visible:border-helix focus-visible:ring-2 focus-visible:ring-helix/20";

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[400px] border-border bg-card text-foreground shadow-soft-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-semibold tracking-tight">
            {mode === "login" ? "登录 GEO寻宝鼠" : mode === "register" ? (step === "verify" ? "输入邮箱验证码" : "注册新账号") : "找回密码"}
          </DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">
            {mode === "login"
              ? "登录后可跨设备同步历史会话"
              : mode === "register"
                ? step === "verify"
                  ? `验证码已发送至 ${email}`
                  : "真实邮箱 + 密码，注册需邮箱验证"
                : "输入注册邮箱，我们将发送重置密码链接"}
          </p>
        </DialogHeader>

        <div className="space-y-3.5 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs text-muted-foreground">邮箱</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={mode === "register" && step === "verify"}
              className={fieldCls}
            />
          </div>

          {mode !== "forgot" && !(mode === "register" && step === "verify") ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-pass" className="text-xs text-muted-foreground">密码</Label>
              <Input
                id="auth-pass"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "至少 6 位" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldCls}
              />
            </div>
          ) : null}

          {mode === "register" && step === "verify" ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-token" className="text-xs text-muted-foreground">邮件验证码</Label>
              <Input
                id="auth-token"
                inputMode="numeric"
                maxLength={8}
                placeholder="6 位数字验证码"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={`${fieldCls} font-mono tracking-[0.3em]`}
              />
            </div>
          ) : null}

          {msg ? (
            <p className={`rounded-md border px-3 py-2 text-[12.5px] leading-relaxed ${msg.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-helix/30 bg-helix-soft text-helix"}`}>
              {msg.text}
            </p>
          ) : null}

          {mode === "login" ? (
            <Button onClick={handleLogin} disabled={busy || !email || !password} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? "登录中…" : "登 录"}
            </Button>
          ) : null}

          {mode === "register" && step === "form" ? (
            <Button onClick={handleRegister} disabled={busy || !email || !password} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? "发送中…" : "注册并发送验证码"}
            </Button>
          ) : null}

          {mode === "register" && step === "verify" ? (
            <div className="space-y-2.5">
              <Button onClick={handleVerify} disabled={busy || !token} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
                {busy ? "校验中…" : "验证并完成注册"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => switchMode("register")}>
                收不到？重新提交注册
              </Button>
            </div>
          ) : null}

          {mode === "forgot" ? (
            <Button onClick={handleForgot} disabled={busy || !email} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? "发送中…" : "发送重置链接"}
            </Button>
          ) : null}

          <div className="flex items-center justify-between pt-1 text-[12.5px] text-muted-foreground">
            {mode === "login" ? (
              <>
                <button type="button" className="story-link hover:text-helix" onClick={() => switchMode("register")}>创建账号</button>
                <button type="button" className="story-link hover:text-helix" onClick={() => switchMode("forgot")}>忘记密码？</button>
              </>
            ) : (
              <button type="button" className="mx-auto story-link hover:text-helix" onClick={() => switchMode("login")}>
                返回登录
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
