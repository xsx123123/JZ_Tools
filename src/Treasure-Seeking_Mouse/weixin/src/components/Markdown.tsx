// 【小程序版】轻量 Markdown 渲染（段落/粗体/斜体/行内代码/代码块/列表/标题/链接 + 编号内嵌链接）
// 对应网页版 src/components/chat/Markdown.tsx + IdLink.tsx：
//   网页版用 react-markdown + rehype 插件注入 <idlink>；小程序主包 2MB 限制，不引第三方
//   渲染库，这里手写「块级切分 + 行内递归解析」的最小实现，输出 Taro View/Text。
//   样式壳沿用 theme.css 的 .md-body / .id-link（本文件的 .md-* 显式类名见 markdown.css）。
import { memo, useMemo, type ReactNode } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scanText, linkTypeLabel, type IdMatch } from '@/lib/linkify'
import { requestEvidence } from '@/lib/evidenceBus'
import { copyLinkWithConfirm } from '@/lib/copyLink'
import { useI18n } from '@/i18n/provider'
import './markdown.css'

/** 单条消息注入链接数上限：对齐网页版，防极端长文一次渲染上千链接卡顿 */
const MAX_LINKS_PER_MESSAGE = 200

// ---------- 块级解析 ----------

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' }

export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 代码块围栏：``` 可带语言标注；跨行收集到闭合围栏
    const fence = line.match(/^\s*```(\S*)\s*$/)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过闭合围栏（缺失闭合也能兜底收尾）
      blocks.push({ kind: 'code', lang: fence[1] ?? '', text: buf.join('\n') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const h = line.match(/^\s*(#{1,3})\s+(.*)$/)
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, text: h[2] })
      i++
      continue
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    if (ul) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*+]\s+(.*)$/)
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ol) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.)]\s+(.*)$/)
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'quote', text: buf.join('\n') })
      continue
    }
    // 段落：连续非空行合并
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,3}\s|[-*+]\s|\d+[.)]\s|>)/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: 'p', text: buf.join('\n') })
  }
  return blocks
}

// ---------- 行内解析（递归处理粗体/斜体嵌套） ----------

type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'italic'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string }

export function parseInline(text: string): Inline[] {
  const tokens: Inline[] = []
  let plainStart = 0
  let i = 0
  const flush = (end: number) => {
    if (end > plainStart) tokens.push({ kind: 'text', text: text.slice(plainStart, end) })
  }
  while (i < text.length) {
    const rest = text.slice(i)
    let m: RegExpMatchArray | null
    if ((m = rest.match(/^\*\*([^]+?)\*\*/))) {
      flush(i)
      tokens.push({ kind: 'bold', children: parseInline(m[1]) })
      i += m[0].length
      plainStart = i
    } else if ((m = rest.match(/^\*([^*]+)\*/)) ?? (m = rest.match(/^_([^_]+)_/))) {
      flush(i)
      tokens.push({ kind: 'italic', children: parseInline(m[1]) })
      i += m[0].length
      plainStart = i
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      flush(i)
      tokens.push({ kind: 'code', text: m[1] })
      i += m[0].length
      plainStart = i
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      flush(i)
      tokens.push({ kind: 'link', text: m[1], url: m[2] })
      i += m[0].length
      plainStart = i
    } else {
      i++
    }
  }
  flush(text.length)
  return tokens
}

// ---------- 编号命中切分（PMID 兼容 "PMID: 123" 空格写法，对齐网页版 rehype 插件） ----------

function locateRaw(text: string, hit: IdMatch, offset: number): number {
  if (hit.type !== 'pubmed') return text.indexOf(hit.id, offset)
  const re = /\bPMID:?\s?(\d{6,9})\b/g
  re.lastIndex = offset
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1] === hit.id.slice(5)) return m.index
  }
  return -1
}

function rawLength(text: string, hit: IdMatch, start: number): number {
  if (hit.type !== 'pubmed') return hit.id.length
  const re = /\bPMID:?\s?(\d{6,9})\b/g
  re.lastIndex = start
  const m = re.exec(text)
  return m ? m[0].length : hit.id.length
}

// ---------- 点击复制（小程序无新窗口打开能力的替代方案） ----------

/**
 * 点击编号/链接 → showModal 展示原始页地址 → 确认后复制到剪贴板，由用户粘贴到浏览器打开。
 * （小程序不能用网页版的新窗口打开跳外站，web-view 又需配置业务域名；
 *   复制链接是当前最小可用方案，待 R3 接真实域名后再评估跳转方案。）
 */
function useCopyLink() {
  const { t } = useI18n()
  return (title: string, url: string) => {
    void Taro.showModal({
      title,
      content: url,
      confirmText: t('idlink.copyId'),
      cancelText: t('board.cancel'),
      success: (r) => {
        if (r.confirm) void Taro.setClipboardData({ data: url })
      },
    })
  }
}

// ---------- 编号点击交互 ----------

/**
 * 点击编号 → ActionSheet 两个动作：
 *   1) 复制链接：沿用「弹窗确认 → 复制」（小程序不能用网页版的新窗口打开跳外站，
 *      web-view 又需配置业务域名；复制链接是当前最小可用方案）
 *   2) 查看证据链：经 evidenceBus 抛给页面层，在宿主消息下方渲染文献卡片（R3）
 */
