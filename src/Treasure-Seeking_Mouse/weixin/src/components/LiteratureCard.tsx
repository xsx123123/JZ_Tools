// 【小程序版】T2 文献联动卡片：结构化摘要分段 outline + 原文链接（DOI / PubMed / OA 全文）
// 对应网页版 src/components/chat/LiteratureCard.tsx；差异：
//   - 无 scrollIntoView（小程序 ScrollView 由页面层控制滚动锚点）
//   - 原文链接不能用新窗口打开 → 沿用 R2 的「弹窗确认 → 复制」交互
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useI18n } from '@/i18n/provider'
import { fetchLiterature, type LiteratureCardDTO } from '@/services/literature'
import { copyLinkWithConfirm } from '@/lib/copyLink'
import { requestEvidence } from '@/lib/evidenceBus'
import './markdown.css'
import './panels.css'

export function LiteratureCardPanel({
  kind,
  id,
  onClose,
}: {
  kind: string
  id: string
  onClose?: () => void
}): React.ReactElement {
  const { t } = useI18n()
  const [state, setState] = useState<'loading' | 'done'>('loading')
  const [card, setCard] = useState<LiteratureCardDTO | null>(null)

  useEffect(() => {
    let alive = true
    setState('loading')
    setCard(null)
    void fetchLiterature(kind, id).then((c) => {
      if (!alive) return
      setCard(c)
      setState('done')
    })
    return () => {
      alive = false
    }
  }, [kind, id])

  return (
    <View className='lit card-in'>
      <View className='lit__head'>
        <Text className='lit__title'>📖 {t('lit.title')}</Text>
        <Text className='lit__id'>{id}</Text>
        {onClose ? (
          <Text className='lit__close' onClick={onClose}>
            ✕
          </Text>
        ) : null}
      </View>

      {state === 'loading' ? (
        <View className='lit__body'>
          <View className='lit__skeleton lit__skeleton--1' />
          <View className='lit__skeleton lit__skeleton--2' />
          <View className='lit__skeleton lit__skeleton--3' />
          <Text className='lit__loading'>{t('lit.loading')}</Text>
        </View>
      ) : card?.status === 'ok' ? (
        <View className='lit__body'>
          {card.title ? <Text className='lit__paper-title'>{card.title}</Text> : null}
          <Text className='lit__meta'>
            {[card.journal, card.year, card.pmid ? `PMID: ${card.pmid}` : null].filter(Boolean).join(' · ')}
          </Text>
          {card.outline && card.outline.length > 0 ? (
            <View className='lit__outline'>
              {card.outline.slice(0, 8).map((s, i) => (
                <View key={i} className='lit__section'>
                  <Text className='lit__section-name'>{s.section}</Text>
                  <Text className='lit__section-text'>{s.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {card.urls ? (
            <View className='lit__links'>
              {card.urls.pubmed ? (
                <Text className='lit__link' onClick={() => copyLinkWithConfirm(t, 'PubMed', card.urls?.pubmed ?? '')}>
                  🔗 PubMed
                </Text>
              ) : null}
              {card.urls.doi ? (
                <Text className='lit__link' onClick={() => copyLinkWithConfirm(t, t('lit.doi'), card.urls?.doi ?? '')}>
                  🔗 {t('lit.doi')}
                </Text>
              ) : null}
              {card.urls.full_text ? (
                <Text
                  className='lit__link'
                  onClick={() => copyLinkWithConfirm(t, t('lit.fullText'), card.urls?.full_text ?? '')}
                >
                  📄 {t('lit.fullText')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View className='lit__body'>
          <Text className='lit__notfound'>{t('lit.notFound')}</Text>
          {card?.suggested_queries && card.suggested_queries.length > 0 ? (
            <View className='lit__queries'>
              {card.suggested_queries.slice(0, 3).map((q, i) => (
                <Text key={i} className='lit__query'>
                  {q}
                </Text>
              ))}
            </View>
          ) : null}
          <Text className='lit__hint'>{t('lit.notFoundHint')}</Text>
        </View>
      )}
    </View>
  )
}

/** 编号前缀 → 文献联动的 kind（GSE/GSM 有专门检索策略，其余暂不联动；对齐网页版 DatasetCard.tsx） */
const LIT_KIND: Record<string, string> = {
  GSE: 'geo_series',
  GSM: 'geo_sample',
}

/** 编号前缀 → NCBI 原始页（对齐网页版 DatasetCard.tsx 的 buildLink；仅识别常见前缀） */
const NCBI_BASE: Record<string, string> = {
  GSE: 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=',
  GSM: 'https://www.ncbi.nlm.nih.gov/geo/samples/',
  GDS: 'https://www.ncbi.nlm.nih.gov/geo/datasets/',
  SRP: 'https://www.ncbi.nlm.nih.gov/bioproject/',
  SRR: 'https://trace.ncbi.nlm.nih.gov/Traces/sra/?run=',
  SRX: 'https://www.ncbi.nlm.nih.gov/sra/?term=',
  PRJNA: 'https://www.ncbi.nlm.nih.gov/bioproject/',
  DRR: 'https://trace.ncbi.nlm.nih.gov/Traces/sra/?run=',
}

export function ncbiLink(accession: string): string | null {
  const m = accession.match(/^(GSE|GSM|GDS|SRP|SRR|SRX|PRJNA|DRR)\d+$/i)
  if (!m) return null
  const base = NCBI_BASE[m[1].toUpperCase()]
  return base ? `${base}${accession.toUpperCase()}` : null
}

/** 数据卡片的「📖 文献」入口：向 evidenceBus 抛请求，由宿主消息下方的 LiteratureCardPanel 渲染 */
export function requestCardLiterature(accession: string, hostMessageId?: string): void {
  const m = accession.match(/^(GSE|GSM)/i)
  const kind = m ? LIT_KIND[m[1].toUpperCase()] : undefined
  if (kind) requestEvidence({ kind, id: accession.toUpperCase(), hostMessageId })
}
