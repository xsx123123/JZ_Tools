// 关于页：与仓库 README 对齐的产品介绍（核心亮点 / seqout-mcp 对话后端 / 自托管 / 技术栈 / 致谢）
import { useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Database,
  ExternalLink,
  Github,
  Hammer,
  Languages,
  Link2,
  Moon,
  PawPrint,
  Smartphone,
  Sparkles,
  Sun,
  Trophy,
  Wrench,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";
import { readTheme, writeTheme, applyTheme, type Theme } from "@/services/petStore";
import introImg from "@/assets/about/intro.png";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const REPO = "https://github.com/xsx123123/JZ_Tools/tree/main/src/Treasure-Seeking_Mouse";
const ONLINE_DEMO = "https://render.qmuse.pub/p/muse/2842191818002612/index.html";

// 6 个核心亮点：图标固定，标题/描述按语言取词（与 README「功能一览」逐条对齐）
const HIGHLIGHTS = [
  { icon: Database, titleKey: "about.h.1.title", descKey: "about.h.1.desc" },
  { icon: Link2, titleKey: "about.h.2.title", descKey: "about.h.2.desc" },
  { icon: Trophy, titleKey: "about.h.3.title", descKey: "about.h.3.desc" },
  { icon: BarChart3, titleKey: "about.h.4.title", descKey: "about.h.4.desc" },
  { icon: PawPrint, titleKey: "about.h.5.title", descKey: "about.h.5.desc" },
  { icon: Smartphone, titleKey: "about.h.6.title", descKey: "about.h.6.desc" },
] as const satisfies readonly { icon: typeof Database; titleKey: MessageKey; descKey: MessageKey }[];

const STACK_BASE = ["React 19", "TypeScript", "Vite 7", "Tailwind CSS v4", "TanStack Router"];
const STACK_TAIL: Record<"zh" | "en", string[]> = {
  zh: ["Supabase 兼容后端（可选）", "任意 OpenAI 兼容 LLM 网关", "Docker Compose 双容器"],
  en: ["Supabase-compatible backend (optional)", "Any OpenAI-compatible LLM gateway", "Docker Compose (dual container)"],
};

/** 组学数据源与文献索引分开展示，避免把两类来源混为一谈。 */
const DATABASES = ["GEO", "SRA", "ENA", "GSA", "NGDC"];
const LITERATURE_SOURCES = ["PubMed", "Europe PMC", "Crossref", "OpenAlex", "Semantic Scholar", "CORE", "arXiv", "bioRxiv", "medRxiv"];

const linkBtn =
  "flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-sm transition-colors hover:border-helix/50 hover:text-helix";
const sectionCls = "mt-4 rounded-2xl border border-border bg-card p-5 shadow-soft";
const h2Cls = "font-display flex items-center gap-2 text-[17px] font-semibold tracking-tight";

function AboutPage(): React.ReactElement {
  const { t, lang } = useI18n();
  const stack = [...STACK_BASE, ...STACK_TAIL[lang]];
  const navigate = useNavigate();
  // 主题切换：与对话页同一套存储/应用逻辑（readTheme/writeTheme/applyTheme）
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const toggleTheme = useCallback(() => {
    setTheme((cur) => {
      const next: Theme = cur === "dark" ? "light" : "dark";
      writeTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);
  return (
    <div className="bg-grid ambient-glow min-h-dvh px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void navigate({ to: "/" })}
            className={linkBtn}
          >
            <ArrowLeft size={14} /> {t("about.back")}
          </button>
          <span className="hidden items-center gap-2 text-[12.5px] text-muted-foreground sm:flex">
            <BrandMark size={16} />
            {t("brand.name")}
          </span>
          <span className="flex items-center gap-1">
            <LanguageToggle size={15} />
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? t("header.themeDark") : t("header.themeLight")}
              aria-label={t("header.themeAria")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-pet-amber-deep"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-lg">
          <img src={introImg} alt={t("brand.full")} loading="lazy" className="block w-full" draggable={false} />
        </div>

        {/* 立意（与 README「为什么做这只寻宝鼠」一节对齐） */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <PawPrint size={16} className="text-pet-amber-deep" /> {t("about.why")}
          </h2>
          <p className="mt-2 text-[13px] font-medium leading-relaxed text-foreground/85">{t("about.why.1")}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t("about.why.2")}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t("about.why.3")}</p>
        </section>

        {/* 阿寻能挖的数据库（与 README 同名一节对齐） */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <Database size={16} className="text-pet-amber-deep" /> {t("about.dbs")}
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t("about.dbsIntro")}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t("about.gsaPolicy")}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DATABASES.map((db) => (
              <span
                key={db}
                className="rounded-full border border-helix/25 bg-helix-soft/50 px-2.5 py-1 font-mono text-[11.5px] text-helix"
              >
                {db}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] font-medium text-foreground/80">{t("about.literatureSources")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LITERATURE_SOURCES.map((source) => (
              <span
                key={source}
                className="rounded-full border border-pet-amber-deep/25 bg-pet-amber-soft/50 px-2.5 py-1 font-mono text-[11.5px] text-pet-amber-deep"
              >
                {source}
              </span>
            ))}
          </div>
        </section>

        {/* 核心亮点（与 README 功能一览逐条对齐） */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <Sparkles size={16} className="text-pet-amber-deep" /> {t("about.highlights")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <div key={h.titleKey} className="rounded-xl border border-border/70 bg-background/50 p-3.5">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <h.icon size={14} className="text-helix" />
                  {t(h.titleKey)}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{t(h.descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 对话后端：seqout-mcp（README 备注段的等价表述） */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <Database size={16} className="text-pet-amber-deep" /> {t("about.mcpTitle")}
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("about.mcpNote", { mcp: "seqout-mcp", seqout: "seqout.org" })
              .split(/(seqout-mcp|seqout\.org)/)
              .map((part, i) =>
                part === "seqout-mcp" || part === "seqout.org" ? (
                  <code key={i} className="rounded bg-secondary px-1 font-mono text-[11.5px]">{part}</code>
                ) : (
                  part
                ),
              )}
          </p>
          <a
            href="https://github.com/xsx123123/JZ_Tools/tree/main/src/seqout-mcp"
            target="_blank"
            rel="noreferrer"
            className={`${linkBtn} mt-3 w-fit`}
          >
            <ExternalLink size={13} /> seqout-mcp
          </a>
        </section>

        {/* 快速部署 */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <Hammer size={16} className="text-pet-amber-deep" /> {t("about.deploy")}
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("about.deployDesc", { env: "server/.env" })}
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-secondary/60 p-3 font-mono text-[12px] leading-relaxed text-foreground/85">
{`cp server/.env.example server/.env   # ${t("about.deployKey")}
make docker-start                    # ${t("about.deploySteps")}`}
          </pre>
          <p className="mt-2 text-[11.5px] text-muted-foreground/80">
            {t("about.deployOpen", { url: "http://localhost:10087/" })}
          </p>
        </section>

        {/* 技术栈 */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <Wrench size={16} className="text-pet-amber-deep" /> {t("about.stack")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stack.map((s) => (
              <span key={s} className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11.5px] text-foreground/80">
                {s}
              </span>
            ))}
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground/75">
            <Languages size={13} className="text-helix" />
            {t("about.stackNote")} · 中文 / English
          </p>
        </section>

        {/* 致谢（与 README 尾部一致的品牌图标行） */}
        <section className={sectionCls}>
          <h2 className={h2Cls}>
            <Sparkles size={16} className="text-pet-amber-deep" /> {t("about.thanks")}
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("about.authors", { qmuse: "QMuse" })}
          </p>
        </section>

        <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground/70">
          {t("about.footer")} · {t("about.version")}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href={ONLINE_DEMO} target="_blank" rel="noreferrer" className={linkBtn}>
            <ExternalLink size={14} />
            {t("about.online")}
          </a>
          <a href={REPO} target="_blank" rel="noreferrer" className={linkBtn}>
            <Github size={14} />
            {t("about.github")}
          </a>
          <a href={`${REPO}/blob/main/docs/DETAILED_README.md`} target="_blank" rel="noreferrer" className={linkBtn}>
            <BookOpen size={14} />
            {t("about.docs")}
          </a>
        </div>
      </div>
    </div>
  );
}
