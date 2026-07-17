import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'
import TubeRide from './TubeRide'
import './RabbitHole.css'

// smoothstep for the JS-side crossfade between the portal dive and the tube ride
function smooth(x, a, b) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

// The rabbit hole: after the & lands, continued scrolling dives into the &'s
// portal and down a psychedelic tube toward the "choose your path" screen.
// One fullscreen tunnel shader carries phase 1 (the portal opening + dive) and
// will extend to the tube journey; arrival + choice come as later scenes.
// Driven by rabbitRef (0→1) from the shared scroll.
//
// Placement editor: open with ?rabbit — the portal centre is tunable (sliders
// + drag on the canvas), with a "freeze" so it stays visible while you place
// it. Copy the JSON and I hardcode it into DEFAULT_CFG.

const CFG_KEY = 'ws-rabbit'
// cx/cy = portal centre in screen fraction (cx: 0 left → 1 right, cy: 0 top → 1
// bottom). dive/freeze are editor-only (freeze holds the dive so the portal is
// visible for placement without scrolling).
// cx/cy = the ENTRANCE portal centre (on the & — user-placed 2026-07-14).
// In production the centre drifts to screen-middle as we dive, so the dark
// EXIT at the far end is centred (we fly out through it into the arrival).
const DEFAULT_CFG = { cx: 0.629, cy: 0.097, freeze: 0, dive: 0.05 }

function loadCfg() {
  let c = { ...DEFAULT_CFG }
  try {
    const s = localStorage.getItem(CFG_KEY)
    if (s) c = { ...c, ...JSON.parse(s) }
  } catch {
    // corrupted store — defaults
  }
  const url = new URLSearchParams(window.location.search)
  for (const k of ['cx', 'cy', 'dive', 'freeze']) {
    const v = url.get('r' + k)
    if (v !== null && Number.isFinite(Number(v))) c[k] = Number(v)
  }
  return c
}

const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDive;
  uniform vec2 uRes;
  uniform vec2 uCenter;  // portal centre in 0..1 screen coords (y up)

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.,0.)), c = hash(i + vec2(0.,1.)), d = hash(i + vec2(1.,1.));
    vec2 u = f * f * (3. - 2. * f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.02; a*=.5; } return s; }
  vec3 pal(float t){ return .5 + .5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }

  // full psychedelic colour of the tunnel at a point. Angular terms use
  // periodic functions so they wrap seamlessly around the atan2 branch cut.
  vec3 tunnel(vec2 uv){
    float r = length(uv);
    float ang = atan(uv.y, uv.x);
    float travel = uTime * 0.4 + uDive * 7.0;
    float depth = 0.4 / (r + 0.07) + travel;
    float bands = fbm(vec2(cos(ang), sin(ang)) * 3.0 + depth * 0.7);
    float h = fract(depth * 0.13 + uTime * 0.02 + 0.12 * sin(ang * 3.0 + travel));
    vec3 col = pal(h) * (0.35 + 0.95 * bands);
    col += 0.32 * pal(fract(depth * 0.33 + 0.3)) * pow(0.5 + 0.5 * sin(ang * 6.0 + depth * 3.0 + travel), 2.0);
    col *= smoothstep(0.0, 0.22, r);      // dark vanishing point down the tube
    return col;
  }

  void main(){
    // uv centred on the portal (from uCenter), aspect-corrected
    vec2 uv = gl_FragCoord.xy / uRes - uCenter;
    uv.x *= uRes.x / uRes.y;
    float r = length(uv);

    // chromatic aberration: sample channels at slightly offset radii
    float ca = 0.02 + 0.06 * r;
    vec3 col;
    col.r = tunnel(uv * (1.0 - ca)).r;
    col.g = tunnel(uv).g;
    col.b = tunnel(uv * (1.0 + ca)).b;
    col *= 1.0 - 0.45 * smoothstep(0.65, 1.35, r);  // vignette

    // portal iris opens from the centre (the &) as the dive begins
    float iris = smoothstep(0.0, 0.30, uDive);
    float portalR = mix(0.0, 1.75, iris);
    float mask = 1.0 - smoothstep(portalR - 0.14, portalR, r);
    float rim = (1.0 - smoothstep(0.0, 0.11, abs(r - portalR))) * (1.0 - iris * 0.65);
    col += rim * vec3(1.0, 0.92, 0.72) * 1.5;

    gl_FragColor = vec4(col, clamp(mask, 0.0, 1.0));
  }
