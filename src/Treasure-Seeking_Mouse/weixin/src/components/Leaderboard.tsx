// 【小程序版】挖宝排行榜抽屉：遮罩 + 右侧滑入面板
// 对应网页版 src/components/chat/Leaderboard.tsx。**数据源差异决策**：
//   网页版登录榜来自 Supabase 云端；小程序版无云端账号体系（AGENTS.md 硬约束：存储走 device.ts，
//   不引 Supabase），statsStore 已重写为本机统计（等价网页版「离线模式」分支）——
//   登录榜（寻宝鼠 Tab）在小程序版恒为空，默认落在「临时矿工」Tab；榜单只有本机访客一行，
//   昵称/排序/奖牌/「我」高亮等交互完整保留，日后接后端时 statsStore 接口形状不变、无缝替换。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import { fetchLeaderboard, myGuestKey, updateNickname, type StatRow } from '@/services/statsStore'
import { useI18n } from '@/i18n/provider'
import type { TFunc } from '@/i18n'
import './panels.css'

type BoardTab = 'diggers' | 'guests'
type Range = 'week' | 'all'

const MEDALS = ['🥇', '🥈', '🥉']

function metricOf(row: StatRow, range: Range) {
  return range === 'week'
    ? { treasures: row.weekTreasures, digs: row.weekDigs, chats: row.weekChats }
    : { treasures: row.treasures, digs: row.digs, chats: row.chats }
}

function sortRows(rows: StatRow[], range: Range): StatRow[] {
  return [...rows].sort((a, b) => {
    const ma = metricOf(a, range)
    const mb = metricOf(b, range)
    if (mb.treasures !== ma.treasures) return mb.treasures - ma.treasures
    if (mb.chats !== ma.chats) return mb.chats - ma.chats
    return mb.digs - ma.digs
  })
}

