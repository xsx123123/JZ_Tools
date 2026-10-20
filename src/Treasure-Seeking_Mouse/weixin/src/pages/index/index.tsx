// 【小程序版】聊天主页：消息列表 + 输入区 + 数据卡片 + 覆盖层（侧栏/统计/排行榜/文献）+ 桌宠
// 对应网页版 src/routes/index.tsx：R1 先跑通核心链路，R2 接主题与 Markdown，R3 补齐剩余功能组件。
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Textarea } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { useI18n } from '@/i18n/provider'
import { toolLabel } from '@/i18n'
import { requestSeqoutChat, fetchModelCatalog, type DatasetCard, type ToolLog } from '@/services/seqoutChat'
import { bumpStats } from '@/services/statsStore'
import {
  createSession,
  insertMessage,
  listMessages,
  listSessions,
  renameSession,
  deleteSession,
  type SessionRow,
} from '@/services/chatStore'
import { applyTheme, readTheme, writeTheme, type Theme } from '@/services/petStore'
import { addEvidenceListener, type EvidenceRequest } from '@/lib/evidenceBus'
import { extractFollowups } from '@/lib/followup'
import { copyLinkWithConfirm } from '@/lib/copyLink'
import { Markdown } from '@/components/Markdown'
import SuggestionBlock from '@/components/SuggestionBlock'
import { LiteratureCardPanel, requestCardLiterature, ncbiLink } from '@/components/LiteratureCard'
import { SessionSidebar } from '@/components/SessionSidebar'
import { UsageStatsDialog } from '@/components/UsageStatsDialog'
import { Leaderboard } from '@/components/Leaderboard'
import { TreasureMouse, makePetEvent, type PetEvent } from '@/components/TreasureMouse'
import { PetSettingsPanel } from '@/components/PetSettingsPanel'
import { PolariseqCard } from '@/components/PolariseqCard'
import '@/components/panels.css'
import './index.css'