`

function Tunnel({ rabbitRef, cfgRef, reduceMotion, editor }) {
  const size = useThree((s) => s.size)
  const matRef = useRef()
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDive: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    }),
    [],
  )
  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    const cfg = cfgRef.current
    const frozen = editor && cfg.freeze
    const dive = frozen ? cfg.dive : rabbitRef.current
    m.uniforms.uTime.value = reduceMotion ? 0 : state.clock.elapsedTime
    m.uniforms.uDive.value = dive
    // entrance sits on the & (cx/cy); in production the centre drifts to the
    // middle as we dive so the dark exit ends centred. Frozen = stay put (edit).
    let ecx = cfg.cx
    let ecy = cfg.cy
    if (!frozen) {
      const t = Math.min(Math.max(dive / 0.55, 0), 1)
      const s = t * t * (3 - 2 * t)
      ecx = cfg.cx + (0.5 - cfg.cx) * s
      ecy = cfg.cy + (0.5 - cfg.cy) * s
    }
    m.uniforms.uCenter.value.set(ecx, 1 - ecy) // cy is top-down; gl_FragCoord is bottom-up
    m.uniforms.uRes.value.set(size.width, size.height)
  })
  return (
    <ScreenQuad>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}

function Field({ label, value, min, max, step, onChange }) {
  return (
    <label className="rabbit-editor__row">
      <span>{label}: <b>{Math.round(value * 1000) / 1000}</b></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function RabbitEditor({ cfgRef, registerSync }) {
  const [cfg, setCfg] = useState({ ...cfgRef.current })
  const [note, setNote] = useState('')
  useEffect(() => { registerSync?.(() => setCfg({ ...cfgRef.current })) }, [registerSync, cfgRef])
  const set = (k, v) => {
    const next = { ...cfgRef.current, [k]: v }
    cfgRef.current = next
    setCfg(next)
    setNote('')
  }
  return (
    <div className="rabbit-editor">
      <p className="rabbit-editor__title">PORTÁL / CSŐ</p>
      <p className="rabbit-editor__hint">Húzd a vásznon a portált a &amp; jelre, vagy állítsd a csúszkákkal.</p>
      <Field label="pozíció X" value={cfg.cx} min={0} max={1} step={0.001} onChange={(v) => set('cx', v)} />
      <Field label="pozíció Y" value={cfg.cy} min={0} max={1} step={0.001} onChange={(v) => set('cy', v)} />
      <label className="rabbit-editor__row rabbit-editor__row--check">
        <input type="checkbox" checked={cfg.freeze === 1} onChange={(e) => set('freeze', e.target.checked ? 1 : 0)} />
        <span>fázis rögzítése (látszik elhelyezéshez)</span>
      </label>
      <Field label="belépő fázis" value={cfg.dive} min={0} max={1} step={0.01} onChange={(v) => set('dive', v)} />
      <div className="rabbit-editor__actions">
        <button type="button" onClick={() => { localStorage.setItem(CFG_KEY, JSON.stringify(cfgRef.current)); setNote('elmentve ✓') }}>Mentés</button>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(cfgRef.current)); setNote('vágólapon ✓') }}>Másolás</button>
        <button type="button" onClick={() => { localStorage.removeItem(CFG_KEY); cfgRef.current = { ...DEFAULT_CFG, freeze: 1 }; setCfg({ ...cfgRef.current }); setNote('alaphelyzet') }}>Reset</button>
      </div>
      {note && <p className="rabbit-editor__note">{note}</p>}
    </div>
  )
}

export default function RabbitHole({ rabbitRef }) {
  const editor = useMemo(() => new URLSearchParams(window.location.search).has('rabbit'), [])
  const cfgRef = useRef(null)
  if (cfgRef.current === null) {
    cfgRef.current = loadCfg()
    if (editor) cfgRef.current.freeze = 1 // show the portal for placement
  }
  const [active, setActive] = useState(editor)
  const [tubeActive, setTubeActive] = useState(false)
  const reduceMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const dragRef = useRef(false)
  const syncFnRef = useRef(null)
  const registerSync = useCallback((fn) => { syncFnRef.current = fn }, [])
  const portalWrapRef = useRef(null)
  const tubeWrapRef = useRef(null)

  // mount the portal + tube canvases as the dive progresses, and crossfade the
  // portal dive (Part 1) into the rollercoaster tube ride (Part 3) around the
  // point where the iris has fully engulfed the view.
  useEffect(() => {
    if (editor) return undefined
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const rr = rabbitRef.current
      if (!active && rr > 0.001) setActive(true)
      if (!tubeActive && rr > 0.11) setTubeActive(true)
      // tighter crossfade so the tube's opaque backdrop covers the stage quickly
      // (a slow fade let the hand/logo bleed through mid-transition)
      const fade = smooth(rr, 0.15, 0.22) // 0 = portal, 1 = tube
      if (portalWrapRef.current) portalWrapRef.current.style.opacity = String(1 - fade)
      if (tubeWrapRef.current) tubeWrapRef.current.style.opacity = String(fade)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, tubeActive, editor, rabbitRef])

  // editor: drag the portal centre around the screen
  useEffect(() => {
    if (!editor) return undefined
    const onMove = (e) => {
      if (!dragRef.current) return
      cfgRef.current = {
        ...cfgRef.current,
        cx: Math.min(Math.max(e.clientX / window.innerWidth, 0), 1),
        cy: Math.min(Math.max(e.clientY / window.innerHeight, 0), 1),
      }
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = false
      syncFnRef.current?.()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [editor])

  const onDown = (e) => {
    if (!editor) return
    if (e.target.closest && e.target.closest('.rabbit-editor')) return // don't drag from the panel
    dragRef.current = true
    cfgRef.current = {
      ...cfgRef.current,
      cx: Math.min(Math.max(e.clientX / window.innerWidth, 0), 1),
      cy: Math.min(Math.max(e.clientY / window.innerHeight, 0), 1),
    }
  }

  return (
    <div className={`rabbit${editor ? ' rabbit--editor' : ''}`} aria-hidden="true" onPointerDown={onDown}>
      {active && (
        <div className="rabbit__layer" ref={portalWrapRef}>
          <Canvas className="rabbit__canvas" dpr={[1, 1.5]} gl={{ alpha: true, antialias: false }}>
            <Tunnel rabbitRef={rabbitRef} cfgRef={cfgRef} reduceMotion={reduceMotion} editor={editor} />
          </Canvas>
        </div>
      )}
      {tubeActive && (
        <div className="rabbit__layer" ref={tubeWrapRef} style={{ opacity: 0 }}>
          <TubeRide rabbitRef={rabbitRef} reduceMotion={reduceMotion} />
        </div>
      )}
      {editor && <RabbitEditor cfgRef={cfgRef} registerSync={registerSync} />}
    </div>
  )
}
