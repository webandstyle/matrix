import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { HERO } from '../data/content'
import { useT } from '../i18n/LanguageContext'
import './Hero.css'

gsap.registerPlugin(ScrollTrigger)

const HERO_VIDEO = '/assets/hero/hero-loop.mp4'
const HERO_POSTER = '/assets/hero/hero-poster.jpg'

export default function Hero() {
  const t = useT()
  const wrapRef = useRef(null)
  const stageRef = useRef(null)
  const phase1Ref = useRef(null)
  const phase2Ref = useRef(null)
  const finalRef = useRef(null)
  const [mode, setMode] = useState('desktop') // 'desktop' | 'simple' | 'static'

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.matchMedia('(max-width: 760px)').matches

    if (reduceMotion) {
      setMode('static')
      return
    }
    if (isMobile) {
      setMode('simple')
      return
    }
    setMode('desktop')

    const ctx = gsap.context(() => {
      gsap.set(phase2Ref.current, { opacity: 0, y: 22 })
      gsap.set(finalRef.current, { opacity: 0, y: 26, filter: 'blur(8px)' })

      gsap
        .timeline({
          scrollTrigger: {
            trigger: wrapRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.6,
            pin: stageRef.current,
            anticipatePin: 1,
          },
        })
        .to(phase1Ref.current, { opacity: 0, y: -20, filter: 'blur(6px)', duration: 6 }, 22)
        .fromTo(
          phase2Ref.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 6 },
          28,
        )
        .to(phase2Ref.current, { opacity: 0, y: -20, filter: 'blur(6px)', duration: 6 }, 48)
        .fromTo(
          finalRef.current,
          { opacity: 0, y: 26, filter: 'blur(10px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 10 },
          58,
        )
    }, wrapRef)

    return () => ctx.revert()
  }, [])

  if (mode === 'static') {
    return (
      <section className="hero hero--static" id="hero">
        <img className="hero__bg-img" src={HERO_POSTER} alt="" />
        <div className="hero__scrim" />
        <HeroFinal t={t} visible />
      </section>
    )
  }

  if (mode === 'simple') {
    return (
      <section className="hero hero--simple" id="hero">
        <video
          className="hero__video"
          autoPlay
          muted
          playsInline
          poster={HERO_POSTER}
          src={HERO_VIDEO}
        />
        <div className="hero__scrim" />
        <HeroFinal t={t} visible />
      </section>
    )
  }

  return (
    <section className="hero" id="hero">
      <div className="hero__pin-wrap" ref={wrapRef}>
        <div className="hero__stage" ref={stageRef}>
          <video
            className="hero__video"
            autoPlay
            muted
            playsInline
            poster={HERO_POSTER}
            src={HERO_VIDEO}
          />
          <div className="hero__scrim" />

          <div className="hero__text-layer">
            <p className="hero__phase hero__phase--1" ref={phase1Ref}>
              {t(HERO.phase1)}
            </p>
            <p className="hero__phase hero__phase--2" ref={phase2Ref}>
              {t(HERO.phase2)}
            </p>
            <HeroFinal t={t} innerRef={finalRef} />
          </div>
        </div>
      </div>
    </section>
  )
}

function HeroFinal({ t, innerRef, visible }) {
  return (
    <div
      className={`hero__phase hero__phase--final${visible ? ' is-visible' : ''}`}
      ref={innerRef}
    >
      <h1>{t(HERO.headline)}</h1>
      <p className="hero__sub">{t(HERO.subheadline)}</p>
      <div className="hero__ctas">
        <a href="#experiences" className="lux-btn primary">
          {t(HERO.ctaPrimary)}
        </a>
        <a href="#experiences" className="lux-btn">
          {t(HERO.ctaSecondary)}
        </a>
      </div>
    </div>
  )
}
