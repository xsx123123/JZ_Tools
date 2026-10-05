// Markdown 渲染：react-markdown + GFM + highlight.js 语法高亮（保留 .md-body 样式壳）
// 整个组件 memo 化：流式输出时未变化的消息不会重复 parse/高亮（长对话卡顿的主要优化点）
// v2.1：rehype 插件在 AST 层把正文中的 GSE/GSM/GO:/PMID 编号注入 <idlink>（源文本保持干净）
import { memo, createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { scanText, type IdMatch } from "@/lib/linkify";
import { IdLink } from "./IdLink";

/** 宿主消息 id 上下文：IdLink 的"查看证据链"请求据此锚定渲染位置 */
const HostMessageContext = createContext<string | null>(null);
/** 流式期间为 false：禁止消费/展示编号发现提示，防止树重挂载把提示「吃掉」（用户根本看不到） */
export const AllowLinkHintContext = createContext(true);

// ---------- rehype 插件：text 节点切分 + <idlink> 元素注入 ----------

/** hast 节点最小结构（@types/hast 非直接依赖，手写所需字段） */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** 单条消息注入链接数上限：防极端长文一次渲染上千 HoverCard 卡顿 */
const MAX_LINKS_PER_MESSAGE = 200;

const SKIP_TAGS = new Set(["code", "pre", "a", "script", "style"]);

function isSkipped(node: HastNode): boolean {
  return node.type === "element" && node.tagName ? SKIP_TAGS.has(node.tagName.toLowerCase()) : false;
}

/** 把一个 text 节点替换为 [text, idlink, text, idlink, ...] 兄弟序列；返回 null 表示无需切分 */
function splitTextNode(node: HastNode, budget: { left: number }): HastNode[] | null {
  const text = node.value ?? "";
  const hits = scanText(text);
  if (hits.length === 0 || budget.left <= 0) return null;
  const usable = hits.slice(0, budget.left);
  const pieces: HastNode[] = [];
  let last = 0;
  for (const hit of usable) {
    const idx = locateRaw(text, hit, last);
    if (idx < 0) continue;
    if (idx > last) pieces.push({ type: "text", value: text.slice(last, idx) });
    pieces.push({
      type: "element",
      tagName: "idlink",
      properties: { hit },
      children: [{ type: "text", value: hit.id }],
    });
    last = idx + rawLength(text, hit, idx);
    budget.left--;
  }
  if (pieces.length === 0) return null;
  if (last < text.length) pieces.push({ type: "text", value: text.slice(last) });
  return pieces;
}

/** 在 text 中从 offset 起定位命中片段的原文起点（PMID 兼容 "PMID: 123" 空格写法） */
function locateRaw(text: string, hit: IdMatch, offset: number): number {
  if (hit.type !== "pubmed") return text.indexOf(hit.id, offset);
  const re = /\bPMID:?\s?(\d{6,9})\b/g;
  re.lastIndex = offset;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === hit.id.slice(5)) return m.index;
  }
  return -1;
}

/** 命中片段在原文中的实际长度（PMID 写法可能是 "PMID:123" 或 "PMID: 123"） */
function rawLength(text: string, hit: IdMatch, start: number): number {
  if (hit.type !== "pubmed") return hit.id.length;
  const re = /\bPMID:?\s?(\d{6,9})\b/g;
  re.lastIndex = start;
  const m = re.exec(text);
  return m ? m[0].length : hit.id.length;
}

/** 深度遍历：跳过 code/pre/a 子树；text 命中则替换为兄弟序列 */
function walk(node: HastNode, budget: { left: number }): void {
  if (isSkipped(node)) return;
  if (!node.children) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "text" && typeof child.value === "string") {
      const pieces = splitTextNode(child, budget);
      if (pieces) {
        node.children.splice(i, 1, ...pieces);
        i += pieces.length - 1;
      }
    } else {
      walk(child, budget);
    }
  }
}

function rehypeLinkify() {
  return (tree: HastNode) => {
    walk(tree, { left: MAX_LINKS_PER_MESSAGE });
  };
}

// ---------- 渲染：idlink 元素 → IdLink 组件 ----------

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: [typeof rehypeHighlight | typeof rehypeLinkify, Record<string, unknown>][] = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  [rehypeLinkify, {}],
];

/** idlink 渲染器：大写开头组件（oxlint rules-of-hooks 要求 hook 只在组件里调用） */
function IdLinkRenderer({ node }: { node?: unknown }): React.ReactElement | null {
  const hit = (node as { properties?: { hit?: IdMatch } } | undefined)?.properties?.hit;
  const hostMessageId = useContext(HostMessageContext);
  return hit ? <IdLink match={hit} hostMessageId={hostMessageId ?? undefined} /> : null;
}

const COMPONENTS = {
  idlink: IdLinkRenderer,
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

export const Markdown = memo(function Markdown({
  text,
  hostMessageId,
  allowLinkHint = true,
}: {
  text: string;
  hostMessageId?: string;
  /** 流式期间传 false：提示只在消息定稿后消费/展示（默认 true，历史消息等无流式场景无需关心） */
  allowLinkHint?: boolean;
}): React.ReactElement {
  return (
    <HostMessageContext.Provider value={hostMessageId ?? null}>
      <AllowLinkHintContext.Provider value={allowLinkHint}>
        <div className="md-body text-[14.5px]">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
            {text}
          </ReactMarkdown>
        </div>
      </AllowLinkHintContext.Provider>
    </HostMessageContext.Provider>
  );
});
