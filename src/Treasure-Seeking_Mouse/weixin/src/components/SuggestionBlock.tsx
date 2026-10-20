// 【小程序版】「继续寻宝」建议块：默认折叠，展开后逐条可点击直接发送
// 对应 Web 版 SuggestionBlock.tsx；文案复用已有 i18n 键 suggest.title / suggest.continue。
import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useI18n } from '@/i18n/provider'
import './suggest.css'

export default function SuggestionBlock({
  items,
  onPick,
}: {
  items: string[]
  onPick?: (q: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <View className='suggest'>
      <View className='suggest__head' onClick={() => setOpen((o) => !o)}>
        <Text className='suggest__arrow'>{open ? '▾' : '▸'}</Text>
        <Text className='suggest__title'>{t('suggest.title')}</Text>
        <Text className='suggest__count'>{items.length}</Text>
        <Text className='suggest__chevron'>{open ? '⌄' : '›'}</Text>
      </View>
      {open ? (
        <View className='suggest__list'>
          {items.map((q, i) => (
            <View key={i} className='suggest__item' onClick={() => onPick?.(q)}>
              <Text className='suggest__num'>{i + 1}</Text>
              <Text className='suggest__text'>{q}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
