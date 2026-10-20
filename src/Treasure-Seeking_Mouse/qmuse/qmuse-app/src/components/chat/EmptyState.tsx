// 新会话空态：寻宝主题引导 + 按意图分组的示例提问（探矿任务牌 Pill 式排版）
// 每次进入空态从示例池随机抽样展示（useMemo 一次抽定，本次空态内保持稳定不闪动）
import { useMemo } from "react";
import { BrandMark } from "@/components/BrandMark";

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
    caption: "适合：只有一个课题设想时",
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
    caption: "适合：手里只有一串编号时",
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
    caption: "适合：摸底样本量与平台分布",
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

/** 分组序号对应的主题 emoji（与「探矿定位 / 验宝鉴宝 / 清点矿藏」一一对应） */
const GROUP_EMOJI = ["⛏️", "💎", "📜"] as const;

const HEADLINE_ZH = { green: "GEO寻宝", gold: "鼠", rest: " · 你的同门生信探险搭子" };
const SUB_HEADLINE_ZH = "“不查迷宫，只挖宝藏。随口说出课题，阿寻戴上矿工帽这就下铲！”";
const INTRO_ZH =
  "阿寻的小鼻子可灵了！一头扎进 GEO、SRA、ENA、GSA 数据库里刨拉半天，不仅能嗅出高分数据集、啃透繁杂编号，还能把打包好的样本宝藏一口气叼到你跟前。";

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
    <div className="flex h-full flex-col items-center justify-center px-4 py-8">
      <div className="flex min-h-0 w-full max-w-[780px] flex-col items-center">
        {/* Hero 圆润卡片：头像 + 双色主标语 + 副标语 + 便签底介绍 */}
        <div className="hero-card reveal reveal-zoom w-full px-5 pb-6 pt-7 sm:px-8">
          <div className="flex flex-col items-center">
            <div className="gold-glow flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-pet-gold-soft text-pet-amber-deep ring-1 ring-pet-amber/30">
              <BrandMark size={36} />
            </div>
            <h1 className="reveal font-display mt-4 text-center text-[24px] font-bold tracking-tight" data-reveal-delay="80">
              <span className="text-miner-green">{HEADLINE_ZH.green}</span>
              <span className="text-gold">{HEADLINE_ZH.gold}</span>
              <span className="text-foreground">{HEADLINE_ZH.rest}</span>
            </h1>
            <p className="reveal mt-2 max-w-lg text-center text-[14px] leading-relaxed text-muted-foreground" data-reveal-delay="140">
              {SUB_HEADLINE_ZH}
            </p>
            <p className="reveal mt-4 w-full rounded-xl bg-secondary p-4 text-center text-[13.5px] leading-relaxed text-muted-foreground" data-reveal-delay="200">
              {INTRO_ZH}
            </p>
          </div>
        </div>

        {/* 探矿任务看板 */}
        <div className="reveal mt-7 w-full min-h-0 flex-1 space-y-7" data-reveal-delay="280">
          {picked.map((g, gi) => (
            <section key={g.label}>
              <GroupHeader label={g.label} caption={g.caption} index={String(gi + 1).padStart(2, "0")} emoji={GROUP_EMOJI[gi] ?? "⛏️"} />
              <ul className="mt-2 flex flex-col gap-2">
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

function GroupHeader({ label, caption, index, emoji }: { label: string; caption: string; index: string; emoji: string }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="font-display text-[15px] font-semibold text-miner-green">{index}</span>
      <span className="text-[13px] font-semibold tracking-wide text-foreground">
        {label} <span aria-hidden>{emoji}</span>
      </span>
      {/* 胶囊小标签：浅绿（探矿定位）/ 浅琥珀（验宝鉴宝、清点矿藏） */}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] ${
          index === "01" ? "bg-miner-green-light text-miner-green-hover" : "bg-gold-light text-gold-hover"
        }`}
      >
        [{caption}]
      </span>
    </div>
  );
}

function ExampleRow({ q, onPick }: { q: string; onPick: (q: string) => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onPick(q)}
      className="quest-pill group flex w-full items-center gap-2 text-left"
    >
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/85 transition-colors group-hover:text-gold-hover">
        {q}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        ⛏
      </span>
    </button>
  );
}
