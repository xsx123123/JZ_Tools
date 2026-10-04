// Markdown 渲染：react-markdown + GFM + highlight.js 语法高亮（保留 .md-body 样式壳）
// 整个组件 memo 化：流式输出时未变化的消息不会重复 parse/高亮（长对话卡顿的主要优化点）
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: [typeof rehypeHighlight, { detect: boolean; ignoreMissing: boolean }][] = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

const COMPONENTS = {
  a: ({ node: _n, ...props }: { node?: unknown } & React.ComponentProps<"a">) => (
    <a {...props} target="_blank" rel="noreferrer noopener" className="story-link no-underline hover:underline" />
  ),
  table: ({ node: _n, ...props }: { node?: unknown } & React.ComponentProps<"table">) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  pre: ({ node: _n, children, ...props }: { node?: unknown; children?: React.ReactNode } & React.ComponentProps<"pre">) => (
    <div className="code-block">
      <pre {...props}>{children}</pre>
    </div>
  ),
};

export const Markdown = memo(function Markdown({ text }: { text: string }): React.ReactElement {
  return (
    <div className="md-body text-[14.5px]">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
