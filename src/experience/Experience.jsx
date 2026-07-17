import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { HERO } from '../data/content'
import { useT } from '../i18n/LanguageContext'
import SpinScene from './SpinScene'
import CodeUniverse from './CodeUniverse'
import './Experience.css'

gsap.registerPlugin(ScrollTrigger)

const POSTER = '/assets/hero-sprite/hero-poster.jpg'

// one continuous scroll, measured in vh so the phases keep a stable feel:
//   hero journey (spin → matrix → & fall) saturates after HERO_VH,
//   the stage entrance plays over ENTRY_VH,
//   the rabbit hole dive → tube plays over RABBIT_VH,
//   the arrival (dark space, "Choose your Path", the pill-hand emerging from the
//   smoke) + the choice screen play over ARRIVAL_VH.
export const HERO_VH = 880
export const ENTRY_VH = 180
export const RABBIT_VH = 520
export const ARRIVAL_VH = 420
export const SCROLL_VH = 100 + HERO_VH + ENTRY_VH + RABBIT_VH + ARRIVAL_VH
const SCROLLABLE = SCROLL_VH - 100
export const HERO_END = HERO_VH / SCROLLABLE
export const ENTRY_END = (HERO_VH + ENTRY_VH) / SCROLLABLE
export const RABBIT_END = (HERO_VH + ENTRY_VH + RABBIT_VH) / SCROLLABLE

function smoothstep(x, a, b) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

export default function Experience({
  progressRef: progressProp,
  entryRef: entryProp,
  rabbitRef: rabbitProp,
  arrivalRef: arrivalProp,
}) {
  const t = useT()
  const scrollSpaceRef = useRef(null)
  const phase1Ref = useRef(null)
  const phase2Ref = useRef(null)
  const spinWrapRef = useRef(null)
  const codeWrapRef = useRef(null)
  const fixedRef = useRef(null)
  const localProgress = useRef(0)
  const localEntry = useRef(0)
  const localRabbit = useRef(0)
  const localArrival = useRef(0)
  const progressRef = progressProp || localProgress
  const entryRef = entryProp || localEntry
  const rabbitRef = rabbitProp || localRabbit
  const arrivalRef = arrivalProp || localArrival
  const [reduceMotion, setReduceMotion] = useState(null)

  useLayoutEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  // phase texts ride the first act only (wall + burn happen in p 0..0.5)
  useLayoutEffect(() => {
    if (reduceMotion !== false) return undefined

    const ctx = gsap.context(() => {
      gsap.set(phase2Ref.current, { opacity: 0, y: 22 })

      gsap
        .timeline({
          scrollTrigger: {
            trigger: scrollSpaceRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.5,
          },
        })
        .to(phase1Ref.current, { opacity: 0, y: -20, filter: 'blur(6px)', duration: 5 }, 12)
        .fromTo(
          phase2Ref.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 5 },
          17,
        )
        .to(phase2Ref.current, { opacity: 0, y: -20, filter: 'blur(6px)', duration: 5 }, 32)
        .set({}, {}, 100)
    })

    return () => ctx.revert()
  }, [reduceMotion])

  // cross-fade the two canvases; near the end the code canvas dissolves its
  // own background to transparency (the falling & stays above the incoming
  // chooser), so the fixed layer only needs to release pointer events
  useEffect(() => {
    if (reduceMotion !== false) return undefined
    const pickMode = new URLSearchParams(window.location.search).has('pick')
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = progressRef.current
      if (pickMode) {
        if (spinWrapRef.current) spinWrapRef.current.style.opacity = '0'
        if (codeWrapRef.current) codeWrapRef.current.style.opacity = '1'
        return
      }
      if (spinWrapRef.current) {
        spinWrapRef.current.style.opacity = String(1 - smoothstep(p, 0.62, 0.66))
      }
      if (codeWrapRef.current) {
        codeWrapRef.current.style.opacity = String(smoothstep(p, 0.6, 0.64))
      }
      if (fixedRef.current) {
        fixedRef.current.style.pointerEvents = p > 0.93 ? 'none' : ''
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])

  if (reduceMotion === null) return null

  if (reduceMotion) {
    return (
      <section className="experience experience--static">
        <img className="experience__poster" src={POSTER} alt="" />
        <div className="experience__scrim" />
        <div className="experience__final is-visible">
          <h1>{t(HERO.headline)}</h1>
          <p>{t(HERO.subheadline)}</p>
        </div>
      </section>
    )
  }

  return (
    <div className="experience">
      <div className="experience__scroll-space" ref={scrollSpaceRef} />
      <div className="experience__canvas-fixed" ref={fixedRef}>
        <div className="experience__spin" ref={spinWrapRef}>
          <SpinScene
            scrollTargetRef={scrollSpaceRef}
            progressRef={progressRef}
            entryRef={entryRef}
            rabbitRef={rabbitRef}
            arrivalRef={arrivalRef}
            heroEnd={HERO_END}
            entryEnd={ENTRY_END}
            rabbitEnd={RABBIT_END}
          />
          <div className="experience__scrim" />
        </div>
        <div className="experience__text-layer">
          <p className="experience__phase" ref={phase1Ref}>
            {t(HERO.phase1)}
          </p>
          <p className="experience__phase" ref={phase2Ref}>
            {t(HERO.phase2)}
          </p>
        </div>
        <div className="experience__code" ref={codeWrapRef}>
          <CodeUniverse progressRef={progressRef} />
        </div>
      </div>
    </div>
  )
}
