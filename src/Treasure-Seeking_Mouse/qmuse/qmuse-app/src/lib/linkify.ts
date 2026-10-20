// v2.1 正文内嵌超链接：编号模式与 URL 映射（模块级常量，禁止在 render 里重建）
// 渲染层注入链接，Markdown 源文本保持干净；查不到映射的 ID 保持纯文本，不出死链

export type LinkType = "geo_series" | "geo_sample" | "go_term" | "pubmed";

export interface IdMatch {
  type: LinkType;
  id: string; // 完整编号（含前缀，如 GSE12345 / GO:0008150）
  url: string;
}

/** 匹配顺序即优先级：先匹配带前缀的完整编号，PMID 兼容 "PMID: 123456" 空格写法 */
const PATTERNS: [RegExp, LinkType][] = [
  [/\b(GSE\d{3,7})\b/g, "geo_series"],
  [/\b(GSM\d{3,7})\b/g, "geo_sample"],
  [/\b(GO:\d{7})\b/g, "go_term"],
  [/\bPMID:?\s?(\d{6,9})\b/g, "pubmed"],
];

const URL_MAP: Record<LinkType, (id: string) => string> = {
  geo_series: (id) => `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${id}`,
  geo_sample: (id) => `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${id}`,
  go_term: (id) => `https://amigo.geneontology.org/amigo/term/${id}`,
  pubmed: (id) => `https://pubmed.ncbi.nlm.nih.gov/${id}`,
};

/** 返回类型标签（浮层/无障碍用） */
export const LINK_TYPE_LABEL: Record<LinkType, string> = {
  geo_series: "GEO 系列",
  geo_sample: "GEO 样本",
  go_term: "GO 条目",
  pubmed: "PubMed 文献",
};

/**
 * 扫描一段纯文本，返回其中所有可链接编号（按出现位置排序）。
 * 只做检测；切分逻辑由 rehype 插件用 match 的索引完成。
 */
export function scanText(text: string): IdMatch[] {
  const hits: (IdMatch & { start: number })[] = [];
  for (const [re, type] of PATTERNS) {
    re.lastIndex = 0; // /g 正则复用需手动复位
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({
        type,
        id: type === "pubmed" ? `PMID:${m[1]}` : m[1],
        url: type === "pubmed" ? URL_MAP.pubmed(m[1]) : URL_MAP[type](m[1]),
        start: m.index,
      });
      // 防零宽匹配死循环（当前模式都非零宽，防御性保留）
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // 按出现位置排序；重叠时（理论不出现）保留先命中的
  hits.sort((a, b) => a.start - b.start);
  const out: IdMatch[] = [];
  let end = -1;
  for (const h of hits) {
    if (h.start >= end) {
      out.push(h);
      end = h.start + (h.type === "pubmed" ? `PMID:${h.id.slice(5)}`.length : h.id.length);
    }
  }
  return out;
}
