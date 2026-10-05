// 【小程序版】使用统计弹窗：累计对话 / token 消耗 / 去重使用人数 / 每个工具的调用次数
// 对应网页版 src/components/chat/UsageStatsDialog.tsx；差异：
//   - 数据源同网页版（对话服务内存聚合 GET <chatEndpoint>/stats），经 seqoutChat.fetchUsageStats
//   - 无 Escape 键盘监听，遮罩点击/关闭按钮退出
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import { useI18n } from '@/i18n/provider'
import { toolLabel, type Lang } from '@/i18n'
import { fetchUsageStats, type UsageStats } from '@/services/seqoutChat'
import './panels.css'

export function UsageStatsDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement | null {
  const { t, lang } = useI18n()
  const [data, setData] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const snap = await fetchUsageStats()
    if (snap) setData(snap)
    else setError(true)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (!open) return null

  const maxTool = data && data.tools.length ? data.tools[0].count : 0
  const fmt = (n: number) => n.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
  /** 大数字缩写：1,234,567 → 1.2M；44,836 → 44.8K（Token 用量专用） */
  const fmtK = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
    : String(n)

  return (
    <View className='dialog-wrap'>
      <View className='mask' onClick={onClose} />
      <View className='dialog'>
        <View className='drawer__head'>
          <Text className='drawer__title'>📊 {t('stats.title')}</Text>
          <Text className='icon-btn' onClick={() => void load()}>
            {loading ? '⏳' : '🔄'}
          </Text>
          <Text className='icon-btn' onClick={onClose}>
            ✕
          </Text>
        </View>

        <ScrollView className='stats__body' scrollY>
          {error ? (
            <Text className='stats__error'>{t('err.statsUnavailable')}</Text>
          ) : !data ? (
            <Text className='stats__loading'>⏳ {t('stats.loading')}</Text>
          ) : (
            <>
              <View className='stats__grid'>
                <StatCell label={t('stats.chats')} value={fmt(data.chats)} />
                <StatCell
                  label={t('stats.tokens')}
                  value={fmtK(data.totalTokens)}
                  hint={
                    data.totalTokens > 0
                      ? t('stats.tokensHint', { in: fmtK(data.promptTokens), out: fmtK(data.completionTokens) })
                      : t('stats.tokensNoUsage')
                  }
                />
                <StatCell label={t('stats.users')} value={fmt(data.actors)} hint={t('stats.usersHint')} />
                <StatCell
                  label={t('stats.toolCalls')}
                  value={fmt(data.toolCalls)}
                  hint={
                    data.toolErrors > 0
                      ? t('stats.toolCallsHint', { ok: fmt(data.toolCalls - data.toolErrors), fail: fmt(data.toolErrors) })
                      : t('stats.llmCallsHint', { n: fmt(data.llmCalls) })
                  }
                />
              </View>

              <View className='stats__section'>
                <Text className='stats__section-title'>{t('stats.perTool')}</Text>
                <Text className='stats__section-sub'>
                  {t('stats.perToolSummary', { types: data.tools.length, calls: fmt(data.toolCalls) })}
                </Text>
              </View>
              {data.tools.length === 0 ? (
                <Text className='stats__empty'>{t('stats.toolEmpty')}</Text>
              ) : (
                data.tools.map((tool) => (
                  <View key={tool.name} className='stats__tool'>
                    <View className='stats__tool-head'>
                      <Text className='stats__tool-name'>
                        {toolLabel(lang as Lang, tool.name, tool.label)}
                        <Text className='stats__hint'> {tool.name.replace(/^seqout_/, '')}</Text>
                      </Text>
                      <Text className='stats__tool-count'>
                        {fmt(tool.count)}
                        {tool.errors > 0 ? (
                          <Text className='stats__tool-fail'> {t('stats.toolFailed', { n: fmt(tool.errors) })}</Text>
                        ) : null}
                      </Text>
                    </View>
                    <View className='stats__bar'>
                      <View
                        className='stats__bar-fill'
                        style={{
                          width: `${maxTool ? Math.max(4, Math.round((tool.count / maxTool) * 100)) : 0}%`,
                        }}
                      />
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>

        {data ? (
          <Text className='stats__foot'>
            {t('stats.since', {
              since: new Date(data.since).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US'),
              updated: new Date(data.updatedAt || data.since).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US'),
            })}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className='stats__cell'>
      <Text className='stats__label'>{label}</Text>
      <Text className='stats__value'>{value}</Text>
      {hint ? <Text className='stats__hint'>{hint}</Text> : null}
    </View>
  )
}
