// 「下载加速」推荐卡片：命中下载意图（调用下载工具 / 正文给出 PRJ、Run 编号）时由平台固定渲染，不依赖模型输出。
// 默认折叠（与「继续寻宝」建议块同款交互），点开看安装与命令示例；GEO-only 空矿项目后端不发事件，不渲染。
import { useState } from "react";
import { Check, ChevronDown, Copy, Download, ExternalLink } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/i18n/provider";

const PROJECT_URL = "https://github.com/xsx123123/polariseq";
const FALLBACK_ACCESSION = "PRJNA833659";
const SEQOUT_API = "https://seqout.org/api";

export function DownloadBoostCard({ accession }: { accession: string | null }): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const known = accession ?? null; // 后端已解析出真实 BioProject 时才展示精确命令与下载链接
  const acc = known ?? FALLBACK_ACCESSION;
  const commands = `polariseq deps install\npolariseq download -A ${acc} -o ./data -p 4 -t 8`;
  // 完整原始 TSV 不经模型、不截断——直接给站点端点，让用户拿到全表
  const sheetUrl = known ? `${SEQOUT_API}/project/${known}/runs/download` : null;

  function onCopy(): void {
    void copyText(commands).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card-in relative mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-gradient-to-b before:from-helix/60 before:to-strand/40">
      {/* 折叠头：标题 + 编号胶囊 + 展开箭头 */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/60"
      >
        <Download size={13} className="shrink-0 text-helix" />
        <span className="text-[12.5px] font-medium text-foreground/80">{t("boost.title")}</span>
        {known ? (
          <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground">{known}</span>
        ) : null}
        <ChevronDown
          size={14}
          className={`ml-auto shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-border/70 p-2.5 pl-3.5">
          <div className="flex items-center justify-end gap-2">
            {sheetUrl ? (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-0.5 text-[11px] text-helix story-link"
                >
                  {t("boost.download")}
                  <Download size={11} />
                </a>
              ) : null}
              <a
                href={PROJECT_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-0.5 text-[11px] text-helix story-link"
              >
                {t("boost.page")}
                <ExternalLink size={11} />
              </a>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{t("boost.desc")}</p>
          <div className="mt-2 rounded-md border border-border bg-muted/60">
            <div className="flex items-center justify-between border-b border-border px-2.5 py-1">
              <span className="font-mono text-[10px] text-muted-foreground/70">polariseq</span>
              <button
                type="button"
                onClick={onCopy}
                title={copied ? t("boost.copied") : t("boost.copy")}
                aria-label={copied ? t("boost.copied") : t("boost.copy")}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-helix"
              >
                {copied ? <Check size={11} className="text-helix" /> : <Copy size={11} />}
                {copied ? t("boost.copied") : t("boost.copy")}
              </button>
            </div>
            <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">{commands}</pre>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
            {known ? t("boost.noteKnown", { acc: known }) : t("boost.note")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
