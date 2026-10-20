// 阿寻设置面板：桌宠悬浮齿轮与顶栏配置按钮共用。
// 读写走 petStore（localStorage），变更经 petBus 通知桌宠即时生效。
// 注意：QMuse 版无 i18n 体系，文案与主仓库 zh 文案保持一致（硬编码）。
import { useState } from "react";
import { VolumeX, PawPrint } from "lucide-react";
import { PET_SIZES, readPetSize, writePetSize, readPetAlways, writePetAlways, readTreasureCount } from "@/services/petStore";
import { emitPetSettingsChanged, emitPetRecall, emitPetQuiet } from "@/lib/petBus";

const SIZE_LABELS = ["小", "中", "大"] as const;

export function PetSettingsPanel({ onClose, onRecall }: { onClose?: () => void; onRecall?: () => void }): React.ReactElement {
  const [size, setSize] = useState<number>(() => readPetSize());
  const [always, setAlways] = useState<boolean>(() => readPetAlways());

  const changeSize = (n: number) => {
    setSize(n);
    writePetSize(n);
    emitPetSettingsChanged();
  };

  const changeAlways = (b: boolean) => {
    setAlways(b);
    writePetAlways(b);
    emitPetSettingsChanged();
  };

  const recall = () => {
    emitPetRecall();
    onRecall?.();
    onClose?.();
  };

  return (
    <div className="w-52 rounded-xl border border-border bg-card p-3 text-foreground shadow-soft-lg">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
        <PawPrint size={13} className="text-pet-amber-deep" />
        阿寻的设置
      </p>

      {/* 找回阿寻：退出静默 / 取消闲置隐藏 */}
      <button
        type="button"
        onClick={recall}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-helix-soft px-2 py-1.5 text-[12px] font-medium text-helix transition-colors hover:bg-helix-soft/70"
      >
        <PawPrint size={13} />
        找回阿寻
      </button>

      {/* 大小三档 */}
      <p className="mb-1 text-[11px] text-muted-foreground">大小</p>
      <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-0.5">
        {PET_SIZES.map((n, i) => (
          <button
            key={n}
            type="button"
            onClick={() => changeSize(n)}
            className={`rounded-md py-1 text-[11.5px] transition-colors ${size === n ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {SIZE_LABELS[i]}
          </button>
        ))}
      </div>

      {/* 一直存在开关 */}
      <label className="mb-2.5 flex cursor-pointer items-start justify-between gap-2">
        <span>
          <span className="block text-[12px]">一直存在</span>
          <span className="block text-[10.5px] leading-snug text-muted-foreground">关闭后，闲置时阿寻会自己藏起来</span>
        </span>
        <input
          type="checkbox"
          checked={always}
          onChange={(e) => changeAlways(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-helix"
        />
      </label>

      {/* 静默（等价右键） */}
      <button
        type="button"
        onClick={() => {
          emitPetQuiet();
          onClose?.();
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <VolumeX size={13} />
        让阿寻静默
      </button>

      <p className="mt-2 border-t border-border pt-1.5 text-center font-mono text-[10px] text-muted-foreground/70">
        已囤 {readTreasureCount()} 份宝藏
      </p>
    </div>
  );
}
