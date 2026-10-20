// 【小程序版】下载加速推荐卡片：后端在流式中推 {"event":"polariseq","accession":...} 时渲染
// （本轮调用过 seqout_get_download_links / seqout_get_run_download 才推，accession 可能为 null）。
// 交互沿用项目惯例：小程序无新窗口打开，「项目主页」与命令块都是复制到剪贴板 + toast。
import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/i18n/provider'
import './boost.css'

const PROJECT_URL = 'https://github.com/xsx123123/polariseq'
/** accession 缺失时的演示用默认值 */
const FALLBACK_ACCESSION = 'PRJNA833659'

export function PolariseqCard({ accession }: { accession: string | null }): React.ReactElement {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const acc = accession ?? FALLBACK_ACCESSION
  const command = `polariseq deps install\npolariseq download -A ${acc} -o ./data -p 4 -t 8`

  /** 复制整块命令，toast 反馈（idlink.copied=「已复制」与现有交互同款） */
  function copyCommand(): void {
    void Taro.setClipboardData({
      data: command,
      success: () => {
        setCopied(true)
        void Taro.showToast({ title: t('boost.copied'), icon: 'none' })
        setTimeout(() => setCopied(false), 2000)
      },
    })
  }

  function copyProjectUrl(): void {
    void Taro.setClipboardData({
      data: PROJECT_URL,
      success: () => void Taro.showToast({ title: t('boost.copied'), icon: 'none' }),
    })
  }

  return (
    <View className='boost card-in'>
      <View className='boost__head'>
        <Text className='boost__title'>⚡ {t('boost.title')}</Text>
        <Text className='boost__project' onClick={copyProjectUrl}>
          {t('boost.project')} 🔗
        </Text>
      </View>
      <Text className='boost__desc'>{t('boost.desc')}</Text>
      <View className='boost__code' onClick={copyCommand}>
        <Text className='boost__code-text'>{command}</Text>
        <Text className='boost__copy'>{copied ? `✓ ${t('boost.copied')}` : `📋 ${t('boost.copy')}`}</Text>
      </View>
      <Text className='boost__note'>{t('boost.note')}</Text>
    </View>
  )
}
