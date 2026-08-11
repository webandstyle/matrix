import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ChromaEnv } from './ChromaJourney'
import { useT } from '../i18n/LanguageContext'
import { AGENCY } from '../data/content'
import './DnaCaseStudies.css'

// SELECTED WORK as a 3D DNA (2026-07-26). A stylized iridescent double helix is
// the centrepiece; four case studies branch off it with leader lines, exactly
// like an anatomy diagram (per the user's reference). Each case study is a DOM
// card at a fixed layout position; its line's DNA-end tracks a 3D anchor point
// parented to the (gently swaying) helix, projected to screen every frame — so
// the lines stay glued to the strand as it breathes.

const DNA = '/assets/models/dna.glb'

// pose of the helix (tuned live): the model's LONG axis is its local Z, so
// rotY≈90° lays that length across the screen (otherwise it points into the
// camera and looks stubby); rotZ tilts it to the diagonal; rotX reveals the coil.
// The idle motion is a small, centred SWAY that always returns — no continuous
// drift — so the leader-line anchors never rotate away from the strand.
const POSE = {
  fit: 9.2,          // normalized max dimension (world units) — spans the stage
  rotX: 0.32, rotY: 1.5708, rotZ: -0.4, // base orientation (radians)
  sway: 0.05,        // idle rotation sway amplitude (gentle, bounded)
}

// four anchor points in the helix's LOCAL space (children of the DNA group, so
// they ride the coil in 3D). Place them ON the strand with the ?dna editor
// (drag each dot onto the DNA — it raycasts onto the surface) and Save; the
// baked/localStorage values load here. Defaults sit on the central axis.
const ANCHOR_KEY = 'ws-dna-anchors'
// baked from the ?dna editor (user, 2026-07-26)
const DEFAULT_ANCHORS = [
  [-0.101, -0.482, -0.429], // card 0 — Vanity Mirror
  [-0.314, 0.113, -0.972],  // card 1 — House on the Cliff
  [0.11, -0.86, -0.099],    // card 2 — The Story of the Olive
  [1.122, -0.58, 1.188],    // card 3 — Web & Style immersive
]
function loadAnchors() {
  try {
    const s = localStorage.getItem(ANCHOR_KEY)
    if (s) {
      const a = JSON.parse(s)
      if (Array.isArray(a) && a.length === 4 && a.every((p) => Array.isArray(p) && p.length === 3)) return a
    }
  } catch {
    // corrupted store — defaults
  }
  return DEFAULT_ANCHORS.map((p) => [...p])
}

function DnaModel({ dnaGroupRef, anchorRefs, anchors }) {
  const { scene } = useGLTF(DNA)
  const model = useMemo(() => scene.clone(true), [scene])
  useEffect(() => {
    // the raw albedo is a dull grey-blue — the reference's vivid iridescence
    // comes from the MATERIAL, not the texture. Rebuild each surface as a glossy
    // metallic MeshPhysicalMaterial with thin-film IRIDESCENCE (the real rainbow
    // effect) + a soft brand-violet emissive lift so it never reads black. The
    // normal map keeps the beaded strand detail; roughness/metalness maps are
    // dropped for a uniform wet, chromatic sheen.
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const src = Array.isArray(o.material) ? o.material : [o.material]
      const build = (m) => {
        const p = new THREE.MeshPhysicalMaterial({
          map: m.map || null,
          normalMap: m.normalMap || null,
          metalness: 0.9,
          roughness: 0.2,
          envMapIntensity: 2.4,
          iridescence: 1.0,
          iridescenceIOR: 1.35,
          iridescenceThicknessRange: [120, 780],
          clearcoat: 0.6,
          clearcoatRoughness: 0.25,
          emissiveMap: m.map || null,
          emissive: new THREE.Color(0x7a5cae),
          emissiveIntensity: 0.35,
        })
        return p
      }
      o.material = Array.isArray(o.material) ? src.map(build) : build(src[0])
    })
  }, [model])
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const s = POSE.fit / maxDim
    const c = box.getCenter(new THREE.Vector3())
    return { s, p: [-c.x * s, -c.y * s, -c.z * s] }
  }, [model])
  return (
    <group ref={dnaGroupRef} rotation={[POSE.rotX, POSE.rotY, POSE.rotZ]}>
      <group scale={norm.s} position={norm.p}>
        <primitive object={model} />
      </group>
      {anchors.map((a, i) => (
        <object3D key={i} position={a} ref={(el) => { anchorRefs.current[i] = el }} />
      ))}
    </group>
  )
}

