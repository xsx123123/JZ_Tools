// 邮箱验证码 + 密码：登录 / 注册（signUp→verifyOtp 两步状态机）/ 忘记密码
import { useState } from "react";
import { supabase } from "@/supabase/client";
import { useI18n } from "@/i18n/provider";
import type { TFunc } from "@/i18n";
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

function errText(t: TFunc, e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(m)) return t("auth.errInvalidCredentials");
  if (/already registered|already exists/i.test(m)) return t("auth.errExists");
  if (/rate limit/i.test(m)) return t("auth.errRateLimit");
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
  const { t } = useI18n();
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
      setMsg({ type: "error", text: errText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(): Promise<void> {
    if (password.length < 6) {
      setMsg({ type: "error", text: t("auth.errPasswordShort") });
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
      setMsg({
        type: "ok",
        text: t("auth.verifySent"),
      });
    } catch (e) {
      setMsg({ type: "error", text: errText(t, e) });
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
      if (userError || !data.user) throw new Error(t("auth.errSession"));
      const { error: upErr } = await supabase
        .from("profiles")
        .upsert({ id: data.user.id, username: pendingUsername })
        .select("id")
        .single();
      if (upErr) throw new Error(upErr.message);
      onSuccess();
    } catch (e) {
      setMsg({ type: "error", text: errText(t, e) });
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
      setMsg({ type: "ok", text: t("auth.resetSent") });
    } catch (e) {
      setMsg({ type: "error", text: errText(t, e) });
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
            {mode === "login"
              ? t("auth.loginTitle")
              : mode === "register"
                ? (step === "verify" ? t("auth.verifyTitle") : t("auth.registerTitle"))
                : t("auth.forgotTitle")}
          </DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">
            {mode === "login"
              ? t("auth.loginSub")
              : mode === "register"
                ? step === "verify"
                  ? t("auth.verifySub", { email })
                  : t("auth.registerSub")
                : t("auth.forgotSub")}
          </p>
        </DialogHeader>

        <div className="space-y-3.5 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs text-muted-foreground">{t("auth.email")}</Label>
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
              <Label htmlFor="auth-pass" className="text-xs text-muted-foreground">{t("auth.password")}</Label>
              <Input
                id="auth-pass"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? t("auth.passwordPlaceholderRegister") : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldCls}
              />
            </div>
          ) : null}

          {mode === "register" && step === "verify" ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-token" className="text-xs text-muted-foreground">{t("auth.code")}</Label>
              <Input
                id="auth-token"
                inputMode="numeric"
                maxLength={8}
                placeholder={t("auth.codePlaceholder")}
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
              {busy ? t("auth.busyLogin") : t("auth.login")}
            </Button>
          ) : null}

          {mode === "register" && step === "form" ? (
            <Button onClick={handleRegister} disabled={busy || !email || !password} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? t("auth.busySend") : t("auth.register")}
            </Button>
          ) : null}

          {mode === "register" && step === "verify" ? (
            <div className="space-y-2.5">
              <Button onClick={handleVerify} disabled={busy || !token} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
                {busy ? t("auth.busyVerify") : t("auth.verify")}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => switchMode("register")}>
                {t("auth.resend")}
              </Button>
            </div>
          ) : null}

          {mode === "forgot" ? (
            <Button onClick={handleForgot} disabled={busy || !email} className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? t("auth.busySend") : t("auth.forgot")}
            </Button>
          ) : null}

          <div className="flex items-center justify-between pt-1 text-[12.5px] text-muted-foreground">
            {mode === "login" ? (
              <>
                <button type="button" className="story-link hover:text-helix" onClick={() => switchMode("register")}>{t("auth.createAccount")}</button>
                <button type="button" className="story-link hover:text-helix" onClick={() => switchMode("forgot")}>{t("auth.forgotLink")}</button>
              </>
            ) : (
              <button type="button" className="mx-auto story-link hover:text-helix" onClick={() => switchMode("login")}>
                {t("auth.backToLogin")}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