const FALLBACK_MODEL = 'qwen3.8-flash'

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  cards?: DatasetCard[]
  toolLogs?: ToolLog[]
  /** 下载加速推荐（polariseq 事件；undefined=无卡片，不随消息持久化） */
  boost?: { accession: string | null }
  streaming?: boolean
  error?: string
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function Index() {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState(FALLBACK_MODEL)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  // 主题：初始读本机存储（持久化走 petStore 的 readTheme/writeTheme → device 存储层），
  // 根 View 上挂 .dark 类驱动 theme.css 的暗色 token（applyTheme 的 setData 同步保留作 page 数据）
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  // 覆盖层：会话侧栏 / 使用统计 / 排行榜 / 文献证据链（按宿主消息锚定）
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [petPanelOpen, setPetPanelOpen] = useState(false) // 桌宠设置面板（顶栏 ⚙️，与宠物常驻齿轮同款）
  const [evidence, setEvidence] = useState<EvidenceRequest | null>(null)
  const [petEvent, setPetEvent] = useState<PetEvent | null>(null) // 桌宠事件流（仅 UI 反馈，不影响消息逻辑）
  const petCardsRef = useRef(0)
  // ScrollView 的 scrollIntoView 锚点：自增以触发滚动
  const [anchor, setAnchor] = useState('')
  const abortRef = useRef<{ abort: () => void } | null>(null)

  const refreshSessions = useCallback(() => {
    void listSessions().then(setSessions).catch(() => undefined)
  }, [])

  useLoad(() => {
    applyTheme(readTheme())
    refreshSessions()
    void fetchModelCatalog().then((c) => {
      if (c && c.models.length > 0) {
        setModel((cur) => (c.models.includes(cur) ? cur : c.models[0]))
      }
    })
  })

  // 证据链总线：IdLink「查看证据链」/ 数据卡片「📖 文献」→ 渲染在宿主消息下方的文献卡片
  useEffect(() => addEvidenceListener((req) => setEvidence(req)), [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      writeTheme(next)
      applyTheme(next)
      return next
    })
  }, [])

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return
      setInput('')

      const userMsg: UIMessage = { id: uid(), role: 'user', content: trimmed }
      const asstMsg: UIMessage = { id: uid(), role: 'assistant', content: '', streaming: true }
      const snapshot = [...messages, userMsg]
      setMessages([...snapshot, asstMsg])
      setStreaming(true)
      petCardsRef.current = 0

      const history = snapshot
        .filter((m) => !m.error && m.content)
        .map((m) => ({ role: m.role, content: m.content }))

      const finalTools: ToolLog[] = []
      let cardCount = 0
      let digCount = 0
      const patch = (fn: (m: UIMessage) => UIMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === asstMsg.id ? fn(m) : m)))

      // 打字机节流：delta 先进缓冲区，50ms 批量 flush 一次——
      // 避免每个 SSE 帧都触发全量 setMessages 重渲染 + 整条 Markdown 重解析（低端真机掉帧主因）
      let pendingDelta = ''
      const flushDelta = () => {
        if (!pendingDelta) return
        const d = pendingDelta
        pendingDelta = ''
        patch((m) => ({ ...m, content: m.content + d }))
      }
      const deltaTimer = setInterval(flushDelta, 50)

      await requestSeqoutChat(
        history,
        model,
        {
          onDelta: (d) => {
            pendingDelta += d
          },
          onTool: (evt) => {
            if (evt.status === 'running') {
              digCount += 1
              setPetEvent(makePetEvent({ type: 'tool_start' }))
            }
            patch((m) => ({
              ...m,
              toolLogs: [
                ...(m.toolLogs ?? []).filter((l) => l.name !== evt.name),
                { name: evt.name, label: evt.label, ok: evt.status !== 'error', ms: evt.ms ?? 0 },
              ],
            }))
          },
          onCards: (cards) => {
            cardCount = cards.length
            if (petCardsRef.current === 0 && cards.length > 0) {
              setPetEvent(makePetEvent({ type: 'cards', count: cards.length }))
            }
            petCardsRef.current = Math.max(petCardsRef.current, cards.length)
            patch((m) => ({ ...m, cards }))
          },
          onEnd: (p) => {
            if (p.cards.length > 0) cardCount = p.cards.length
            finalTools.push(...p.tools)
            setPetEvent(
              makePetEvent({ type: 'done', cards: Math.max(p.cards.length, petCardsRef.current) }),
            )
          },
          onPolariseq: (accession) => patch((m) => ({ ...m, boost: { accession } })),
          onError: (msg) => {
            setPetEvent(makePetEvent({ type: 'error' }))
            patch((m) => ({ ...m, error: msg }))
          },
        },
        abortRef,
        lang,
      )

      // 流已结束：停掉节流定时器，把缓冲区剩余 delta 全部刷出再收尾
      clearInterval(deltaTimer)
      flushDelta()

      patch((m) => ({ ...m, streaming: false, toolLogs: finalTools.length > 0 ? finalTools : m.toolLogs }))
      setStreaming(false)
      abortRef.current = null
      setAnchor(`anchor-${Date.now()}`)

      // 本机持久化：首条消息时建会话
      try {
        let sid = sessionId
        if (!sid) {
          const row = await createSession(trimmed)
          sid = row.id
          setSessionId(sid)
          setSessions((prev) => [row, ...prev])
        }
        void insertMessage(sid, { id: userMsg.id, role: 'user', content: trimmed, cards: null, tool_logs: null })
        setMessages((cur) => {
          const latest = cur.find((m) => m.id === asstMsg.id)
          if (latest && !latest.error) {
            void insertMessage(sid as string, {
              id: asstMsg.id,
              role: 'assistant',
              content: latest.content,
              cards: latest.cards ?? null,
              tool_logs: latest.toolLogs ?? null,
            })
          }
          return cur
        })
        refreshSessions()
      } catch {
        /* 持久化失败不打断对话 */
      }

      void bumpStats({ treasures: cardCount, digs: digCount, chats: 1 })
    },
    [messages, model, streaming, sessionId, lang, refreshSessions],
  )

  const startNew = useCallback(() => {
    if (streaming) return
    setMessages([])
    setSessionId(null)
    setEvidence(null)
    setSidebarOpen(false)
  }, [streaming])

  const openSession = useCallback(
    async (id: string) => {
      if (streaming) return
      const rows = await listMessages(id)
      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          cards: (r.cards as DatasetCard[] | null) ?? undefined,
          toolLogs: (r.tool_logs as ToolLog[] | null) ?? undefined,
        })),
      )
      setSessionId(id)
      setEvidence(null)
      setSidebarOpen(false)
    },
    [streaming],
  )

  const handleRename = useCallback(
    async (id: string, title: string) => {
      try {
        await renameSession(id, title)
        refreshSessions()
      } catch {
        /* 改名失败静默 */
      }
    },
    [refreshSessions],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteSession(id)
        if (sessionId === id) {
          setMessages([])
          setSessionId(null)
          setEvidence(null)
        }
        refreshSessions()
      } catch {
        /* 删除失败静默 */
      }
    },
    [sessionId, refreshSessions],
  )

  return (
    <View className={theme === 'dark' ? 'chat dark' : 'chat'}>
      <View className='chat__bar'>
        <Text className='chat__btn' onClick={() => setSidebarOpen(true)}>
          ☰
        </Text>
        <Text className='chat__model'>{model}</Text>
        <Text className='icon-btn' onClick={() => setStatsOpen(true)}>
          📊
        </Text>
        <Text className='icon-btn' onClick={() => setBoardOpen(true)}>
          🏆
        </Text>
        <Text className='icon-btn' onClick={() => setPetPanelOpen(true)}>
          ⚙️
        </Text>
        <Text className='chat__theme' onClick={toggleTheme}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </Text>
        <Text className='chat__btn' onClick={startNew}>
          ＋
        </Text>
      </View>

      <ScrollView className='chat__list' scrollY scrollIntoView={anchor} enhanced showScrollbar={false}>
        {messages.length === 0 ? (
          <View className='chat__empty'>
            <View className='chat__empty-hero'>
              <Text className='chat__empty-title'>
                <Text className='chat__empty-title-green'>GEO寻宝</Text>
                <Text className='chat__empty-title-gold'>鼠</Text>
                <Text> · 你的同门生信探险搭子</Text>
              </Text>
              <Text className='chat__empty-sub'>{t('empty.subHeadline')}</Text>
              <Text className='chat__empty-desc'>{t('empty.intro')}</Text>
            </View>
          </View>
        ) : null}

        {messages.map((m, idx) => (
          <View key={m.id} id={`msg-${idx + 1}`} className={`msg msg--${m.role}`}>
            <Text className='msg__who'>{m.role === 'user' ? t('pet.alt') : t('brand.name')}</Text>

            {m.toolLogs && m.toolLogs.length > 0 ? (
              <View className='tools'>
                {m.toolLogs.map((l, i) => (
                  <Text key={`${l.name}-${i}`} className={`tools__item ${l.ok ? '' : 'tools__item--err'}`}>
                    {toolLabel(lang, l.name, l.label)}
                  </Text>
                ))}
              </View>
            ) : null}

            <View className='msg__body'>
              {m.content ? (
                m.role === 'assistant' ? (
                  <Markdown text={extractFollowups(m.content).main} hostMessageId={m.id} allowLinkHint={!m.streaming} />
                ) : (
                  <Text className='msg__text'>{m.content}</Text>
                )
              ) : m.streaming ? (
                <Text className='msg__text msg__text--dim'>{t('msg.thinking')}</Text>
              ) : null}
            </View>

            {m.cards && m.cards.length > 0 ? (
              <View className='cards'>
                {m.cards.map((c, i) => {
                  const link = ncbiLink(c.accession)
                  return (
                    <View key={`${c.accession}-${i}`} className='card'>
                      <Text className='card__acc'>{c.accession.toUpperCase()}</Text>
                      <Text className='card__title'>{c.title}</Text>
                      {c.meta && c.meta.organism ? <Text className='card__org'>{c.meta.organism}</Text> : null}
                      <View className='card__actions'>
                        {link ? (
                          <Text
                            className='card__action'
                            onClick={() => copyLinkWithConfirm(t, c.accession.toUpperCase(), link)}
                          >
                            🔗 {t('card.openNcbi')}
                          </Text>
                        ) : null}
                        <Text className='card__action' onClick={() => requestCardLiterature(c.accession, m.id)}>
                          📖 {t('card.literature')}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : null}

            {m.error ? <Text className='msg__err'>{m.error}</Text> : null}

            {m.boost ? <PolariseqCard accession={m.boost.accession} /> : null}

            {m.role === 'assistant' && !m.streaming && extractFollowups(m.content).items.length > 0 ? (
              <SuggestionBlock
                items={extractFollowups(m.content).items}
                onPick={(q) => void handleSend(q)}
              />
            ) : null}

            {evidence && evidence.hostMessageId === m.id ? (
              <LiteratureCardPanel kind={evidence.kind} id={evidence.id} onClose={() => setEvidence(null)} />
            ) : null}
          </View>
        ))}
        <View id='anchor-bottom' className='chat__anchor' />
      </ScrollView>

      <View className='composer'>
        <Textarea
          className='composer__input'
          value={input}
          placeholder={t('composer.placeholder')}
          autoHeight
          maxlength={-1}
          onInput={(e) => setInput(e.detail.value)}
          disabled={streaming}
        />
        {streaming ? (
          <Text className='composer__send composer__send--stop' onClick={() => abortRef.current?.abort()}>
            {t('composer.stop')}
          </Text>
        ) : (
          <Text
            className={`composer__send ${input.trim() ? '' : 'composer__send--off'}`}
            onClick={() => void handleSend(input)}
          >
            {t('composer.send')}
          </Text>
        )}
      </View>
      <Text className='composer__note'>{t('composer.disclaimer')}</Text>

      {/* 寻宝鼠桌宠（z-30，低于覆盖层遮罩 z-40） */}
      <TreasureMouse event={petEvent} dark={theme === 'dark'} />

      {/* 覆盖层 */}
      {sidebarOpen ? (
        <SessionSidebar
          sessions={sessions}
          activeId={sessionId}
          onSelect={(id) => void openSession(id)}
          onNew={startNew}
          onRename={(id, title) => void handleRename(id, title)}
          onDelete={(id) => void handleDelete(id)}
          onClose={() => setSidebarOpen(false)}
        />
      ) : null}
      <UsageStatsDialog open={statsOpen} onClose={() => setStatsOpen(false)} />
      <Leaderboard open={boardOpen} onClose={() => setBoardOpen(false)} />

      {/* 桌宠设置面板（顶栏 ⚙️ 入口；遮罩点击关闭，找回/静默经 petBus 直达桌宠） */}
      {petPanelOpen ? (
        <View className='dialog-wrap'>
          <View className='mask' onClick={() => setPetPanelOpen(false)} />
          <View className='petset-dialog'>
            <PetSettingsPanel onClose={() => setPetPanelOpen(false)} />
          </View>
        </View>
      ) : null}
    </View>
  )
}
