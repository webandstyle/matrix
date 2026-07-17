import { createContext, useContext, useMemo, useState } from 'react'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  // English-first for now; the Hungarian translations stay in content.js and
  // get wired back in when the language switcher ships
  const [lang, setLang] = useState('en')

  const value = useMemo(
    () => ({
      lang,
      toggleLang: () => setLang((l) => (l === 'hu' ? 'en' : 'hu')),
      setLang,
    }),
    [lang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}

export function useT() {
  const { lang } = useLanguage()
  return (field) => field[lang]
}
