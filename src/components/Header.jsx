import { useEffect, useState } from 'react'
import { BRAND, NAV } from '../data/content'
import { useLanguage, useT } from '../i18n/LanguageContext'
import './Header.css'

export default function Header() {
  const { lang, toggleLang } = useLanguage()
  const t = useT()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="site-header__brand">
        <span className="site-header__name">{BRAND.name}</span>
        <span className="site-header__position">{t(BRAND.position)}</span>
      </div>

      <nav className="site-header__nav" aria-label="Main">
        {NAV.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {t(item.label)}
          </a>
        ))}
      </nav>

      <button
        type="button"
        className="site-header__lang"
        onClick={toggleLang}
        aria-label="Switch language"
      >
        <span className={lang === 'hu' ? 'is-active' : ''}>HU</span>
        <span className="site-header__lang-sep">/</span>
        <span className={lang === 'en' ? 'is-active' : ''}>EN</span>
      </button>
    </header>
  )
}
