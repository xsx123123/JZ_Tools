// 中英文切换按钮：图标 + 目标语言短码；点击在 zh/en 间切换（偏好写 localStorage）
import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";

export function LanguageToggle({ size = 17, className = "" }: { size?: number; className?: string }): React.ReactElement {
  const { t, toggleLang } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleLang}
      title={t("header.langAria")}
      aria-label={t("header.langAria")}
      className={`flex items-center justify-center gap-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-helix ${className}`}
    >
      <Languages size={size} />
      <span className="font-mono text-[11px] leading-none">{t("header.lang")}</span>
    </button>
  );
}
