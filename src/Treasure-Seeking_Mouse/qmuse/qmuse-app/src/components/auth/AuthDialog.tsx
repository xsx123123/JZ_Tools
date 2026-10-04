// 平台账号信息 + 寻宝昵称设置（QMuse 平台账号体系：登录经平台右上角账号入口完成，应用内不再做邮箱密码/验证码）
import { useEffect, useState } from "react";
import { BadgeCheck, Compass, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateNickname } from "@/services/statsStore";
import type { AuthUser } from "@/services/authSession";

export function AuthDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser | null;
}): React.ReactElement {
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  // 每次打开时重置输入与提示
  useEffect(() => {
    if (open) {
      setNick("");
      setMsg(null);
    }
  }, [open]);

  async function handleSave(): Promise<void> {
    const value = nick.trim();
    if (!value || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateNickname(value);
      setMsg({ type: "ok", text: "昵称已保存，排行榜将展示你的新名号" });
      setNick("");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg({ type: "error", text: m || "保存失败，请稍后再试" });
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
            账号与昵称
          </DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">
            {user ? "已使用平台账号登录，历史会话自动云端同步" : "当前为游客模式，会话仅保存在本机"}
          </p>
        </DialogHeader>

        <div className="space-y-3.5 pt-1">
          {/* 当前身份 */}
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
            {user ? (
              <BadgeCheck size={15} className="mt-0.5 shrink-0 text-helix" />
            ) : (
              <Compass size={15} className="mt-0.5 shrink-0 text-pet-amber-deep" />
            )}
            <div className="min-w-0 text-[12.5px] leading-relaxed">
              {user ? (
                <>
                  <p className="truncate font-medium text-foreground">{user.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    ID {user.id.slice(0, 8)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  当前为游客模式，会话仅保存在本机；使用平台账号登录后可跨设备同步历史会话与登上寻宝排行榜。
                </p>
              )}
            </div>
          </div>

          {!user ? (
            <p className="rounded-md border border-helix/30 bg-helix-soft px-3 py-2 text-[12.5px] leading-relaxed text-helix">
              请通过平台页面右上角的账号入口登录。
            </p>
          ) : null}

          {/* 寻宝昵称 */}
          <div className="space-y-1.5">
            <Label htmlFor="auth-nick" className="text-xs text-muted-foreground">
              寻宝昵称（排行榜展示用）
            </Label>
            <div className="flex gap-2">
              <Input
                id="auth-nick"
                maxLength={16}
                placeholder="寻宝昵称"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
                className={fieldCls}
              />
              <Button
                onClick={() => void handleSave()}
                disabled={busy || !nick.trim()}
                className="h-10 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Pencil size={13} className="mr-1" />
                {busy ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>

          {msg ? (
            <p className={`rounded-md border px-3 py-2 text-[12.5px] leading-relaxed ${msg.type === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-helix/30 bg-helix-soft text-helix"}`}>
              {msg.text}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