function useIdAction() {
  const { t, lang } = useI18n()
  return (hit: IdMatch, hostMessageId?: string) => {
    void Taro.showActionSheet({
      itemList: [t('idlink.copyId'), t('idlink.viewEvidence')],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          copyLinkWithConfirm(t, linkTypeLabel(lang, hit.type), hit.url)
        } else if (tapIndex === 1) {
          requestEvidence({ kind: hit.type, id: hit.id, match: hit, hostMessageId })
        }
      },
      fail: () => undefined, // 用户取消不算错误
    })
  }
}

// ---------- 渲染 ----------

function InlineNodes({ nodes, budget, hostMessageId }: { nodes: Inline[]; budget: { left: number }; hostMessageId?: string }) {
  const { lang } = useI18n()
  const copyLink = useCopyLink()
  const idAction = useIdAction()
  return (
    <>
      {nodes.map((n, idx) => {
        if (n.kind === 'bold') {
          return (
            <Text key={idx} style={{ fontWeight: 600 }}>
              <InlineNodes nodes={n.children} budget={budget} hostMessageId={hostMessageId} />
            </Text>
          )
        }
        if (n.kind === 'italic') {
          return (
            <Text key={idx} style={{ fontStyle: 'italic' }}>
              <InlineNodes nodes={n.children} budget={budget} hostMessageId={hostMessageId} />
            </Text>
          )
        }
        if (n.kind === 'code') {
          // 行内代码不做编号链接化（对齐网页版 SKIP_TAGS 跳过 code）
          return (
            <Text key={idx} className='md-code'>
              {n.text}
            </Text>
          )
        }
        if (n.kind === 'link') {
          return (
            <Text key={idx} className='md-link' onClick={() => copyLink(n.text, n.url)}>
              {n.text}
            </Text>
          )
        }
        // 纯文本：扫描 GSE/GSM/GO:/PMID 编号渲染成可点 IdLink
        return <TextNodes key={idx} text={n.text} budget={budget} lang={lang} hostMessageId={hostMessageId} />
      })}
    </>
  )
}

function TextNodes({
  text,
  budget,
  lang,
  hostMessageId,
}: {
  text: string
  budget: { left: number }
  lang: 'zh' | 'en'
  hostMessageId?: string
}) {
  const idAction = useIdAction()
  const hits = scanText(text)
  if (hits.length === 0 || budget.left <= 0) return <>{text}</>
  const out: ReactNode[] = []
  let cursor = 0
  for (const hit of hits) {
    if (budget.left <= 0) break
    const idx = locateRaw(text, hit, cursor)
    if (idx < 0) continue
    if (idx > cursor) out.push(text.slice(cursor, idx))
    out.push(
      <Text key={`id-${idx}`} className='id-link' onClick={() => idAction(hit, hostMessageId)}>
        {text.slice(idx, idx + rawLength(text, hit, idx))}
      </Text>,
    )
    cursor = idx + rawLength(text, hit, idx)
    budget.left--
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return <>{out}</>
}

export const Markdown = memo(function Markdown({ text, hostMessageId }: { text: string; hostMessageId?: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  // 每条消息一个链接预算（对齐网页版 MAX_LINKS_PER_MESSAGE）
  const budget = useMemo(() => ({ left: MAX_LINKS_PER_MESSAGE }), [text])
  return (
    <View className='md-body'>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return (
              <View key={i} className={`md-h md-h--${b.level}`}>
                <InlineNodes nodes={parseInline(b.text)} budget={budget} hostMessageId={hostMessageId} />
              </View>
            )
          case 'code':
            return (
              <View key={i} className='md-pre'>
                {b.lang ? <Text className='md-pre__lang'>{b.lang}</Text> : null}
                <Text className='md-pre__code'>{b.text}</Text>
              </View>
            )
          case 'ul':
            return (
              <View key={i} className='md-ul'>
                {b.items.map((item, j) => (
                  <View key={j} className='md-li'>
                    <Text>
                      <Text className='md-li__marker'>•</Text>
                      <InlineNodes nodes={parseInline(item)} budget={budget} hostMessageId={hostMessageId} />
                    </Text>
                  </View>
                ))}
              </View>
            )
          case 'ol':
            return (
              <View key={i} className='md-ol'>
                {b.items.map((item, j) => (
                  <View key={j} className='md-li'>
                    <Text>
                      <Text className='md-li__marker'>{j + 1}. </Text>
                      <InlineNodes nodes={parseInline(item)} budget={budget} hostMessageId={hostMessageId} />
                    </Text>
                  </View>
                ))}
              </View>
            )
          case 'quote':
            return (
              <View key={i} className='md-quote'>
                <InlineNodes nodes={parseInline(b.text)} budget={budget} hostMessageId={hostMessageId} />
              </View>
            )
          case 'hr':
            return <View key={i} className='md-hr' />
          default:
            return (
              <View key={i} className='md-p'>
                <InlineNodes nodes={parseInline(b.text)} budget={budget} hostMessageId={hostMessageId} />
              </View>
            )
        }
      })}
    </View>
  )
})
