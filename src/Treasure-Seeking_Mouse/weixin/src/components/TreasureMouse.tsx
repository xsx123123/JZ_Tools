// 【小程序版】寻宝鼠「阿寻」简化桌宠：点按互动 + 长按静默 + CSS 帧动画
// 对应网页版 src/components/pet/TreasureMouse.tsx（470 行）。方案差异（详见 MIGRATION.md R3）：
//   - 网页版依赖 pointer 拖拽 / 内联 SVG / DOM 动画 → 小程序不支持，
//     改为 <Image> 静态图 + theme.css 已有 .pet-* CSS 关键帧（idle 浮动/挖掘/跳跃/转圈/庆祝）
//   - 造型切换保留（base/dig/cheer 三图按状态换），土堆/尘土/爱心/星尘/横幅保留
//   - 拖拽与闲置散步省略（无 pointer 事件体系，价值/成本比低）；静音改成长按 600ms
//   - 状态机/事件协议（makePetEvent 的 seq 去重、cards/done 重复计数防护、成就里程碑）与网页版一致
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import {
  readPetQuiet,
  writePetQuiet,
  bumpPokeCount,
  readTreasureCount,
  addTreasure,
  ACHIEVEMENTS,
  claimAchievement,
  earnedAchievements,
  type Achievement,
} from '@/services/petStore'
import { useI18n } from '@/i18n/provider'
import { petLines, type MessageKey } from '@/i18n'
import IMG_BASE from '@/assets/pet/mouse-base.webp'
import IMG_DIG from '@/assets/pet/mouse-dig.webp'
import IMG_CHEER from '@/assets/pet/mouse-cheer.webp'
import IMG_CHEST from '@/assets/pet/chest.webp'
import './pet.css'

type PetState = 'idle' | 'digging' | 'reveal' | 'miss' | 'poke' | 'spin' | 'celebrate'

/** 外部流式事件 → 宠物动作（与网页版同款协议） */
export type PetEvent =
  | { type: 'tool_start'; seq: number }
  | { type: 'cards'; count: number; seq: number }
  | { type: 'done'; cards: number; seq: number }
  | { type: 'error'; seq: number }

