// 关于页：产品介绍（README 精简版）+ 产品介绍图
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Database, Github, Hammer, PawPrint, Sparkles, Wrench } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import introImg from "@/assets/about/intro.png";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const HIGHLIGHTS = [
  {
    icon: Database,
    title: "26 个只读检索工具",
    desc: "覆盖 GEO / SRA / ENA / GSA 主流组学数据库，自然语言提问即可检索，无需记任何编号语法。",
  },
  {
    icon: Sparkles,
    title: "大模型智能调用",
    desc: "自动选择工具、多轮检索、深度推理；回答附数据卡片与「下一铲建议」，点一下就能追问。",
  },
  {
    icon: BookOpen,
    title: "文献证据链",
    desc: "正文里的 GSE/GSM/PMID 编号自动变成链接，hover 即见论文元数据，一键查看摘要与全文。",
  },
  {
    icon: PawPrint,
    title: "趣味桌宠与成就",
    desc: "寻宝鼠随检索进度挖宝、攒宝藏，累计挖宝解锁成就徽章；还有排行榜与使用统计面板。",
  },
];

const STACK = ["React 19", "TypeScript", "Vite 7", "Tailwind CSS v4", "TanStack Router", "Supabase 兼容", "OpenAI 兼容 LLM", "Docker Compose"];

function AboutPage(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <div className="bg-grid ambient-glow min-h-dvh px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void navigate({ to: "/" })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-sm transition-colors hover:border-helix/50 hover:text-helix"
          >
            <ArrowLeft size={14} /> 返回挖宝
          </button>
          <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <BrandMark size={16} />
            GEO寻宝鼠
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-lg">
          <img src={introImg} alt="GEO寻宝鼠 产品介绍" className="block w-full" draggable={false} />
        </div>

        {/* 核心亮点 */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Sparkles size={16} className="text-pet-amber-deep" /> 核心亮点
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-xl border border-border/70 bg-background/50 p-3.5">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <h.icon size={14} className="text-helix" />
                  {h.title}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 快速部署 */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Hammer size={16} className="text-pet-amber-deep" /> 一键自托管
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            完全脱离云平台：任意 OpenAI 兼容模型（OpenAI / DeepSeek / 硅基流动 / 本地 vLLM）+ Docker 即可运行，
            配置只有一份 <code className="rounded bg-secondary px-1 font-mono text-[11.5px]">server/.env</code>，不配数据库则自动降级纯游客模式。
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-secondary/60 p-3 font-mono text-[12px] leading-relaxed text-foreground/85">
{`cp server/.env.example server/.env   # 填入 LLM_API_KEY
make docker-start                    # 预检密钥 → 构建 → 启动`}
          </pre>
          <p className="mt-2 text-[11.5px] text-muted-foreground/80">
            打开 <code className="font-mono">http://localhost:8080/</code>（端口由 WEB_PORT 控制），发一条消息看到流式回复即部署成功。
          </p>
        </section>

        {/* 技术栈 */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Wrench size={16} className="text-pet-amber-deep" /> 技术栈
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STACK.map((s) => (
              <span key={s} className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11.5px] text-foreground/80">
                {s}
              </span>
            ))}
          </div>
        </section>

        <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground/70">
          对话式组学数据检索 · 数据来自 seqout.org 公共 API · 回答由 AI 生成，请以 NCBI / NGDC 原始页面为准
        </p>

        <div className="mt-4 flex justify-center gap-2">
          <a
            href="https://github.com/xsx123123/JZ_Tools/tree/main/src/Treasure-Seeking_Mouse"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-sm transition-colors hover:border-helix/50 hover:text-helix"
          >
            <Github size={14} />
            GitHub 项目主页
          </a>
          <a
            href="https://github.com/xsx123123/JZ_Tools/blob/main/src/Treasure-Seeking_Mouse/docs/DETAILED_README.md"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-sm transition-colors hover:border-helix/50 hover:text-helix"
          >
            <BookOpen size={14} />
            详细开发文档
          </a>
        </div>
      </div>
    </div>
  );
}
