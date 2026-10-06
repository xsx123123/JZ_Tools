// 对话输入区（下铲指挥台）：多行输入 + 模型选择 + 下铲/停止
import { useEffect, useRef, useState } from "react";
import { Shovel, Square } from "lucide-react";
import { emitPetTyping } from "@/lib/petBus";

export function Composer({
  models,
  model,
  onModelChange,
  streaming,
  disabled,
  onSend,
  onStop,
}: {
  models: string[];
  model: string;
  onModelChange: (m: string) => void;
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}): React.ReactElement {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  // 输入联动：有字符时阿寻竖起耳朵随时准备出发（桌宠经 petBus 感知）
  useEffect(() => {
    emitPetTyping(value.trim().length > 0);
    return () => emitPetTyping(false);
  }, [value]);

  function submit(): void {
    const t = value.trim();
    if (!t || streaming || disabled) return;
    setValue("");
    onSend(t);
  }

  return (
    <div className="border-t border-border bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-soft transition-all focus-within:border-miner-green focus-within:ring-2 focus-within:ring-miner-green/20 focus-within:shadow-[0_1px_3px_0_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(21_128_61/0.25)]">
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="随口告诉阿寻你想挖什么，比如：“帮我找找阿尔茨海默病相关的人脑 RNA-seq”…（Enter 下铲）"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
            disabled={disabled}
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              title="停止生成"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 text-destructive transition-colors hover:bg-destructive/10"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || disabled}
              title="下铲挖宝"
              className="flex h-9 shrink-0 items-center gap-1.5 justify-center rounded-lg bg-miner-green px-3 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-miner-green-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Shovel size={15} />
              <span className="hidden sm:inline">下铲挖宝</span>
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[11.5px] text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <span className="font-mono">model</span>
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11.5px] text-muted-foreground shadow-sm outline-none transition-colors hover:border-miner-green/50 focus:border-miner-green"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <span className="hidden sm:inline">阿寻挖的宝藏检索自全球公共组学数据库，具体信息请以 NCBI / NGDC 原始条目为准</span>
        </div>
      </div>
    </div>
  );
}
