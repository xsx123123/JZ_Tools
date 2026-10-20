// 【小程序版】阿寻设置面板：宠物角落常驻齿轮与顶栏 ⚙️ 共用（R8 行式重设计）。
// 对应网页版 src/components/pet/PetSettingsPanel.tsx（参考 docs/2026-10-06_14.04.23.png）；差异：
//   - 无 lucide 图标 → emoji/字符（📏/🙈/✨/∞/🐾）；步进按钮用 ‹ › 字符
//   - 无原生 checkbox → 自绘 switch（同 R7）
//   - 「位置复位」行省略：小程序版桌宠位置固定在 CSS（R3 起无拖拽/无 pos 存储），复位无可作用对象
//   - 读写走 petStore（device 存储层），变更经 petBus 通知桌宠即时生效；桌宠侧改动也经同一总线回同步
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useI18n } from '@/i18n/provider'
import {
  PET_SIZE_DEFAULT,
  PET_SIZE_MAX,
  PET_SIZE_MIN,
  PET_SIZE_STEP,
  readPetAlways,
  writePetAlways,
  readPetIdleAlive,
  writePetIdleAlive,
  readPetQuiet,
  readPetSize,
  writePetSize,
  readTreasureCount,
} from '@/services/petStore'
import { emitPetSettingsChanged, emitPetRecall, emitPetQuiet, onPetSettingsChanged } from '@/lib/petBus'
import './pet.css'

/** 自绘 switch（纯 theme token，开=helix 绿底白钮；同网页版 iOS 风） */
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <View className={`petset__switch ${checked ? 'petset__switch--on' : ''}`} onClick={() => onChange(!checked)}>
      <View className='petset__knob' />
    </View>
  )
}

export function PetSettingsPanel({
  onClose,
  onRecall,
}: {
  onClose?: () => void
  onRecall?: () => void
}): React.ReactElement {
  const { t } = useI18n()
  const [size, setSize] = useState<number>(() => readPetSize())
  const [always, setAlways] = useState<boolean>(() => readPetAlways())
  const [idleAlive, setIdleAlive] = useState<boolean>(() => readPetIdleAlive())
  const [quiet, setQuiet] = useState<boolean>(() => readPetQuiet())

  // 桌宠侧改动（长按静默等）经 petBus 回同步面板显示
  useEffect(
    () =>
      onPetSettingsChanged(() => {
        setSize(readPetSize())
        setAlways(readPetAlways())
        setIdleAlive(readPetIdleAlive())
        setQuiet(readPetQuiet())
      }),
    [],
  )

  const changeSize = (next: number) => {
    const clamped = Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, next))
    setSize(clamped)
    writePetSize(clamped)
    emitPetSettingsChanged()
  }

  const changeAlways = (v: boolean) => {
    setAlways(v)
    writePetAlways(v)
    emitPetSettingsChanged()
  }

  const changeIdleAlive = (v: boolean) => {
    setIdleAlive(v)
    writePetIdleAlive(v)
    emitPetSettingsChanged()
  }

  const changeQuiet = (v: boolean) => {
    if (v) emitPetQuiet()
    else emitPetRecall()
    // quiet 状态由桌宠写存储并发 settingsChanged 回同步，这里乐观更新
    setQuiet(v)
  }

  const recall = () => {
    emitPetRecall()
    setQuiet(false)
    onRecall?.()
    onClose?.()
  }

  return (
    <View className='petset'>
      {/* 标题栏 */}
      <View className='petset__head'>
        <Text className='petset__head-title'>🐾 {t('pet.settings.title')}</Text>
        <Text className='petset__close' onClick={() => onClose?.()}>
          {t('pet.settings.close')}
        </Text>
      </View>

      {/* 体型大小：步进 + 百分比读数 */}
      <View className='petset__row'>
        <Text className='petset__icon'>📏</Text>
        <View className='petset__main'>
          <Text className='petset__row-title'>{t('pet.settings.size')}</Text>
          <Text className='petset__row-desc'>{t('pet.settings.sizeDesc')}</Text>
        </View>
        <View className='petset__steppers'>
          <Text
            className={`petset__step ${size <= PET_SIZE_MIN ? 'petset__step--off' : ''}`}
            onClick={() => changeSize(size - PET_SIZE_STEP)}
          >
            ‹
          </Text>
          <Text className='petset__pct'>{Math.round((size / PET_SIZE_DEFAULT) * 100)}%</Text>
          <Text
            className={`petset__step ${size >= PET_SIZE_MAX ? 'petset__step--off' : ''}`}
            onClick={() => changeSize(size + PET_SIZE_STEP)}
          >
            ›
          </Text>
        </View>
      </View>

      <View className='petset__divider' />

      {/* 从桌面收起（= 静默：角落留召回小入口） */}
      <View className='petset__row'>
        <Text className='petset__icon'>🙈</Text>
        <View className='petset__main'>
          <Text className='petset__row-title'>{t('pet.settings.quiet')}</Text>
          <Text className='petset__row-desc'>{t('pet.settings.quietDesc')}</Text>
        </View>
        <Switch checked={quiet} onChange={changeQuiet} />
      </View>

      <View className='petset__divider' />

      {/* 闲置时自己活动 */}
      <View className='petset__row'>
        <Text className='petset__icon'>✨</Text>
        <View className='petset__main'>
          <Text className='petset__row-title'>{t('pet.settings.idle')}</Text>
          <Text className='petset__row-desc'>{t('pet.settings.idleDesc')}</Text>
        </View>
        <Switch checked={idleAlive} onChange={changeIdleAlive} />
      </View>

      <View className='petset__divider' />

      {/* 一直存在 */}
      <View className='petset__row'>
        <Text className='petset__icon'>∞</Text>
        <View className='petset__main'>
          <Text className='petset__row-title'>{t('pet.settings.always')}</Text>
          <Text className='petset__row-desc'>{t('pet.settings.alwaysDesc')}</Text>
        </View>
        <Switch checked={always} onChange={changeAlways} />
      </View>

      {/* 找回阿寻（隐藏/收起后召回） + 宝藏计数 + 本机说明 */}
      <View className='petset__foot'>
        <Text className='petset__recall' onClick={recall}>
          🐾 {t('pet.settings.recall')}
        </Text>
        <Text className='petset__treasure'>{t('pet.settings.treasure', { n: readTreasureCount() })}</Text>
        <Text className='petset__note'>{t('pet.settings.note')}</Text>
      </View>
    </View>
  )
}
