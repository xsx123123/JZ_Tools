// Markdown 渲染：react-markdown + GFM + highlight.js 语法高亮（保留 .md-body 样式壳）
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export function Markdown({ text }: { text: string }): React.ReactElement {
  return (
    <div className="md-body text-[14.5px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ node: _n, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" className="story-link no-underline hover:underline" />
          ),
          table: ({ node: _n, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
          pre: ({ node: _n, children, ...props }) => (
            <div className="code-block">
              <pre {...props}>{children}</pre>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