// idle motion + per-frame projection of the anchors onto the SVG leader lines
function Rig({ dnaGroupRef, anchorRefs, lineRefs, dotRefs, labelRefs, editor }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const g = dnaGroupRef.current
    if (g) {
      const t = state.clock.elapsedTime
      // bounded sway only — always returns to the base pose, never drifts.
      // In the ?dna editor the helix is held STILL so anchors can be placed.
      if (editor) {
        g.rotation.set(POSE.rotX, POSE.rotY, POSE.rotZ)
        g.position.y = 0
      } else {
        g.rotation.x = POSE.rotX + Math.sin(t * 0.4) * POSE.sway * 0.6
        g.rotation.y = POSE.rotY + Math.sin(t * 0.28) * POSE.sway
        g.rotation.z = POSE.rotZ
        g.position.y = Math.sin(t * 0.5) * 0.05
      }
    }
    for (let i = 0; i < anchorRefs.current.length; i++) {
      const a = anchorRefs.current[i]
      const line = lineRefs.current[i]
      const dot = dotRefs.current[i]
      if (!a) continue
      a.getWorldPosition(v).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      if (line) { line.setAttribute('x2', x.toFixed(1)); line.setAttribute('y2', y.toFixed(1)) }
      if (dot) { dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)) }
      const label = labelRefs?.current?.[i]
      if (label) { label.setAttribute('x', (x + 11).toFixed(1)); label.setAttribute('y', (y - 9).toFixed(1)) }
    }
  })
  return null
}

// ?dna editor: drag an anchor dot and it raycasts onto the DNA surface, so the
// leader-line end sticks to the exact bead you point at (stored in the helix's
// local space → rides the coil in 3D). Picks the nearest anchor on pointerdown.
function AnchorEditor({ dnaGroupRef, anchorRefs, onSelect, onCommit }) {
  const { gl, camera, size } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const proj = new THREE.Vector3()
    let sel = -1
    const px = (e) => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top, r]
    }
    const down = (e) => {
      const [mx, my] = px(e)
      let best = -1
      let bd = 34 // px pick radius
      anchorRefs.current.forEach((a, i) => {
        if (!a) return
        a.getWorldPosition(proj).project(camera)
        const x = (proj.x * 0.5 + 0.5) * size.width
        const y = (-proj.y * 0.5 + 0.5) * size.height
        const d = Math.hypot(x - mx, y - my)
        if (d < bd) { bd = d; best = i }
      })
      sel = best
      if (sel >= 0) { el.setPointerCapture?.(e.pointerId); onSelect?.(sel); e.preventDefault() }
    }
    const move = (e) => {
      if (sel < 0) return
      const [mx, my, r] = px(e)
      ndc.set((mx / r.width) * 2 - 1, -(my / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const g = dnaGroupRef.current
      if (!g) return
      const hits = ray.intersectObject(g, true)
      if (hits.length) {
        anchorRefs.current[sel].position.copy(g.worldToLocal(hits[0].point.clone()))
      }
    }
    const up = (e) => {
      if (sel < 0) return
      el.releasePointerCapture?.(e.pointerId)
      sel = -1
      onCommit?.(anchorRefs.current.map((a) => (a ? a.position.toArray().map((n) => +n.toFixed(3)) : [0, 0, 0])))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl, camera, size, dnaGroupRef, anchorRefs, onSelect, onCommit])
  return null
}