let petSeq = 0
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
/** 发送方调用：产生带唯一序号的事件，保证同类事件连续触发也能被消费 */
export function makePetEvent(e: DistributiveOmit<PetEvent, 'seq'>): PetEvent {
  return { ...e, seq: ++petSeq } as PetEvent
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

interface Heart {
  id: number
  glyph: string
}
let heartId = 0

export function TreasureMouse({ event }: { event: PetEvent | null }): React.ReactElement {
  const { t, lang } = useI18n()
  const L = petLines(lang)
  const [quiet, setQuiet] = useState<boolean>(() => readPetQuiet())
  const [state, setState] = useState<PetState>('idle')
  const [bubble, setBubble] = useState<string | null>(null)
  const [gemCount, setGemCount] = useState<number | null>(null)
  const [hearts, setHearts] = useState<Heart[]>([])
  const [treasure, setTreasure] = useState<number>(() => readTreasureCount())
  const [chestPopKey, setChestPopKey] = useState(0)
  const [earned] = useState<Achievement[]>(() => earnedAchievements(readTreasureCount()))
  const [milestone, setMilestone] = useState<Achievement | null>(null)
  const [burstKey, setBurstKey] = useState(0)
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSeq = useRef(0)
  const pokeStreak = useRef<{ n: number; at: number }>({ n: 0, at: 0 })
  const countedRef = useRef(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 临时状态：ms 后回 idle */
  const transient = useCallback((s: PetState, line: string | null, ms: number) => {
    if (stateTimer.current) clearTimeout(stateTimer.current)
    setState(s)
    setBubble(line)
    stateTimer.current = setTimeout(() => {
      setState('idle')
      setBubble(null)
    }, ms)
  }, [])

  const spawnHearts = useCallback((n: number) => {
    const batch: Heart[] = Array.from({ length: n }, () => ({ id: ++heartId, glyph: pick(['✦', '♥', '◆']) }))
    setHearts((h) => [...h, ...batch])
    setTimeout(() => setHearts((h) => h.filter((x) => !batch.includes(x))), 1000)
  }, [])

  /** 里程碑庆祝：举宝石跳圈 + 光环 + 星尘放射 + 横幅宣告（每档仅播一次） */
  const celebrate = useCallback((ach: Achievement) => {
    if (stateTimer.current) clearTimeout(stateTimer.current)
    setMilestone(ach)
    setState('celebrate')
    setBubble(null)
    setBurstKey((k) => k + 1)
    stateTimer.current = setTimeout(() => {
      setState('idle')
      setMilestone(null)
    }, 4300)
  }, [])

  /** cards/done 事件里累加宝藏后检测跨过的里程碑（同批只庆祝最高一档） */
  const checkMilestones = useCallback(
    (total: number) => {
      const newly = ACHIEVEMENTS.filter((a) => total >= a.threshold && claimAchievement(a.threshold))
      if (newly.length > 0) {
        celebrate(newly[newly.length - 1])
        return true
      }
      return false
    },
    [celebrate],
  )

  /** 出货小剧场；counted=true 表示本轮 cards 事件已累加过，done 只演动画不重复计数 */
  const revealStow = useCallback(
    (count: number, line: string, ms: number, counted: boolean) => {
      if (!counted) {
        const total = addTreasure(count)
        setTreasure(total)
        setChestPopKey((k) => k + 1)
        if (checkMilestones(total)) return
      }
      transient('reveal', line, ms)
    },
    [checkMilestones, transient],
  )

  // 响应外部流式事件
  useEffect(() => {
    if (!event || quiet) return
    if (event.seq <= lastSeq.current) return
    lastSeq.current = event.seq
    switch (event.type) {
      case 'tool_start':
        setGemCount(null)
        countedRef.current = false
        transient('digging', pick(L.dig), 10_000) // 兜底超时回 idle；done/error 会提前打断
        break
      case 'cards':
        setGemCount(event.count)
        countedRef.current = true
        revealStow(event.count, t('pet.foundData', { n: event.count }), 1800, false)
        break
      case 'done':
        if (event.cards > 0 && state !== 'reveal' && state !== 'celebrate') {
          setGemCount(event.cards)
          revealStow(event.cards, t('pet.worthIt'), 1600, countedRef.current)
        } else if (event.cards === 0) {
          transient('miss', pick(L.miss), 2400)
        }
        break
      case 'error':
        transient('miss', pick(L.miss), 2400)
        break
      default:
        break
    }
  }, [event, quiet, transient, state, revealStow, L, t])

  // 闲置剧场：偶尔冒一句台词（无 DOM 散步动画，简化为气泡）
  useEffect(() => {
    if (quiet) return
    idleTimer.current = setInterval(() => {
      if (state !== 'idle') return
      setBubble(pick(L.idle))
      setTimeout(() => setBubble((b) => (b && L.idle.includes(b) ? null : b)), 3200)
    }, 9000)
    return () => {
      if (idleTimer.current) clearInterval(idleTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiet, state, lang])

  useEffect(
    () => () => {
      if (stateTimer.current) clearTimeout(stateTimer.current)
      if (longPressRef.current) clearTimeout(longPressRef.current)
    },
    [],
  )

  function toggleQuiet(q: boolean): void {
    setQuiet(q)
    writePetQuiet(q)
    if (q) {
      setState('idle')
      setBubble(null)
    }
  }

  function handlePoke(): void {
    const now = Date.now()
    pokeStreak.current =
      now - pokeStreak.current.at < 1500 ? { n: pokeStreak.current.n + 1, at: now } : { n: 1, at: now }
    const n = bumpPokeCount()
    if (pokeStreak.current.n >= 3) {
      // 连击彩蛋：转圈 + 爱心雨 + 报宝藏库存
      pokeStreak.current = { n: 0, at: 0 }
      spawnHearts(5)
      transient('spin', L.treasureStash(readTreasureCount()), 1400)
      return
    }
    spawnHearts(1)
    const line =
      n > 6 && pokeStreak.current.n === 1 ? t('pet.readNoReply') : pick([...L.poke, ...L.spin.slice(0, 1)])
    transient('poke', line, 900)
  }

  function handleChestClick(): void {
    const total = readTreasureCount()
    const line = total > 0 ? t('pet.chestStock', { n: total }) : L.treasureEmpty
    transient('poke', line, 1800)
  }

  // 触摸端无右键：长按 600ms 静默（对齐网页版长按语义）
  function onTouchStart(): void {
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      toggleQuiet(true)
    }, 600)
  }
  function onTouchEnd(): void {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  if (quiet) {
    return (
      <Text className='pet__recall' onClick={() => toggleQuiet(false)}>
        🐭
      </Text>
    )
  }

  const animCls =
    state === 'digging'
      ? 'pet-digging'
      : state === 'reveal'
        ? 'pet-reveal'
        : state === 'miss'
          ? 'pet-miss'
          : state === 'poke'
            ? 'pet-poke'
            : state === 'spin'
              ? 'pet-spin'
              : state === 'celebrate'
                ? 'pet-celebrate'
                : 'pet-idle'

  const imgSrc =
    state === 'digging' ? IMG_DIG : state === 'reveal' || state === 'spin' || state === 'celebrate' ? IMG_CHEER : IMG_BASE

  return (
    <View className='pet'>
      {milestone ? (
        <View className='pet__bubble'>
          <View className='pet-banner'>
            {t('pet.banner', {
              name: t(`pet.achievements.${milestone.threshold}` as MessageKey),
              n: milestone.threshold,
            })}
          </View>
        </View>
      ) : bubble ? (
        <View className='pet__bubble'>
          <View className='pet-bubble'>{bubble}</View>
        </View>
      ) : null}

      <View className='pet__stage'>
        {hearts.map((h) => (
          <Text key={h.id} className='pet-heart'>
            {h.glyph}
          </Text>
        ))}

        {state === 'celebrate' ? (
          <>
            <View className='pet-halo' />
            {Array.from({ length: 8 }, (_, i) => (
              <Text key={`${burstKey}-${i}`} className='pet-burst'>
                {['✦', '✧', '◆', '★'][i % 4]}
              </Text>
            ))}
          </>
        ) : null}

        {(state === 'digging' || state === 'reveal') ? <View className='pet-mound pet-mound-pop' /> : null}

        {state === 'digging' ? (
          <>
            <View className='pet-dust' />
            <View className='pet-dust' style={{ animationDelay: '0.2s' }} />
            <View className='pet-dust' style={{ animationDelay: '0.4s' }} />
          </>
        ) : null}

        <View className={animCls} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={handlePoke}>
          <Image className='pet__img' src={imgSrc} mode='aspectFit' />
        </View>

        {state === 'reveal' && gemCount !== null ? (
          <View className='pet__gem pet-gem'>
            💎{gemCount > 1 ? `×${gemCount}` : ''}
          </View>
        ) : null}

        <View className='pet__chest' onClick={handleChestClick}>
          <Image
            key={chestPopKey}
            className={`pet__chest-img ${chestPopKey > 0 ? 'pet-chest-pop' : ''}`}
            src={IMG_CHEST}
            mode='aspectFit'
          />
          {treasure > 0 ? <Text className='pet__chest-count'>{treasure > 99 ? '99+' : treasure}</Text> : null}
        </View>

        {earned.length > 0 ? (
          <View className='pet__badges'>
            {earned.map((a) => (
              <Text
                key={a.threshold}
                className='pet__badge pet-badge-in'
                style={{ background: a.bg }}
              >
                🏅
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <Text className='pet__hint'>{t('pet.hint', { mode: t('pet.modeLongPress') })}</Text>
    </View>
  )
}
