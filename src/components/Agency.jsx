import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/LanguageContext'
import { AGENCY, BRAND } from '../data/content'
import DnaCaseStudies from './DnaCaseStudies'
import './Agency.css'

// THE BLUE PILL — the #agency page (2026-07-26). The grounded, "the system
// resolves into order" counterpart to the red pill's immersive rabbit hole: a
// calm, premium studio page. Mounted as a full-screen takeover by App when the
// hash is #agency (blue pill → window.location.hash = '#agency'). onClose clears
// the hash and returns to the experience.
//
// Contact: a real form that POSTs to FORM_ENDPOINT when set (a Formspree/Resend
// URL — Alex wires it), and gracefully falls back to a prefilled mailto so it
// works today. The email alex@webandstyle.com is always shown as the direct route.
const FORM_ENDPOINT = '' // TODO: paste a Formspree (or similar) endpoint here

// reveal-on-scroll: add .is-in when the element enters the viewport
function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (!('IntersectionObserver' in window)) { el.classList.add('is-in'); return undefined }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) } }),
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useReveal()
  return <Tag ref={ref} className={`ag-reveal ${className}`} {...rest}>{children}</Tag>
}

function ContactForm() {
  const t = useT()
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [data, setData] = useState({ name: '', email: '', message: '' })
  const set = (k) => (e) => setData((d) => ({ ...d, [k]: e.target.value }))

  const mailto = () => {
    const subject = encodeURIComponent(`Web & Style — ${data.name || 'új projekt'}`)
    const body = encodeURIComponent(`${data.message}\n\n— ${data.name}\n${data.email}`)
    window.location.href = `mailto:${AGENCY.email}?subject=${subject}&body=${body}`
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!FORM_ENDPOINT) { mailto(); return } // no backend yet → open mail client
    setStatus('sending')
    try {
      const r = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      })
      setStatus(r.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return <p className="ag-form__done">{t(AGENCY.formSent)}</p>
  }

  return (
    <form className="ag-form" onSubmit={onSubmit}>
      <label className="ag-form__field">
        <span>{t(AGENCY.formName)}</span>
        <input type="text" value={data.name} onChange={set('name')} required autoComplete="name" />
      </label>
      <label className="ag-form__field">
        <span>{t(AGENCY.formEmail)}</span>
        <input type="email" value={data.email} onChange={set('email')} required autoComplete="email" />
      </label>
      <label className="ag-form__field">
        <span>{t(AGENCY.formMessage)}</span>
        <textarea rows={4} value={data.message} onChange={set('message')} required />
      </label>
      <button type="submit" className="ag-form__send" disabled={status === 'sending'}>
        {status === 'sending' ? t(AGENCY.formSending) : t(AGENCY.formSend)}
      </button>
      {status === 'error' && (
        <p className="ag-form__error">
          {t(AGENCY.formError)} <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>
        </p>
      )}
    </form>
  )
}

export default function Agency({ onClose }) {
  const t = useT()
  // let Escape close it back to the experience
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="agency" role="dialog" aria-label="Web & Style — studio">
      {/* calm ordered backdrop: a faint code grid + a soft violet vignette —
          the matrix "resolved into order", not raining */}
      <div className="agency__grid" aria-hidden="true" />
      <div className="agency__vignette" aria-hidden="true" />

      <div className="agency__scroll">
        <header className="agency__bar">
          <span className="agency__brand">{BRAND.name}</span>
          <button type="button" className="agency__back" onClick={() => onClose?.()}>
            {t(AGENCY.back)}
          </button>
        </header>

        {/* MASTHEAD */}
        <section className="agency__hero">
          <Reveal as="p" className="agency__kicker">{t(AGENCY.kicker)}</Reveal>
          <Reveal as="h1" className="agency__title">{t(AGENCY.title)}</Reveal>
          <Reveal as="p" className="agency__intro">{t(AGENCY.intro)}</Reveal>
        </section>

        {/* SERVICES — a capabilities index, not cards */}
        <section className="agency__section">
          <Reveal as="h2" className="agency__h2"><span className="agency__h2-mark">01</span>{t(AGENCY.servicesTitle)}</Reveal>
          <ul className="ag-index">
            {AGENCY.services.map((s) => (
              <Reveal as="li" key={s.n} className="ag-index__row">
                <span className="ag-index__n">{s.n}</span>
                <h3 className="ag-index__title">{t(s.title)}</h3>
                <p className="ag-index__text">{t(s.text)}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* PROCESS */}
        <section className="agency__section">
          <Reveal as="h2" className="agency__h2"><span className="agency__h2-mark">02</span>{t(AGENCY.processTitle)}</Reveal>
          <Reveal as="p" className="agency__lead">{t(AGENCY.processLead)}</Reveal>
          <ol className="ag-process">
            {AGENCY.process.map((p) => (
              <Reveal as="li" key={p.n} className="ag-process__step">
                <span className="ag-process__n">{p.n}</span>
                <h3 className="ag-process__title">{t(p.title)}</h3>
                <p className="ag-process__text">{t(p.text)}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* SELECTED WORK — the 3D DNA with leader-line case studies */}
        <section className="agency__section agency__section--work">
          <Reveal as="h2" className="agency__h2"><span className="agency__h2-mark">03</span>{t(AGENCY.workTitle)}</Reveal>
          <Reveal as="p" className="agency__lead">{t(AGENCY.workLead)}</Reveal>
          <DnaCaseStudies />
          <Reveal as="p" className="agency__note">{t(AGENCY.workNote)}</Reveal>
        </section>

        {/* ABOUT */}
        <section className="agency__section agency__section--about">
          <Reveal as="h2" className="agency__h2"><span className="agency__h2-mark">04</span>{t(AGENCY.aboutTitle)}</Reveal>
          <Reveal as="p" className="agency__about">{t(AGENCY.about)}</Reveal>
        </section>

        {/* CONTACT */}
        <section className="agency__section agency__contact" id="contact">
          <div className="agency__contact-left">
            <Reveal as="h2" className="agency__h2"><span className="agency__h2-mark">05</span>{t(AGENCY.contactTitle)}</Reveal>
            <Reveal as="p" className="agency__lead">{t(AGENCY.contactText)}</Reveal>
            <Reveal as="p" className="agency__email">
              <span>{t(AGENCY.emailLabel)}</span>
              <a href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>
            </Reveal>
          </div>
          <Reveal className="agency__contact-right">
            <ContactForm />
          </Reveal>
        </section>

        <footer className="agency__footer">
          <span className="agency__foot-brand">{BRAND.name}</span>
          <a className="agency__foot-mail" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>
          <span className="agency__foot-credit">
            Chromatic Journey — Tycho Magnetic Anomaly · Sketchfab · CC-BY-4.0
          </span>
          <span className="agency__foot-copy">© {new Date().getFullYear()} {BRAND.name}</span>
        </footer>
      </div>
    </div>
  )
}
