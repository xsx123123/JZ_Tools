// 【小程序版】聊天主页：消息列表 + 输入区 + 数据卡片
// 对应网页版 src/routes/index.tsx：去掉会话栏/登录/桌宠等首版未做部分，先跑通核心链路。
import { useCallback, useRef, useState } from 'react'
import { View, Text, ScrollView, Textarea } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import { useI18n } from '@/i18n/provider'
import { toolLabel } from '@/i18n'
import { requestSeqoutChat, fetchModelCatalog, type DatasetCard, type ToolLog } from '@/services/seqoutChat'
import { bumpStats } from '@/services/statsStore'
import { createSession, insertMessage, listMessages, listSessions, type SessionRow } from '@/services/chatStore'
import './index.css'

const FALLBACK_MODEL = 'qwen3.8-flash'

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  cards?: DatasetCard[]
  toolLogs?: ToolLog[]
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
  // ScrollView 的 scrollIntoView 锚点：自增以触发滚动
  const [anchor, setAnchor] = useState('')
  const abortRef = useRef<{ abort: () => void } | null>(null)

  useLoad(() => {
    void listSessions().then(setSessions).catch(() => undefined)
    void fetchModelCatalog().then((c) => {
      if (c && c.models.length > 0) {
        setModel((cur) => (c.models.includes(cur) ? cur : c.models[0]))
      }
    })
  })

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

      const history = snapshot
        .filter((m) => !m.error && m.content)
        .map((m) => ({ role: m.role, content: m.content }))

      const finalTools: ToolLog[] = []
      let cardCount = 0
      let digCount = 0
      const patch = (fn: (m: UIMessage) => UIMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === asstMsg.id ? fn(m) : m)))

      await requestSeqoutChat(
        history,
        model,
        {
          onDelta: (d) => patch((m) => ({ ...m, content: m.content + d })),
          onTool: (evt) => {
            if (evt.status === 'running') digCount += 1
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
            patch((m) => ({ ...m, cards }))
          },
          onEnd: (p) => {
            if (p.cards.length > 0) cardCount = p.cards.length
            finalTools.push(...p.tools)
          },
          onError: (msg) => patch((m) => ({ ...m, error: msg })),
        },
        abortRef,
        lang,
      )

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
      } catch {
        /* 持久化失败不打断对话 */
      }

      void bumpStats({ treasures: cardCount, digs: digCount, chats: 1 })
    },
    [messages, model, streaming, sessionId, lang],
  )

  const startNew = useCallback(() => {
    if (streaming) return
    setMessages([])
    setSessionId(null)
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
    },
    [streaming],
  )

  return (
    <View className='chat'>
      <View className='chat__bar'>
        <Text className='chat__model'>{model}</Text>
        <Text className='chat__btn' onClick={startNew}>
          {t('sidebar.newChat')}
        </Text>
        <Text className='chat__lang' onClick={() => void openSession(sessions[0]?.id ?? '')}>
          {sessions.length > 0 ? `${sessions.length}` : ''}
        </Text>
      </View>

      <ScrollView className='chat__list' scrollY scrollIntoView={anchor} enhanced showScrollbar={false}>
        {messages.length === 0 ? (
          <View className='chat__empty'>
            <Text className='chat__empty-title'>{t('brand.name')}</Text>
            <Text className='chat__empty-desc'>{t('empty.intro')}</Text>
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
                <Text className='msg__text'>{m.content}</Text>
              ) : m.streaming ? (
                <Text className='msg__text msg__text--dim'>{t('msg.thinking')}</Text>
              ) : null}
            </View>

            {m.cards && m.cards.length > 0 ? (
              <View className='cards'>
                {m.cards.map((c, i) => (
                  <View key={`${c.accession}-${i}`} className='card'>
                    <Text className='card__acc'>{c.accession.toUpperCase()}</Text>
                    <Text className='card__title'>{c.title}</Text>
                    {c.meta && c.meta.organism ? <Text className='card__org'>{c.meta.organism}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {m.error ? <Text className='msg__err'>{m.error}</Text> : null}
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

      {sessions.length > 0 ? (
        <View className='sessions'>
          {sessions.map((s) => (
            <Text key={s.id} className='sessions__item' onClick={() => void openSession(s.id)}>
              {s.title}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}
