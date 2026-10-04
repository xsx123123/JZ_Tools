// 新会话空态：寻宝主题引导 + 按意图分组的示例提问（藏宝任务板式排版）
// 每次进入空态从示例池随机抽样展示（useMemo 一次抽定，本次空态内保持稳定不闪动）
import { useMemo } from "react";
import mouseBase from "@/assets/pet/mouse-base.webp";

interface ExampleGroup {
  label: string;
  caption: string;
  /** 示例池：每次空态随机抽 SHOW_PER_GROUP 条展示 */
  items: string[];
  /** 每组最多展示条数 */
  show: number;
}

const GROUPS: ExampleGroup[] = [
  {
    label: "探矿定位",
    caption: "按课题方向找 GEO / SRA 收录的矿脉",
    show: 3,
    items: [
      "帮我搜索小鼠肝再生相关的 GEO 数据集",
      "查找人单细胞 RNA-seq 的肿瘤微环境研究",
      "搜索近三年的果蝇神经发育高通量测序数据",
      "找一下斑马鱼胚胎发育的 RNA-seq 数据",
      "帮我找小鼠免疫细胞的 scRNA-seq 数据集",
      "检索大肠杆菌转录组芯片数据",
      "找水稻干旱胁迫的转录组数据",
      "帮我搜阿尔茨海默病相关的人脑 RNA-seq",
      "找小鼠脂肪组织的Bulk RNA-seq数据集",
      "查一下拟南芥激素处理的微阵列数据",
      "帮我找乙肝病毒感染相关的肝细胞数据",
      "搜索酵母应激反应的高通量测序数据",
    ],
  },
  {
    label: "验宝鉴宝",
    caption: "GSE / GSM / PRJ 编号反查来龙去脉",
    show: 2,
    items: [
      "GSE299340 是什么研究？有哪些样本？",
      "GSM8765432 这个样本属于哪个项目？",
      "PRJNA732811 对应哪个研究？",
      "GSE151530 的实验设计是什么样的？",
      "帮我反查 GSM4581240 属于哪个数据集",
      "SRR21857241 是哪个项目的测序记录？",
    ],
  },
  {
    label: "清点矿藏",
    caption: "样本量、平台与分组概览",
    show: 1,
    items: [
      "统计 GSE136831 里有多少个样本",
      "GSE136831 用的什么测序平台？",
      "列出 GSE47062 的样本清单",
      "GSE282210 的实验分组是怎样的？",
      "统计当前数据库的增长情况",
      "查一下数据库里小鼠的实验总数",
    ],
  },
];

/** Fisher-Yates 洗牌后取前 n 条（不改动原数组） */
function sample<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const take = Math.min(n, pool.length);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

export function EmptyState({ onPick }: { onPick: (q: string) => void }): React.ReactElement {
  // 挂载时每组随机抽样一次；本次空态内保持稳定，重新进入会话再换一批
  const picked = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: sample(g.items, g.show) })),
    [],
  );
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      {/* 英雄区（图标+标题+简介）固定不动；只有示例任务清单在内部滚动 */}
      <div className="flex min-h-0 w-full max-w-2xl flex-col items-center">
        <div className="reveal reveal-zoom gold-glow flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-pet-gold-soft ring-1 ring-pet-amber/30">
          <img
            src={mouseBase}
            alt="寻宝鼠阿寻"
            draggable={false}
            className="h-full w-full scale-[1.18] object-contain drop-shadow-sm"
          />
        </div>
        <h2 className="reveal font-display mt-5 text-[26px] font-semibold tracking-tight text-foreground" data-reveal-delay="80">
          GEO<span className="text-pet-amber-deep">寻宝鼠</span>
        </h2>
        <p className="reveal mt-2 max-w-lg text-center text-[13.5px] leading-relaxed text-muted-foreground" data-reveal-delay="160">
          告诉阿寻你想挖哪片矿脉，它的小鼻子可灵了！一头扎进 GEO、SRA、ENA、GSA 数据库里刨拉半天，
          不仅能嗅出高分数据集、啃透繁杂编号，还能把打包好的样本宝藏一口气叼到你跟前。
        </p>

        <div className="reveal mt-9 w-full min-h-0 flex-1 space-y-7 overflow-y-auto pb-2" data-reveal-delay="240">
          {picked.map((g, gi) => (
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
