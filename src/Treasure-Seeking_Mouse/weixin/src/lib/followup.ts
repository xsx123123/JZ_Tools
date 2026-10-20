// 【小程序版】:::followup 建议块解析（纯函数，与 Web 版 src/components/chat/SuggestionBlock.tsx 的 extractFollowups 同逻辑）
// 从助手回复中抽取 :::followup 围栏：main 为去掉围栏后的正文，items 为逐条建议（可点击直接发送）。

export interface FollowupExtraction {
  main: string;
  items: string[];
}

export function extractFollowups(content: string): FollowupExtraction {
  const m = content.match(/:::followup\s*\n([\s\S]*?)\n\s*:::/);
  if (!m) return { main: content, items: [] };
  const items = m[1]
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、])\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
  const main = (content.slice(0, m.index) + content.slice((m.index ?? 0) + m[0].length)).trimEnd();
  return { main, items };
}
