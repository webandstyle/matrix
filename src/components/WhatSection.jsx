import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { WHAT_SECTION } from '../data/content'
import { useT } from '../i18n/LanguageContext'
import './WhatSection.css'

export default function WhatSection() {
  const t = useT()
  const sectionRef = useRef(null)
  const [inView, setInView] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="what" id="experiences" ref={sectionRef}>
      <motion.h2
        className="what__heading"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        {t(WHAT_SECTION.heading)}
      </motion.h2>

      <div className="what__grid">
        {WHAT_SECTION.cards.map((card, i) => (
          <motion.article
            key={card.key}
            className={`what__card what__card--${card.key}`}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: 'easeOut', delay: shouldReduceMotion ? 0 : 0.12 * i }}
          >
            <h3>{t(card.title)}</h3>
            <p>{t(card.text)}</p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}
