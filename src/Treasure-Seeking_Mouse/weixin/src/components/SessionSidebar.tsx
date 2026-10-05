// 【小程序版】会话侧栏：小程序无 hover drawer，用「遮罩 + 左侧滑入固定面板」实现
// 对应网页版 src/components/chat/SessionSidebar.tsx；差异：
//   - 无登录入口（小程序暂无云端账号体系），底部展示游客存储策略提示
//   - 重命名用 Taro Input（失焦/确认提交），删除走 showModal 二次确认
import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/i18n/provider'
import type { SessionRow } from '@/services/chatStore'
import './panels.css'

export function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onClose,
}: {
  sessions: SessionRow[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}): React.ReactElement {
  const { t } = useI18n()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function commitRename(id: string): void {
    const title = draft.trim()
    if (title) onRename(id, title)
    setEditingId(null)
  }

  function confirmDelete(id: string): void {
    void Taro.showModal({
      title: t('sidebar.delete'),
      content: sessions.find((s) => s.id === id)?.title ?? '',
      confirmText: t('sidebar.delete'),
      cancelText: t('board.cancel'),
      confirmColor: '#d7352f',
      success: (r) => {
        if (r.confirm) onDelete(id)
      },
    })
  }

  return (
    <>
      <View className='mask' onClick={onClose} />
      <View className='drawer'>
        <View className='side__brand'>
          <Text className='side__logo'>🐭</Text>
          <View className='side__brand-text'>
            <Text className='side__name'>{t('brand.name')}</Text>
            <Text className='side__tagline'>{t('brand.tagline')}</Text>
          </View>
        </View>

        <Text className='side__new' onClick={onNew}>
          ＋ {t('sidebar.newChat')}
        </Text>

        <View className='drawer__body'>
          {sessions.length === 0 ? (
            <Text className='side__empty'>{t('sidebar.empty')}</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} className={`side__item ${s.id === activeId ? 'side__item--active' : ''}`}>
                {editingId === s.id ? (
                  <Input
                    className='side__edit'
                    value={draft}
                    focus
                    maxlength={40}
                    onInput={(e) => setDraft(e.detail.value)}
                    onBlur={() => commitRename(s.id)}
                    onConfirm={() => commitRename(s.id)}
                  />
                ) : (
                  <Text className='side__item-title' onClick={() => onSelect(s.id)}>
                    💬 {s.title}
                  </Text>
                )}
                <Text
                  className='side__item-rename'
                  onClick={() => {
                    setEditingId(s.id)
                    setDraft(s.title)
                  }}
                >
                  ✏️
                </Text>
                <Text className='side__item-del' onClick={() => confirmDelete(s.id)}>
                  🗑
                </Text>
              </View>
            ))
          )}
        </View>

        <View className='drawer__foot'>
          <Text className='side__note'>
            {t('sidebar.guestNote', { n: 50, d: 7, loginSuffix: '' })}
          </Text>
        </View>
      </View>
    </>
  )
}
