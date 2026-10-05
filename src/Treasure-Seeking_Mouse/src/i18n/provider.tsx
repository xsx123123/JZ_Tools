// i18n React 绑定：Provider 持有当前语言（初始读 localStorage / 浏览器语言），
// useI18n() 返回 { lang, t, setLang }；切语言即时重渲染并同步 <html lang> + localStorage。
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { applyLang, createT, readLang, writeLang, type Lang, type TFunc } from "./index";

interface I18nValue {
  lang: Lang;
  t: TFunc;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [lang, setLangState] = useState<Lang>(() => readLang());

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeLang(l);
    applyLang(l);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next: Lang = prev === "zh" ? "en" : "zh";
      writeLang(next);
      applyLang(next);
      return next;
    });
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, t: createT(lang), setLang, toggleLang }),
    [lang, setLang, toggleLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
