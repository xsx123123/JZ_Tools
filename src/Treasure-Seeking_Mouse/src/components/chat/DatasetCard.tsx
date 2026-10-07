// GEO/SRA 数据集结果卡片：编号类型徽章 + 标题 + 元信息 + 外链 + T2 文献入口
import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, FileText } from "lucide-react";
import type { DatasetCard as CardData } from "@/services/seqoutChat";
import { requestEvidence } from "@/lib/evidenceBus";
import { useI18n } from "@/i18n/provider";

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

const DAC_URL = "https://ngdc.cncb.ac.cn/gsa-human/";

function buildLink(accession: string): string | null {
  if (/^GWH[A-Z0-9]+$/i.test(accession)) return `https://ngdc.cncb.ac.cn/gwh/assembly/${accession.toUpperCase()}`;
  if (/^PRJCA\d+$/i.test(accession)) return `https://ngdc.cncb.ac.cn/gwh/bioProject/${accession.toUpperCase()}`;
  if (/^SAMC\d+$/i.test(accession)) return `https://ngdc.cncb.ac.cn/gwh/bioSample/${accession.toUpperCase()}`;
  if (/^C_[A-Z]{2}\d+\.\d+$/i.test(accession)) return `https://ngdc.cncb.ac.cn/genbase/sequence/${accession.toUpperCase()}`;
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
  const { t } = useI18n();
  if (card.meta?.source === "literature") return <LiteratureResultCard card={card} />;
  const link = buildLink(card.accession);
  const prefix = prefixOf(card.accession);
  const controlled = /^HRA\d+$/i.test(card.accession) || card.meta?.controlled === "true";
  const gsaPublic = card.meta?.source?.toLowerCase() === "gsa" && !controlled;
  const mirrorUrl = card.meta?.mirror_url || card.meta?.download_url;
  // 📖 点击反馈：短暂高亮 + 卡片描边脉冲（文献卡片在消息层渲染时的视觉锚点）
  const [litClicked, setLitClicked] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);

  function onLiteratureClick(): void {
    onLiterature(card.accession, hostMessageId);
    setLitClicked(true);
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => setLitClicked(false), 2000);
  }

  const metaEntries = Object.entries(card.meta ?? {}).filter(
    ([k, v]) => v && ["organism", "title", "summary"].indexOf(k) === -1,
  );
  return (
    <div
      className={`hover-lift card-in relative overflow-hidden rounded-lg border bg-card p-2.5 pl-3.5 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-gradient-to-b before:from-pet-amber/70 before:to-helix/50 ${litClicked ? "border-helix/60 ring-2 ring-helix/20" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {prefix ? (
            <span className={`shrink-0 rounded px-1 py-px font-mono text-[9px] font-semibold leading-none tracking-wider ring-1 ${PREFIX_COLORS[prefix] ?? "bg-muted text-muted-foreground ring-border"}`}>
              {prefix}
            </span>
          ) : null}
          {gsaPublic ? <span className="shrink-0 rounded bg-helix-soft px-1 py-px text-[9px] font-medium text-helix ring-1 ring-helix/20">{t("card.gsaMirror")}</span> : null}
          {controlled ? <a href={DAC_URL} target="_blank" rel="noreferrer noopener" className="shrink-0 rounded bg-pet-amber/15 px-1 py-px text-[9px] font-medium text-pet-amber ring-1 ring-pet-amber/30">{t("card.controlled")}</a> : null}
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
                onClick={onLiteratureClick}
                className={`rounded-md p-1 transition-colors hover:bg-secondary hover:text-helix ${litClicked ? "bg-helix-soft text-helix" : "text-muted-foreground"}`}
                title={t("card.literature")}
                aria-label={t("card.literatureAria")}
              >
                <BookOpen size={12} />
              </button>
            ) : null}
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 text-muted-foreground transition-colors hover:text-helix"
              title={t("card.openNcbi")}
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
      {mirrorUrl && gsaPublic ? (
        <a href={mirrorUrl} target="_blank" rel="noreferrer noopener" className="mt-1.5 inline-flex text-[10.5px] text-helix story-link">{t("card.openGsaMirror")}</a>
      ) : null}
    </div>
  );
}

function LiteratureResultCard({ card }: { card: CardData }): React.ReactElement {
  const { t } = useI18n();
  const meta = card.meta ?? {};
  const authors = meta.authors;
  const abstract = card.summary?.trim();
  const link = (key: string): string | undefined => meta[`url_${key}`] || undefined;
  return (
    <article className="hover-lift card-in relative overflow-hidden rounded-lg border border-helix/25 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 rounded bg-helix-soft px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-helix ring-1 ring-helix/20">
              {meta.literature_source === "pubmed" ? "PubMed" : "Europe PMC"}
            </span>
            {meta.isOpenAccess === "true" ? <span className="shrink-0 rounded bg-helix-soft px-1.5 py-px text-[9px] text-helix">OA</span> : null}
            <span className="font-mono text-[10px] text-muted-foreground">{meta.pmid ? `PMID: ${meta.pmid}` : card.accession}</span>
          </div>
          <h3 className="line-clamp-3 text-[13px] font-semibold leading-snug text-foreground">{card.title}</h3>
        </div>
        {link("pubmed") ? (
          <a href={link("pubmed")} target="_blank" rel="noreferrer noopener" className="shrink-0 text-muted-foreground hover:text-helix" title={t("lit.openPubmed")} aria-label={t("lit.openPubmed")}>
            <ExternalLink size={13} />
          </a>
        ) : null}
      </div>
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        {[authors, meta.journal, meta.year].filter(Boolean).join(" · ")}
      </p>
      {abstract ? <p className="mt-2 line-clamp-4 text-[11.5px] leading-relaxed text-foreground/80">{abstract}</p> : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2">
        {link("pubmed") ? <a href={link("pubmed")} target="_blank" rel="noreferrer noopener" className="story-link inline-flex items-center gap-1 text-[10.5px] text-helix"><ExternalLink size={10} />{t("lit.pubmed")}</a> : null}
        {link("europe_pmc") ? <a href={link("europe_pmc")} target="_blank" rel="noreferrer noopener" className="story-link inline-flex items-center gap-1 text-[10.5px] text-helix"><ExternalLink size={10} />Europe PMC</a> : null}
        {link("doi") ? <a href={link("doi")} target="_blank" rel="noreferrer noopener" className="story-link inline-flex items-center gap-1 text-[10.5px] text-helix"><ExternalLink size={10} />{t("lit.doi")}</a> : null}
        {link("full_text") ? <a href={link("full_text")} target="_blank" rel="noreferrer noopener" className="story-link inline-flex items-center gap-1 text-[10.5px] text-helix"><FileText size={10} />{t("lit.fullText")}</a> : null}
        {link("google_scholar_search") ? <a href={link("google_scholar_search")} target="_blank" rel="noreferrer noopener" className="story-link inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"><ExternalLink size={10} />{t("lit.googleScholar")}</a> : null}
      </div>
    </article>
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