function fmtTime(t: TFunc, iso: string): string {
  if (!iso) return ''
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const diff = Date.now() - time
  if (diff < 60_000) return t('board.justNow')
  if (diff < 3_600_000) return t('board.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('board.hoursAgo', { n: Math.floor(diff / 3_600_000) })
  if (diff < 7 * 86_400_000) return t('board.daysAgo', { n: Math.floor(diff / 86_400_000) })
  return new Date(time).toLocaleDateString()
}

export function Leaderboard({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement | null {
  const { t } = useI18n()
  // 本机统计只写在访客榜（对齐网页版离线模式：默认切「临时矿工」页签，登录榜恒空）
  const [tab, setTab] = useState<BoardTab>('guests')
  const [range, setRange] = useState<Range>('all')
  const [users, setUsers] = useState<StatRow[]>([])
  const [guests, setGuests] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [nickOpen, setNickOpen] = useState(false)
  const [nickDraft, setNickDraft] = useState('')
  const [nickMsg, setNickMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetchLeaderboard()
      setUsers(r.users)
      setGuests(r.guests)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const selfKey = myGuestKey()
  const rows = useMemo(() => sortRows(tab === 'diggers' ? users : guests, range), [tab, users, guests, range])
  const totalTreasures = useMemo(
    () =>
      range === 'week'
        ? [...users, ...guests].reduce((a, r) => a + r.weekTreasures, 0)
        : [...users, ...guests].reduce((a, r) => a + r.treasures, 0),
    [users, guests, range],
  )

  async function saveNickname(): Promise<void> {
    const name = nickDraft.trim()
    if (!name) {
      setNickMsg(t('board.nickEmpty'))
      return
    }
    setNickMsg(null)
    const res = await updateNickname(name)
    if (res.ok) {
      setNickOpen(false)
      void load()
    } else {
      setNickMsg(res.message ?? t('board.saveFailed'))
    }
  }

  if (!open) return null

  return (
    <>
      <View className='mask' onClick={onClose} />
      <View className='drawer drawer--right'>
        <View className='drawer__head'>
          <Text className='drawer__title'>🏆 {t('board.title')}</Text>
          <Text className='drawer__sub'>
            {t(range === 'week' ? 'board.subtitleWeek' : 'board.subtitleAll', { n: totalTreasures })}
          </Text>
          <Text className='icon-btn' onClick={() => void load()}>
            {loading ? '⏳' : '🔄'}
          </Text>
          <Text className='icon-btn' onClick={onClose}>
            ✕
          </Text>
        </View>

        <View className='board__tabs'>
          {(
            [
              { id: 'diggers', label: t('board.tabDiggers') },
              { id: 'guests', label: t('board.tabGuests') },
            ] as const
          ).map((tb) => (
            <Text
              key={tb.id}
              className={`board__tab ${tab === tb.id ? 'board__tab--on' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </Text>
          ))}
        </View>

        <View className='board__ranges'>
          {(
            [
              { id: 'week', label: t('board.rangeWeek') },
              { id: 'all', label: t('board.rangeAll') },
            ] as const
          ).map((r) => (
            <Text
              key={r.id}
              className={`board__range ${range === r.id ? 'board__range--on' : ''}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </Text>
          ))}
        </View>

        <View className='board__nick-btn' onClick={() => {
          const me = rows.find((r) => r.key === selfKey)
          setNickDraft(me?.name ?? '')
          setNickMsg(null)
          setNickOpen(true)
        }}
        >
          <Text className='board__nick-hint'>✏️ {t('board.setNickname')}</Text>
        </View>

        <ScrollView className='drawer__body' scrollY>
          {error ? (
            <View className='board__empty'>
              <Text className='board__empty-hint'>{t('board.loadFailed')}</Text>
              <Text className='lit__link' onClick={() => void load()}>
                {t('board.retry')}
              </Text>
            </View>
          ) : loading && rows.length === 0 ? (
            <View className='board__empty'>
              <Text className='board__empty-hint'>⏳ {t('board.loading')}</Text>
            </View>
          ) : rows.length === 0 ? (
            <View className='board__empty'>
              <Text className='board__empty-icon'>🏆</Text>
              <Text className='board__empty-title'>{t(range === 'week' ? 'board.emptyWeek' : 'board.emptyAll')}</Text>
              <Text className='board__empty-hint'>
                {t(tab === 'diggers' ? 'board.emptyDiggersHint' : 'board.emptyGuestsHint')}
              </Text>
            </View>
          ) : (
            rows.map((r, i) => {
              const m = metricOf(r, range)
              const highlight = r.key === selfKey
              const rank = i + 1
              return (
                <View key={r.key} className={`board__row ${highlight ? 'board__row--me' : ''}`}>
                  <Text className={`board__rank ${rank <= 3 ? 'board__rank--top' : ''}`}>
                    {rank <= 3 ? MEDALS[rank - 1] : rank}
                  </Text>
                  <Text className='board__avatar'>{r.name.slice(0, 1).toUpperCase()}</Text>
                  <View className='board__main'>
                    <View className='board__name-wrap'>
                      <Text className='board__name'>{r.name}</Text>
                      {highlight ? <Text className='board__me-badge'>{t('board.me')}</Text> : null}
                      {highlight ? (
                        <Text
                          className='board__edit'
                          onClick={() => {
                            setNickDraft(r.name)
                            setNickMsg(null)
                            setNickOpen(true)
                          }}
                        >
                          ✏️
                        </Text>
                      ) : null}
                    </View>
                    <Text className='board__meta'>
                      {t('board.rowMeta', { chats: m.chats, digs: m.digs })}
                      {r.updated_at ? ` · ${fmtTime(t, r.updated_at)}` : ''}
                    </Text>
                  </View>
                  <View className='board__score'>
                    <Text className='board__score-num'>✨ {m.treasures}</Text>
                    <Text className='board__score-label'>{t('board.treasures')}</Text>
                  </View>
                </View>
              )
            })
          )}
        </ScrollView>

        <View className='drawer__foot'>
          <Text className='board__sortnote'>
            {t('board.sortNote', { range: t(range === 'week' ? 'board.rangeWeek' : 'board.rangeAll') })}
          </Text>
        </View>
      </View>

      {nickOpen ? (
        <View className='board__editor'>
          <View className='mask' onClick={() => setNickOpen(false)} />
          <View className='board__editor-card'>
            <Text className='board__editor-title'>{t('board.nickTitle')}</Text>
            <Text className='board__editor-desc'>{t('board.nickDesc')}</Text>
            <Input
              className='board__editor-input'
              value={nickDraft}
              focus
              maxlength={16}
              placeholder={t('board.nickPlaceholder')}
              onInput={(e) => setNickDraft(e.detail.value)}
              onConfirm={() => void saveNickname()}
            />
            {nickMsg ? <Text className='board__editor-msg'>{nickMsg}</Text> : null}
            <View className='board__editor-actions'>
              <Text className='board__editor-cancel' onClick={() => setNickOpen(false)}>
                {t('board.cancel')}
              </Text>
              <Text
                className={`board__editor-save ${nickDraft.trim() ? 'board__editor-save--on' : ''}`}
                onClick={() => void saveNickname()}
              >
                {t('board.save')}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </>
  )
}
