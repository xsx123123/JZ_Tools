import type { PropsWithChildren } from 'react'
import { I18nProvider } from '@/i18n/provider'
import './app.css'

function App({ children }: PropsWithChildren) {
  return <I18nProvider>{children}</I18nProvider>
}

export default App
