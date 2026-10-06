// 阿寻设置面板：桌宠悬浮齿轮与顶栏配置按钮共用。
// 行式设计（参考 docs/2026-10-06_14.04.23.png）：标题+关闭 / 体型步进 / 开关组 / 位置复位 / 找回。
// 读写走 petStore（localStorage），变更经 petBus 通知桌宠即时生效；桌宠侧改动也经同一总线回同步。
import { useEffect, useState } from "react";
import { EyeOff, Infinity as InfinityIcon, LocateFixed, Maximize2, Minimize2, PawPrint, Ruler, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import {
  PET_SIZE_DEFAULT, PET_SIZE_MAX, PET_SIZE_MIN, PET_SIZE_STEP,
  readPetAlways, writePetAlways, readPetIdleAlive, writePetIdleAlive,
  readPetQuiet, readPetSize, writePetSize, readTreasureCount,
} from "@/services/petStore";
import { emitPetSettingsChanged, emitPetRecall, emitPetQuiet, emitPetResetPos, onPetSettingsChanged } from "@/lib/petBus";

/** iOS 风开关（自绘，纯 theme token） */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${checked ? "bg-helix" : "bg-border"}`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-card shadow-sm transition-all duration-200 ${checked ? "left-[18px]" : "left-[2px]"}`}
      />
    </button>
  );
}

const rowCls = "flex items-center gap-3 px-3.5 py-3";
const rowTitle = "text-[13px] font-semibold text-foreground";
const rowDesc = "mt-0.5 text-[11.5px] leading-snug text-muted-foreground";
const rowIcon = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-helix";
const divider = <div className="border-t border-border/70" />;

export function PetSettingsPanel({ onClose, onRecall }: { onClose?: () => void; onRecall?: () => void }): React.ReactElement {
  const { t } = useI18n();
  const [size, setSize] = useState<number>(() => readPetSize());
  const [always, setAlways] = useState<boolean>(() => readPetAlways());
  const [idleAlive, setIdleAlive] = useState<boolean>(() => readPetIdleAlive());
  const [quiet, setQuiet] = useState<boolean>(() => readPetQuiet());

  // 桌宠侧改动（右键静默等）经 petBus 回同步面板显示
  useEffect(() => onPetSettingsChanged(() => {
    setSize(readPetSize());
    setAlways(readPetAlways());
    setIdleAlive(readPetIdleAlive());
    setQuiet(readPetQuiet());
  }), []);

  const changeSize = (next: number) => {
    const clamped = Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, next));
    setSize(clamped);
    writePetSize(clamped);
    emitPetSettingsChanged();
  };

  const changeAlways = (v: boolean) => {
    setAlways(v);
    writePetAlways(v);
    emitPetSettingsChanged();
  };

  const changeIdleAlive = (v: boolean) => {
    setIdleAlive(v);
    writePetIdleAlive(v);
    emitPetSettingsChanged();
  };

  const changeQuiet = (v: boolean) => {
    if (v) emitPetQuiet();
    else emitPetRecall();
    // quiet 状态由桌宠写存储并发 settingsChanged 回同步，这里乐观更新
    setQuiet(v);
  };

  const recall = () => {
    emitPetRecall();
    setQuiet(false);
    onRecall?.();
    onClose?.();
  };

  return (
    <div className="w-[300px] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-soft-lg">
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
        <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          <PawPrint size={15} className="text-pet-amber-deep" />
          {t("pet.settings.title")}
        </p>
        <button type="button" onClick={() => onClose?.()} className="text-[12px] text-muted-foreground transition-colors hover:text-foreground">
          {t("pet.settings.close")}
        </button>
      </div>

      {/* 体型大小：步进 + 百分比读数 */}
      <div className={rowCls}>
        <span className={rowIcon}><Ruler size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className={rowTitle}>{t("pet.settings.size")}</p>
          <p className={rowDesc}>{t("pet.settings.sizeDesc")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => changeSize(size - PET_SIZE_STEP)}
            disabled={size <= PET_SIZE_MIN}
            title={t("pet.settings.shrink")}
            aria-label={t("pet.settings.shrink")}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-35"
          >
            <Minimize2 size={13} />
          </button>
          <span className="w-11 text-center font-mono text-[12.5px] tabular-nums text-foreground">
            {Math.round((size / PET_SIZE_DEFAULT) * 100)}%
          </span>
          <button
            type="button"
            onClick={() => changeSize(size + PET_SIZE_STEP)}
            disabled={size >= PET_SIZE_MAX}
            title={t("pet.settings.grow")}
            aria-label={t("pet.settings.grow")}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-35"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {divider}

      {/* 从桌面收起（= 静默：右下角留召回小入口） */}
      <div className={rowCls}>
        <span className={rowIcon}><EyeOff size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className={rowTitle}>{t("pet.settings.quiet")}</p>
          <p className={rowDesc}>{t("pet.settings.quietDesc")}</p>
        </div>
        <Switch checked={quiet} onChange={changeQuiet} label={t("pet.settings.quiet")} />
      </div>

      {divider}

      {/* 闲置时自己活动 */}
      <div className={rowCls}>
        <span className={rowIcon}><Sparkles size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className={rowTitle}>{t("pet.settings.idle")}</p>
          <p className={rowDesc}>{t("pet.settings.idleDesc")}</p>
        </div>
        <Switch checked={idleAlive} onChange={changeIdleAlive} label={t("pet.settings.idle")} />
      </div>

      {divider}

      {/* 一直存在 */}
      <div className={rowCls}>
        <span className={rowIcon}><InfinityIcon size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className={rowTitle}>{t("pet.settings.always")}</p>
          <p className={rowDesc}>{t("pet.settings.alwaysDesc")}</p>
        </div>
        <Switch checked={always} onChange={changeAlways} label={t("pet.settings.always")} />
      </div>

      {divider}

      {/* 位置复位 */}
      <div className={rowCls}>
        <span className={rowIcon}><LocateFixed size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className={rowTitle}>{t("pet.settings.reset")}</p>
          <p className={rowDesc}>{t("pet.settings.resetDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => emitPetResetPos()}
          className="shrink-0 rounded-lg border border-pet-amber/40 bg-pet-gold-soft/60 px-2.5 py-1 text-[12px] font-medium text-pet-amber-deep transition-colors hover:bg-pet-gold-soft"
        >
          {t("pet.settings.resetBtn")}
        </button>
      </div>

      {divider}

      {/* 找回阿寻（隐藏/收起后召回） */}
      <div className="px-3.5 py-3">
        <button
          type="button"
          onClick={recall}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-helix-soft px-2 py-2 text-[12.5px] font-medium text-helix transition-colors hover:bg-helix-soft/70"
        >
          <PawPrint size={13} />
          {t("pet.settings.recall")}
        </button>
        <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground/70">
          {t("pet.settings.treasure", { n: readTreasureCount() })}
        </p>
        <p className="mt-1.5 text-center text-[10.5px] leading-snug text-muted-foreground/60">
          {t("pet.settings.note")}
        </p>
      </div>
    </div>
  );
}
