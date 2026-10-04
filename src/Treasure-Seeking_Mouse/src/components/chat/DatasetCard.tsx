// GEO/SRA 数据集结果卡片：编号类型徽章 + 标题 + 元信息 + 外链 + T2 文献入口
import { BookOpen, ExternalLink } from "lucide-react";
import type { DatasetCard as CardData } from "@/services/seqoutChat";
import { requestEvidence } from "@/lib/evidenceBus";

const NCBI_BASE: Record<string, string> = {
  GSE: "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=",
  GSM: "https://www.ncbi.nlm.nih.gov/geo/samples/",
  GDS: "https://www.ncbi.nlm.nih.gov/geo/datasets/",
  SRP: "https://www.ncbi.nlm.nih.gov/bioproject/",
  SRR: "https://trace.ncbi.nlm.nih.gov/Traces/sra/?run=",
  SRX: "https://www.ncbi.nlm.nih.gov/sra/?term=",
  PRJNA: "https://www.ncbi.nlm.nih.gov/bioproject/",
  DRR: "https://trace.ncbi.nlm.nih.gov/Traces/sra/?run=",
};

function buildLink(accession: string): string | null {
  const m = accession.match(/^(GSE|GSM|GDS|SRP|SRR|SRX|PRJNA|DRR)\d+$/i);
  if (!m) return null;
  const base = NCBI_BASE[m[1].toUpperCase()];
  return base ? `${base}${accession.toUpperCase()}` : null;
}

// 编号前缀 → 类型徽章（GEO 系列 teal、SRA/PRJ 系列 strand 青蓝）
const PREFIX_COLORS: Record<string, string> = {
  GSE: "bg-helix-soft text-helix ring-helix/20",
  GSM: "bg-helix-soft text-helix ring-helix/25",
  GDS: "bg-helix-soft text-helix ring-helix/20",
  SRP: "bg-strand/10 text-strand ring-strand/20",
  SRR: "bg-strand/10 text-strand ring-strand/25",
  SRX: "bg-strand/10 text-strand ring-strand/20",
  PRJNA: "bg-strand/10 text-strand ring-strand/20",
  DRR: "bg-strand/10 text-strand ring-strand/25",
};

function prefixOf(accession: string): string | null {
  const m = accession.match(/^(GSE|GSM|GDS|SRP|SRR|SRX|PRJNA|DRR)/i);
  return m ? m[1].toUpperCase() : null;
}

/** 编号前缀 → 文献联动的 kind（GSE/GSM 有专门检索策略，其余暂不联动） */
const LIT_KIND: Record<string, string> = {
  GSE: "geo_series",
  GSM: "geo_sample",
};

/** T2 文献入口：GEO 条目向 NCBI 检索关联文献；hostMessageId 锚定卡片渲染位置 */
function onLiterature(accession: string, hostMessageId?: string): void {
  const prefix = prefixOf(accession);
  const kind = prefix ? LIT_KIND[prefix] : undefined;
  if (kind) requestEvidence({ kind, id: accession.toUpperCase(), hostMessageId });
}

export function DatasetCardView({ card, hostMessageId }: { card: CardData; hostMessageId?: string }): React.ReactElement {
  const link = buildLink(card.accession);
  const prefix = prefixOf(card.accession);
  const metaEntries = Object.entries(card.meta ?? {}).filter(
    ([k, v]) => v && ["organism", "title", "summary"].indexOf(k) === -1,
  );
  return (
    <div className="hover-lift card-in relative overflow-hidden rounded-lg border border-border bg-card p-2.5 pl-3.5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-gradient-to-b before:from-pet-amber/70 before:to-helix/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {prefix ? (
            <span className={`shrink-0 rounded px-1 py-px font-mono text-[9px] font-semibold leading-none tracking-wider ring-1 ${PREFIX_COLORS[prefix] ?? "bg-muted text-muted-foreground ring-border"}`}>
              {prefix}
            </span>
          ) : null}
          <a
            href={link ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className={`font-mono text-[12px] font-semibold tracking-wide text-helix ${link ? "story-link" : "pointer-events-none"}`}
          >
            {card.accession.toUpperCase()}
          </a>
        </div>
        {link ? (
          <div className="flex shrink-0 items-center gap-1">
            {LIT_KIND[prefix ?? ""] ? (
              <button
                type="button"
                onClick={() => onLiterature(card.accession, hostMessageId)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-helix"
                title="查看关联文献（证据链）"
                aria-label="查看关联文献"
              >
                <BookOpen size={12} />
              </button>
            ) : null}
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-muted-foreground transition-colors hover:text-helix"
              title="在 NCBI 打开"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-1 text-[12.5px] leading-snug text-foreground">{card.title}</p>
      {card.meta?.organism ? (
        <p className="mt-1 truncate text-[11px] italic text-strand">{card.meta.organism}</p>
      ) : null}
      {metaEntries.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
          {metaEntries.slice(0, 3).map(([k, v]) => (
            <span key={k} className="text-[10.5px] text-muted-foreground">
              <span className="text-muted-foreground/70">{k}: </span>
              {String(v).length > 28 ? `${String(v).slice(0, 28)}…` : v}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DatasetCardGrid({ cards, hostMessageId }: { cards: CardData[]; hostMessageId?: string }): React.ReactElement | null {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c, i) => (
        <DatasetCardView key={`${c.accession}-${i}`} card={c} hostMessageId={hostMessageId} />
      ))}
    </div>
  );
}
