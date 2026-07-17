import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BRAND, CHOOSE } from '../data/content'
import { useT } from '../i18n/LanguageContext'
import HandScene, { HandPoseEditor, loadPose, logoWidth, WORLD_HEIGHT } from './HandScene'
import './ChooseSection.css'

// the landing point of the journey: the & hero has fallen out of the code
// universe and lands here, inside the Web&Style logo. The stage is a FIXED,
// full-viewport layer (like the hero canvas) — NOT a section that scrolls up
// from below. One shared scroll drives the whole page: `progressRef` runs the
// hero journey, `entryRef` (its tail) plays the stage entrance. As the journey
// nears its end the stage cross-fades in exactly where the matrix dissolves,
// so the scenes flow into each other with no seam.
//
// The copy + pill cards are parked behind SHOW_COPY until the composition is
// final — the user wants the pure logo/hand stage first.
const SHOW_COPY = false

const clamp01 = (v) => Math.min(Math.max(v, 0), 1)
const smoothstep = (x, a, b) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export default function ChooseSection({ progressRef: progressProp, entryRef: entryProp }) {
  const t = useT()
  // shared with Experience via App; fall back to local refs if used alone
  const localProgress = useRef(0)
  const localEntry = useRef(0)
  const progressRef = progressProp || localProgress
  const entryRef = entryProp || localEntry

  const [reduceMotion, setReduceMotion] = useState(false)
  // ?hand → visual pose editor; the live pose is shared via this ref
  const handEditor = useMemo(() => new URLSearchParams(window.location.search).has('hand'), [])
  const poseRef = useRef(null)
  const logoRef = useRef(null)
  // the & landing anchor — in the in-space logo modes it lives at stage
  // level, glued onto the 3D logo's own & slot by HandScene's AmpAnchor
  const ampRef = useRef(null)
  // the fixed stage layer whose opacity we cross-fade from the scroll progress
  const pinRef = useRef(null)
  if (poseRef.current === null) poseRef.current = loadPose()
  // model/logo-mode switching needs a re-render, unlike the ref-driven pose
  const [modelIdx, setModelIdx] = useState(poseRef.current.md || 0)
  // 0 = DOM image logo, 1 = image plane in 3D space, 2 = Meshy 3D logo model
  const [logoMode, setLogoMode] = useState(poseRef.current.lg || 0)
  // which element the stage drag moves (editor only)
  const [dragTarget, setDragTarget] = useState('hand')
  const dragRef = useRef(null)
  const syncFnRef = useRef(null)
  // the heavy 3D stage mounts only once the journey nears the landing (keeps
  // the hero light); the editor mounts it immediately
  const [handReady, setHandReady] = useState(handEditor)
  const mountedRef = useRef(handEditor)
  const registerSync = useCallback((fn) => {
    syncFnRef.current = fn
  }, [])

  const applyLogoLayout = useCallback(() => {
    const p = poseRef.current
    if (!logoRef.current) return
    logoRef.current.style.width = logoWidth(p.lw)
    logoRef.current.style.left = `${p.lx}%`
    logoRef.current.style.top = `${p.ly}%`
  }, [])

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    applyLogoLayout()
    // the fixed stage only listens for drags in the editor; otherwise it must
    // never intercept pointer events over the whole viewport
    if (pinRef.current) pinRef.current.style.pointerEvents = handEditor ? 'auto' : 'none'
  }, [applyLogoLayout, handEditor])

  // reveal driver: read the shared scroll refs, cross-fade the stage in as the
  // hero journey lands, mount the 3D near the end, and gate the & hold flag
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      entryRef.current = 1
      setHandReady(true)
      mountedRef.current = true
      if (pinRef.current) pinRef.current.style.opacity = '1'
      const amp = ampRef.current
      if (amp) amp.dataset.hold = ''
      return undefined
    }
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = progressRef.current
      // editor: show the fully composed stage (entry 1) from the top so it can
      // be edited without scrolling; the "freeze phase" toggle previews a
      // specific mid-entrance frame instead
      if (handEditor) {
        entryRef.current = poseRef.current.efon === 1 ? poseRef.current.ef ?? 1 : 1
      }
      // mount the heavy 3D once we're close to the landing
      if (!mountedRef.current && p > 0.5) {
        mountedRef.current = true
        setHandReady(true)
      }
      // the stage stays HIDDEN while the matrix plays, then fades in over the
      // very tail of the journey (p 0.973→0.995) — the exact window in which the
      // matrix finishes dissolving. So there is neither an overlap (the two
      // visible at once) NOR a black gap: the matrix vanishes and the hand
      // arrives in the same breath. (Editor: always shown.)
      if (pinRef.current) {
        pinRef.current.style.opacity = handEditor ? '1' : String(smoothstep(p, 0.973, 0.995))
      }
      // in-space logo modes: the landed green & WAITS at its slot until the
      // logo has descended around it — CodeUniverse checks this hold flag
      // before starting its green→gold melt
      const amp = ampRef.current
      if (amp) amp.dataset.hold = poseRef.current.lg > 0 && entryRef.current < 0.95 ? '1' : ''
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [handEditor, progressRef, entryRef])

  // ---- editor: drag the logo / the hand around the stage ----
  useEffect(() => {
    if (!handEditor) return undefined

    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      if (d.target === 'text1' || d.target === 'text2') {
        // wordmark lines: drag in world units
        const unit = window.innerHeight / WORLD_HEIGHT
        const kx = d.target === 'text1' ? 't1x' : 't2x'
        const ky = d.target === 'text1' ? 't1y' : 't2y'
        poseRef.current = {
          ...poseRef.current,
          [kx]: d.pose[kx] + dx / unit,
          [ky]: d.pose[ky] - dy / unit,
        }
      } else if (d.target === 'logo' && d.pose.lg > 0) {
        // in-space logo: drag in world units
        const unit = window.innerHeight / WORLD_HEIGHT
        poseRef.current = {
          ...poseRef.current,
          lgx: d.pose.lgx + dx / unit,
          lgy: d.pose.lgy - dy / unit,
        }
      } else if (d.target === 'logo') {
        poseRef.current = {
          ...poseRef.current,
          lx: d.pose.lx + (dx / window.innerWidth) * 100,
          ly: d.pose.ly + (dy / window.innerHeight) * 100,
        }
        applyLogoLayout()
      } else {
        // full-screen canvas: WORLD_HEIGHT world units span the viewport height
        const unit = window.innerHeight / WORLD_HEIGHT
        poseRef.current = {
          ...poseRef.current,
          x: d.pose.x + dx / unit,
          y: d.pose.y - dy / unit,
        }
      }
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      syncFnRef.current?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [handEditor, applyLogoLayout])

  const onStageDown = (e) => {
    if (!handEditor) return
    e.preventDefault()
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      target: dragTarget,
      pose: { ...poseRef.current },
    }
  }

  return (
    <section className={`choose${reduceMotion ? ' choose--static' : ''}`} id="choose">
      {/* the fixed, full-viewport stage — it sits BEHIND the hero canvas
          (z-index) and is uncovered when the matrix dissolves at the landing;
          in ?hand it jumps in front so the stage can be edited from the top */}
      <div className={`choose__pin${handEditor ? ' choose__pin--editor' : ''}`} ref={pinRef}>
        {/* the free stage: transparent logo + the 3D hand, placed in space;
            the code universe is a sphere around the scene, inside HandScene */}
        <div
          className={`choose__stage${handEditor ? ' choose__stage--editor' : ''}`}
          onPointerDown={onStageDown}
        >
          {/* the 3D hand — full-screen canvas so it can live anywhere in space */}
          <div className="choose__hand" aria-hidden="true">
            {handReady && (
              <HandScene
                poseRef={poseRef}
                entryRef={entryRef}
                modelIdx={modelIdx}
                logoMode={logoMode}
                reduceMotion={reduceMotion}
                ampRef={ampRef}
              />
            )}
          </div>

          {/* in-space logo modes: the & landing anchor lives at stage level —
              AmpAnchor (in the canvas) projects the 3D logo's & slot to screen
              every frame and glues this span onto it. CodeUniverse targets its
              rect for the fall, flashes it green, and holds the green until the
              descending logo captures it (dataset.hold). */}
          {logoMode > 0 && (
            <span className="choose__amp choose__amp--stage" ref={ampRef} aria-hidden="true">
              &amp;
            </span>
          )}

          {/* the brand mark: the & of the logo is the hero's landing slot — the
              overlay span is invisible by default and only flashes green on
              handoff, then fades to reveal the logo's own gold &. In the
              in-space logo modes the DOM image goes ghost (the 3D canvas draws
              the logo) but the box stays as the landing anchor. */}
          <h1
            className={`choose__logo${logoMode > 0 ? ' choose__logo--ghost' : ''}`}
            aria-label={BRAND.name}
            ref={logoRef}
          >
            <img
              className="choose__logo-img"
              src="/assets/brand/ws-mark.webp"
              alt=""
              draggable={false}
            />
            {logoMode === 0 && <span className="choose__amp" aria-hidden="true">&amp;</span>}
          </h1>
        </div>

        {SHOW_COPY && (
          <div className="choose__panel">
            <p className="choose__kicker">{t(CHOOSE.kicker)}</p>
            <p className="choose__lead">{t(CHOOSE.lead)}</p>
            <p className="choose__pill-line">{t(CHOOSE.pillLine)}</p>

            <div className="choose__options">
              {/* red pill = down the rabbit hole; mind-jungle URL comes later */}
              <a
                className="choose__card choose__card--red"
                href="#experience-soon"
                onClick={(e) => e.preventDefault()}
                aria-disabled="true"
              >
                <span className="choose__pill choose__pill--red" aria-hidden="true" />
                <span className="choose__pill-name">{t(CHOOSE.optionExperience.pill)}</span>
                <h2>{t(CHOOSE.optionExperience.title)}</h2>
                <p>{t(CHOOSE.optionExperience.text)}</p>
                <span className="choose__cta">{t(CHOOSE.optionExperience.cta)} →</span>
              </a>

              <a className="choose__card choose__card--blue" href="#agency">
                <span className="choose__pill choose__pill--blue" aria-hidden="true" />
                <span className="choose__pill-name">{t(CHOOSE.optionAgency.pill)}</span>
                <h2>{t(CHOOSE.optionAgency.title)}</h2>
                <p>{t(CHOOSE.optionAgency.text)}</p>
                <span className="choose__cta">{t(CHOOSE.optionAgency.cta)} →</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {handEditor && (
        <HandPoseEditor
          poseRef={poseRef}
          logoRef={logoRef}
          onModel={setModelIdx}
          onLogoMode={setLogoMode}
          dragTarget={dragTarget}
          onDragTarget={setDragTarget}
          registerSync={registerSync}
        />
      )}
    </section>
  )
}