// point where a card's leader line attaches: the spot on the card's border
// facing the stage centre (so the line reads as coming out of the card edge)
function edgePoint(rect, stage, cx, cy) {
  const r = { x: rect.left - stage.left, y: rect.top - stage.top, w: rect.width, h: rect.height }
  const mx = r.x + r.w / 2
  const my = r.y + r.h / 2
  const dx = cx - mx
  const dy = cy - my
  if (dx === 0 && dy === 0) return [mx, my]
  const sx = dx !== 0 ? (r.w / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (r.h / 2) / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return [mx + dx * s, my + dy * s]
}

// autoplaying muted loop video. React's `muted` prop is unreliable (it sets the
// attribute but not always the DOM property, and browsers only autoplay when the
// PROPERTY is muted) — so set it imperatively and kick play() on mount.
function MockVideo({ src, poster }) {
  const ref = useRef(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    const p = v.play?.()
    if (p && p.catch) p.catch(() => {})
  }, [])
  return <video ref={ref} src={src} poster={poster} autoPlay muted loop playsInline preload="auto" />
}

// desktop (browser window) + phone mockups shown inside a case-study card,
// side by side (bottom-aligned) so neither is cropped. The desktop screen plays
// a looping muted video when one is given, else shows the still.
function DeviceMockups({ desktop, desktopVideo, mobile, label, href }) {
  const Wrap = href ? 'a' : 'div'
  const extra = href ? { href, target: '_blank', rel: 'noreferrer' } : {}
  return (
    <Wrap className="dna-mock" {...extra}>
      <div className="dna-mock__desktop">
        <div className="dna-mock__bar"><i /><i /><i /></div>
        <div className="dna-mock__screen">
          {desktopVideo
            ? <MockVideo src={desktopVideo} poster={desktop} />
            : desktop
              ? <img src={desktop} alt={`${label} — desktop`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              : <span className="dna-mock__ph">{label}</span>}
        </div>
      </div>
      <div className="dna-mock__phone">
        <span className="dna-mock__notch" />
        <div className="dna-mock__phone-screen">
          {mobile
            ? <img src={mobile} alt={`${label} — mobile`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            : <span className="dna-mock__ph" />}
        </div>
      </div>
    </Wrap>
  )
}

export default function DnaCaseStudies() {
  const t = useT()
  const items = AGENCY.work
  const editor = useMemo(() => new URLSearchParams(window.location.search).has('dna'), [])
  const stageRef = useRef(null)
  const cardRefs = useRef([])
  const lineRefs = useRef([])
  const dotRefs = useRef([])
  const labelRefs = useRef([])
  const anchorRefs = useRef([])
  const dnaGroupRef = useRef(null)
  const [anchors, setAnchors] = useState(loadAnchors)
  const [sel, setSel] = useState(-1)
  const [note, setNote] = useState('')
  const commit = useCallback((next) => { setAnchors(next); setNote('') }, [])

  // set each line's CARD-side endpoint from the card's DOM position (recomputed
  // on resize); the DNA-side endpoint is driven per-frame by Rig
  useLayoutEffect(() => {
    const place = () => {
      const stageEl = stageRef.current
      if (!stageEl) return
      const stage = stageEl.getBoundingClientRect()
      const cx = stage.width / 2
      const cy = stage.height / 2
      cardRefs.current.forEach((card, i) => {
        const line = lineRefs.current[i]
        if (!card || !line) return
        const [x1, y1] = edgePoint(card.getBoundingClientRect(), stage, cx, cy)
        line.setAttribute('x1', x1.toFixed(1))
        line.setAttribute('y1', y1.toFixed(1))
      })
    }
    place()
    window.addEventListener('resize', place)
    const ro = new ResizeObserver(place)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => { window.removeEventListener('resize', place); ro.disconnect() }
  }, [])

  return (
    <div className={`dna-work${editor ? ' dna-work--editor' : ''}`} ref={stageRef}>
      <Canvas
        className="dna-work__canvas"
        dpr={[1, 1.6]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 6.5], fov: 42, near: 0.1, far: 40 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} color="#fff2ff" />
        <directionalLight position={[-4, -1, 2]} intensity={0.9} color="#8fbcff" />
        <pointLight position={[0, 0, 4]} intensity={12} color="#e0a8ff" distance={20} />
        <ChromaEnv intensity={1.5} exposure={1.15} />
        <Suspense fallback={null}>
          <DnaModel dnaGroupRef={dnaGroupRef} anchorRefs={anchorRefs} anchors={anchors} />
        </Suspense>
        <Rig dnaGroupRef={dnaGroupRef} anchorRefs={anchorRefs} lineRefs={lineRefs} dotRefs={dotRefs} labelRefs={labelRefs} editor={editor} />
        {editor && <AnchorEditor dnaGroupRef={dnaGroupRef} anchorRefs={anchorRefs} onSelect={setSel} onCommit={commit} />}
        <EffectComposer>
          <Bloom intensity={0.5} luminanceThreshold={0.7} luminanceSmoothing={0.35} mipmapBlur radius={0.7} />
        </EffectComposer>
      </Canvas>

      {/* leader lines (under the cards, over the canvas) */}
      <svg className="dna-work__lines" aria-hidden="true">
        {items.map((_, i) => (
          <g key={i}>
            <line ref={(el) => { lineRefs.current[i] = el }} x1="0" y1="0" x2="0" y2="0" />
            <circle ref={(el) => { dotRefs.current[i] = el }} cx="0" cy="0" r="4"
              className={`dna-work__dot${editor && sel === i ? ' is-sel' : ''}`} />
            {editor && (
              <text ref={(el) => { labelRefs.current[i] = el }} x="0" y="0" className="dna-work__label">{i + 1}</text>
            )}
          </g>
        ))}
      </svg>

      {/* the four case-study cards, positioned around the helix */}
      {items.map((w, i) => (
        <article
          key={w.key}
          ref={(el) => { cardRefs.current[i] = el }}
          className={`dna-work__card dna-work__card--${i}`}
        >
          <span className="dna-work__n">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="dna-work__title">{t(w.title)}</h3>
          <p className="dna-work__role">{t(w.role)}</p>
          <p className="dna-work__text">{t(w.text)}</p>
          {(w.desktop || w.mobile) && (
            <DeviceMockups desktop={w.desktop} desktopVideo={w.desktopVideo} mobile={w.mobile} label={t(w.title)} href={w.href} />
          )}
        </article>
      ))}

      {editor && (
        <div className="dna-editor">
          <p className="dna-editor__title">DNS — leader-line editor</p>
          <p className="dna-editor__hint">
            Húzd a számozott pontokat a DNS-re — a felületre pattannak (raycast), és
            3D-ben ott is maradnak, forgás közben is. A helix áll, hogy pontosan célozz.
            Mentés után élesben is a helyükön lesznek.
          </p>
          <ol className="dna-editor__list">
            {anchors.map((a, i) => (
              <li key={i} className={sel === i ? 'is-sel' : ''}>
                <b>#{i + 1}</b> {t(items[i].title)}
                <code>[{a.map((n) => n.toFixed(2)).join(', ')}]</code>
              </li>
            ))}
          </ol>
          <div className="dna-editor__actions">
            <button type="button" onClick={() => { localStorage.setItem(ANCHOR_KEY, JSON.stringify(anchors)); setNote('elmentve ✓') }}>Mentés</button>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(anchors)); setNote('vágólapon ✓') }}>Másolás</button>
            <button type="button" onClick={() => { localStorage.removeItem(ANCHOR_KEY); setAnchors(DEFAULT_ANCHORS.map((p) => [...p])); setNote('alaphelyzet') }}>Reset</button>
          </div>
          {note && <p className="dna-editor__note">{note}</p>}
        </div>
      )}
    </div>
  )
}

useGLTF.preload(DNA)
