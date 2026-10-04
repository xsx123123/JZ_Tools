// 新会话空态：寻宝主题引导 + 按意图分组的示例提问（藏宝任务板式排版）
import { BrandMark } from "@/components/BrandMark";

interface ExampleGroup {
  label: string;
  caption: string;
  items: string[];
}

const GROUPS: ExampleGroup[] = [
  {
    label: "探矿定位",
    caption: "按课题方向找 GEO / SRA 收录的矿脉",
    items: [
      "帮我搜索小鼠肝再生相关的 GEO 数据集",
      "查找人单细胞 RNA-seq 的肿瘤微环境研究",
      "搜索近三年的果蝇神经发育高通量测序数据",
    ],
  },
  {
    label: "验宝鉴宝",
    caption: "GSE / GSM / PRJ 编号反查来龙去脉",
    items: [
      "GSE299340 是什么研究？有哪些样本？",
      "GSM8765432 这个样本属于哪个项目？",
    ],
  },
  {
    label: "清点矿藏",
    caption: "样本量、平台与分组概览",
    items: ["统计 GSE136831 里有多少个样本"],
  },
];

export function EmptyState({ onPick }: { onPick: (q: string) => void }): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      <div className="reveal reveal-zoom gold-glow flex h-16 w-16 items-center justify-center rounded-2xl bg-pet-gold-soft text-pet-amber-deep ring-1 ring-pet-amber/30">
        <BrandMark size={32} />
      </div>
      <h2 className="reveal font-display mt-5 text-[26px] font-semibold tracking-tight text-foreground" data-reveal-delay="80">
        GEO<span className="text-pet-amber-deep">寻宝鼠</span>
      </h2>
      <p className="reveal mt-2 max-w-md text-center text-[13.5px] leading-relaxed text-muted-foreground" data-reveal-delay="160">
        告诉阿寻你想挖哪片矿——它会调用 GEO / SRA / ENA / GSA 公共数据库，
        帮你检索数据集、解析编号、汇总样本信息，把宝藏叼到你面前。
      </p>

      <div className="reveal mt-9 w-full max-w-2xl space-y-7" data-reveal-delay="240">
        {GROUPS.map((g, gi) => (
          <section key={g.label}>
            <GroupHeader label={g.label} caption={g.caption} index={String(gi + 1).padStart(2, "0")} />
            <ul className="mt-1 divide-y divide-border/70 border-y border-border/70">
              {g.items.map((q) => (
                <li key={q}>
                  <ExampleRow q={q} onPick={onPick} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function GroupHeader({ label, caption, index }: { label: string; caption: string; index: string }): React.ReactElement {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="font-display text-[15px] font-semibold text-helix">{index}</span>
      <span className="text-[13px] font-semibold tracking-wide text-foreground">{label}</span>
      <span className="truncate text-[11px] text-muted-foreground/80">{caption}</span>
    </div>
  );
}

function ExampleRow({ q, onPick }: { q: string; onPick: (q: string) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onPick(q)}
      className="group flex w-full items-center gap-2 py-2.5 pl-1 pr-2 text-left transition-colors hover:bg-accent/60"
    >
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/85 transition-colors group-hover:text-helix">
        {q}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        ↵
      </span>
    </button>
  );
}
