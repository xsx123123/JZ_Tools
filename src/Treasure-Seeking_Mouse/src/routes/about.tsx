// 关于页：产品介绍图
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import introImg from "@/assets/about/intro.png";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

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

        <p className="mt-4 text-center font-mono text-[11px] text-muted-foreground/70">
          对话式组学数据检索 · 数据来自 seqout.org 公共 API · 回答由 AI 生成，请以 NCBI / NGDC 原始页面为准
        </p>
      </div>
    </div>
  );
}
