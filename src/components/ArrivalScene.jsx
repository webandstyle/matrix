import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture, Text, ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'
import {
  GardenItems,
  GardenLabPanel,
  loadItems,
  loadLight,
  withIds,
  preloadGardenModels,
} from './GardenItems'
import GardenSky from './GardenSky'
import Butterflies from './Butterflies'
import './ArrivalScene.css'

// Part 4 of the rabbit hole: THE ARRIVAL. We emerge from the tube's dark exit
// into a black void, then a garden path (the "path" of Choose your Path) fades
// in. On the LEFT a 3D title sits in the garden; on the RIGHT the pill-hand
// surfaces from the smoke. Everything is driven by arrivalRef (0→1).
//
// ?arrival opens the placement editor: garden background, fully editable 3D
// title (text / font / size / depth / position / rotation) and the hand
// (position / scale / depth / rotation), with a phase freeze for tuning.

// the choice layer (title, pill-hands, aura, matrix curtain) is PARKED while
// the garden space is being rebuilt — flip back on once the world is dressed.
// The matrix returns differently: hidden in the sky/clouds/rainbow as small
// glitches and surfacing code, the system faltering before the choice.
const SHOW_CHOICE = false

const MODEL = '/assets/models/pillhand.glb'
const GARDEN = '/assets/garden.webp'
// the red pill leads into the mind-jungle — the "Creative Cortex" experience,
// a LOCAL project at C:\Users\hibyr\portf\creative-cortex-refactored
// (npm run dev there → serve on localhost:5173). Swap for the live URL later.
const RED_PILL_URL = 'http://localhost:5173/'
const BLUE_PILL_HASH = '#agency'
const GARDEN_AR = 1125 / 1998 // image height / width
const CFG_KEY = 'ws-arrival'

// selectable faces for the 3D title (drei <Text> loads .otf directly)
const FONTS = [
  { name: 'Jelvion', url: '/assets/fonts/Jelvion.otf' },
  { name: 'Milker', url: '/assets/fonts/Milker.otf' },
  { name: 'Metropolis', url: '/assets/fonts/Metropolis-Medium.otf' },
  { name: 'Alap', url: undefined },
]

// hand: hx/hy/hs/hz world pos+scale+start-depth, rx/ry/rz rotation (deg)
// title (3D): stext content, sfont index, ssize world, sx/sy/sz world pos
//   (sz = depth into the garden), srx/sry/srz rotation (deg), scolor
// garden: bx/by/bz plane pos, bs scale
// at/freeze editor-only.
const DEFAULT_CFG = {
  hx: 1.65, hy: 0.05, hs: 1.8, hz: -8, rx: 27, ry: -27, rz: 0,
  stext: 'Choose\nyour Path', sfont: 1, ssize: 0.88,
  sx: -4.2, sy: -0.4, sz: -0.05, srx: 0, sry: 0, srz: 0, scolor: '#f4f1ff',
  bx: 0, by: -0.5, bz: -6.2, bs: 1.24,
  gbr: 1.42, gsa: 1.6, gco: 1.08, // garden brightness / saturation / contrast (revives the dead light)
  freeze: 0, at: 0.7,
}
// which keys force a <Text> rebuild (vs. per-frame updates)
const UI_KEYS = ['stext', 'sfont', 'ssize', 'scolor']

const clamp01 = (v) => Math.min(Math.max(v, 0), 1)
const smooth = (x, a, b) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const deg = (d) => THREE.MathUtils.degToRad(d || 0)
const pickUi = (c) => ({ stext: c.stext, sfont: c.sfont, ssize: c.ssize, scolor: c.scolor })

function loadCfg() {
  let c = { ...DEFAULT_CFG }
  try {
    const s = localStorage.getItem(CFG_KEY)
    if (s) c = { ...c, ...JSON.parse(s) }
  } catch {
    // corrupted store — defaults
  }
  const url = new URLSearchParams(window.location.search)
  const numeric = ['hx', 'hy', 'hs', 'hz', 'rx', 'ry', 'rz', 'sfont', 'ssize', 'sx', 'sy', 'sz', 'srx', 'sry', 'srz', 'bx', 'by', 'bz', 'bs', 'gbr', 'gsa', 'gco', 'at', 'freeze']
  for (const k of numeric) {
    const v = url.get('a' + k)
    if (v !== null && Number.isFinite(Number(v))) c[k] = Number(v)
  }
  return c
}

// garden shader: samples the texture and revives its "dead light" with
// brightness / saturation / contrast (the source photo is dusky). Texture is
// NoColorSpace so the raw sRGB values pass straight through (no double convert),
// matching a toneMapped:false basic material but with the colour grade applied.
const GARDEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const GARDEN_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uBright, uSat, uContrast, uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    vec3 c = t.rgb * uBright;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);              // saturation
    c = (c - 0.5) * uContrast + 0.5;        // contrast around mid-grey
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a * uOpacity);
  }
`

// the garden path plane, deep behind the hand + title (always drawn hindmost)
function GardenBg({ arrivalRef, cfgRef, editor }) {
  const tex = useTexture(GARDEN)
  const meshRef = useRef()
  const matRef = useRef()
  const uniforms = useMemo(
    () => ({
      uMap: { value: tex },
      uBright: { value: 1.4 },
      uSat: { value: 1.6 },
      uContrast: { value: 1.08 },
      uOpacity: { value: 0 },
    }),
    [tex],
  )
  useMemo(() => { tex.colorSpace = THREE.NoColorSpace }, [tex])
  useFrame(() => {
    const cfg = cfgRef.current
    const a = editor && cfg.freeze ? cfg.at : arrivalRef.current
    const m = matRef.current
    if (m) {
      m.uniforms.uOpacity.value = smooth(a, 0.04, 0.28)
      m.uniforms.uBright.value = cfg.gbr
      m.uniforms.uSat.value = cfg.gsa
      m.uniforms.uContrast.value = cfg.gco
    }
    if (meshRef.current) {
      meshRef.current.position.set(cfg.bx, cfg.by, cfg.bz)
      const w = 16 * cfg.bs
      meshRef.current.scale.set(w, w * GARDEN_AR, 1)
    }
  })
  return (
    // depthTest ON: the plate must yield to garden items standing in front of
    // it (depthTest:false let its opaque grass pixels stomp over the models);
    // renderOrder -10 still draws it first among transparents so grass cards
    // blend over it cleanly
    <mesh ref={meshRef} renderOrder={-10}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={GARDEN_VERT}
        fragmentShader={GARDEN_FRAG}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

// the 3D title — sits in the garden, fully tunable (text/font/size/pos/depth/rot)
function Title3D({ arrivalRef, cfgRef, editor, ui }) {
  const groupRef = useRef()
  const matRef = useRef()
  useFrame(() => {
    const cfg = cfgRef.current
    const a = editor && cfg.freeze ? cfg.at : arrivalRef.current
    if (matRef.current) matRef.current.opacity = smooth(a, 0.12, 0.42)
    if (groupRef.current) {
      groupRef.current.position.set(cfg.sx, cfg.sy, cfg.sz)
      groupRef.current.rotation.set(deg(cfg.srx), deg(cfg.sry), deg(cfg.srz))
    }
  })
  return (
    <group ref={groupRef}>
      <Text
        key={`${ui.sfont}-${ui.stext}`}
        font={FONTS[ui.sfont]?.url}
        fontSize={ui.ssize}
        anchorX="left"
        anchorY="middle"
        textAlign="left"
        lineHeight={1.05}
        letterSpacing={0.01}
      >
        {ui.stext}
        <meshBasicMaterial
          ref={matRef}
          attach="material"
          color={ui.scolor}
          transparent
          toneMapped={false}
          opacity={0}
          depthWrite={false}
        />
      </Text>
    </group>
  )
}

// the frozen matrix curtain on the black void: still, faint vertical code
// columns that DRAIN over time — every ~9s a random column loses its lowest
// glyph, so the code slowly empties. A subconscious "time is passing, choose"
// nudge. It sits BEHIND the 3D scene (the garden/hand/title cover it), only
// showing through on the upper black area.
const MATRIX_CHARS = '01アイウエオカキクケサシスセソタチツ0123456789$+*<>=|╱╲✦'

function MatrixCurtain({ arrivalRef, curtainRef, reduceMotion }) {
  const canvasRef = useRef()
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const FONT = 16
    const STEP = 24
    let w = 0, h = 0, columns = []
    const rand = (n) => Math.floor(Math.random() * n)

    function build() {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      const rows = Math.ceil(h / FONT) + 1
      const n = Math.ceil(w / STEP)
      columns = []
      for (let i = 0; i < n; i += 1) {
        const chars = []
        for (let j = 0; j < rows; j += 1) chars.push(MATRIX_CHARS[rand(MATRIX_CHARS.length)])
        columns.push({ x: i * STEP + 5, chars, len: 3 + rand(Math.floor(rows * 0.6)) })
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h)
      ctx.font = `${FONT}px "IBM Plex Mono", monospace`
      ctx.textBaseline = 'top'
      for (const col of columns) {
        for (let j = 0; j < col.len; j += 1) {
          const fromBottom = col.len - j
          // brightest glyph sits at the draining tip; the rest is VERY faint
          // (per the user: a barely-there subconscious layer, not a backdrop)
          const a = fromBottom === 1 ? 0.28 : fromBottom <= 3 ? 0.12 : 0.06
          ctx.fillStyle = `rgba(96, 224, 138, ${a})`
          ctx.fillText(col.chars[j], col.x, j * FONT)
        }
      }
    }
    build()
    draw()
    const onResize = () => { build(); draw() }
    window.addEventListener('resize', onResize)
    // drain: a random living column drops its lowest glyph on an interval
    const drain = reduceMotion ? null : setInterval(() => {
      const alive = columns.filter((c) => c.len > 1)
      if (alive.length) alive[rand(alive.length)].len -= 1
      // gentle life: reshuffle a couple of glyphs so it isn't dead-static
      for (let k = 0; k < 3; k += 1) {
        const c = columns[rand(columns.length)]
        c.chars[rand(c.chars.length)] = MATRIX_CHARS[rand(MATRIX_CHARS.length)]
      }
      draw()
    }, 9000)
    return () => { window.removeEventListener('resize', onResize); if (drain) clearInterval(drain) }
  }, [reduceMotion])

  return <canvas ref={(el) => { canvasRef.current = el; if (curtainRef) curtainRef.current = el }} className="arrival__matrix" />
}

// migraine-aura vision: patchy scintillating fortification arcs — zigzag
// rainbow rings that shimmer at the screen's periphery (sharp centre, per the
// reference image) plus one small patch that follows the cursor. Subtle,
// additive-feeling, driven in over the arrival's second half.
const AURA_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const AURA_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAmp;
  uniform vec2 uRes;
  uniform vec2 uMouse;   // 0..1, y up

  vec3 hue(float t){ return .5 + .5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }
  float tri(float x){ return abs(fract(x) - 0.5) * 2.0; }

  // one scintillating arc patch: a zigzag ring around c, only part of the
  // circle (arc mask), flickering fast like a scintillating scotoma
  vec4 patchArc(vec2 uv, vec2 c, float baseR, float seed){
    vec2 d = uv - c;
    d.x *= uRes.x / uRes.y;
    float r = length(d);
    float ang = atan(d.y, d.x);
    // fortification zigzag: triangle wave displaces the ring radius
    float zig = (tri(ang / 6.2831853 * 9.0 + seed) - 0.5) * 0.42 * baseR;
    float band = 1.0 - smoothstep(0.006, 0.05, abs(r - baseR - zig));
    float arc = smoothstep(0.0, 0.7, sin(ang + seed * 2.4));
    float flick = 0.55 + 0.45 * sin(uTime * (8.0 + seed * 2.0) + ang * 22.0);
    vec3 col = hue(ang / 6.2831853 + uTime * 0.06 + seed * 0.17);
    return vec4(col, band * arc * flick);
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    // periphery patches (fixed seats near the edges) + the cursor's halo
    vec4 p1 = patchArc(uv, vec2(0.10, 0.72), 0.11, 1.0);
    vec4 p2 = patchArc(uv, vec2(0.93, 0.34), 0.14, 2.7);
    vec4 p3 = patchArc(uv, vec2(0.72, 0.93), 0.085, 4.2);
    vec4 p4 = patchArc(uv, vec2(0.30, 0.06), 0.10, 5.6);
    vec4 pm = patchArc(uv, uMouse, 0.05, 6.9);

    vec3 col = vec3(0.0);
    float a = 0.0;
    col += p1.rgb * p1.a; a += p1.a;
    col += p2.rgb * p2.a; a += p2.a;
    col += p3.rgb * p3.a; a += p3.a;
    col += p4.rgb * p4.a; a += p4.a;
    col += pm.rgb * pm.a * 1.2; a += pm.a * 1.2;
    a = clamp(a, 0.0, 1.0);
    if (a > 0.001) col /= max(a, 0.001);

    gl_FragColor = vec4(col, a * 0.42 * uAmp);
  }
`

function AuraVision({ arrivalRef, cfgRef, editor, reduceMotion }) {
  const size = useThree((s) => s.size)
  const matRef = useRef()
  const mouse = useRef({ x: 0.5, y: 0.5 })
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    }),
    [],
  )
  useEffect(() => {
    const onMove = (e) => {
      mouse.current.x = e.clientX / window.innerWidth
      mouse.current.y = 1 - e.clientY / window.innerHeight // gl_FragCoord is bottom-up
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    const cfg = cfgRef.current
    const a = editor && cfg.freeze ? cfg.at : arrivalRef.current
    m.uniforms.uTime.value = reduceMotion ? 0 : state.clock.elapsedTime
    m.uniforms.uAmp.value = smooth(a, 0.5, 0.9)
    m.uniforms.uRes.value.set(size.width, size.height)
    m.uniforms.uMouse.value.set(mouse.current.x, mouse.current.y)
  })
  return (
    <ScreenQuad renderOrder={10}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={AURA_VERT}
        fragmentShader={AURA_FRAG}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}

function PillHand({ arrivalRef, cfgRef, editor }) {
  const { scene } = useGLTF(MODEL)
  const outerRef = useRef()
  const matsRef = useRef([])
  const model = useMemo(() => scene.clone(true), [scene])
  useEffect(() => {
    const mats = []
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone()
        o.material.transparent = true
        o.material.depthWrite = true
        mats.push(o.material)
      }
    })
    matsRef.current = mats
  }, [model])

  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const s = 2 / maxDim
    const c = box.getCenter(new THREE.Vector3())
    return { s, p: [-c.x * s, -c.y * s, -c.z * s] }
  }, [model])

  useFrame(() => {
    const cfg = cfgRef.current
    const a = editor && cfg.freeze ? cfg.at : arrivalRef.current
    const e = smooth(a, 0.3, 0.86)
    const op = smooth(a, 0.34, 0.72)
    if (outerRef.current) {
      outerRef.current.position.set(cfg.hx, cfg.hy, cfg.hz + (0 - cfg.hz) * e)
      outerRef.current.scale.setScalar(cfg.hs * (0.82 + 0.18 * e))
      outerRef.current.rotation.set(deg(cfg.rx), deg(cfg.ry), deg(cfg.rz))
    }
    for (const m of matsRef.current) m.opacity = op
  })

  // the choice: our own raycast on the canvas's pointer events (the r3f
  // per-object handlers proved unreliable on this cloned primitive). The model
  // is ONE mesh holding both hands, so the hit point's LOCAL x decides which
  // was clicked — left hand offers the red pill (the mind-jungle), right hand
  // the blue (the agency).
  const { gl, camera } = useThree()
  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const canChoose = () => !editor && arrivalRef.current > 0.55
    const pick = (e) => {
      if (!outerRef.current) return null
      const rect = el.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(outerRef.current, true)
      return hits.length ? hits[0] : null
    }
    const onMove = (e) => {
      if (!canChoose()) { document.body.style.cursor = ''; return }
      document.body.style.cursor = pick(e) ? 'pointer' : ''
    }
    const onDown = (e) => {
      if (!canChoose()) return
      const hit = pick(e)
      if (!hit) return
      const local = outerRef.current.worldToLocal(hit.point.clone())
      if (local.x < 0) window.location.href = RED_PILL_URL
      else window.location.hash = BLUE_PILL_HASH
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      document.body.style.cursor = ''
    }
  }, [gl, camera, editor, arrivalRef])

  return (
    <group ref={outerRef}>
      <group scale={norm.s} position={norm.p}>
        <primitive object={model} />
      </group>
    </group>
  )
}

// mounts only once the Suspense above it commits — the watchdog reads the flag
function SceneReady({ flag }) {
  useEffect(() => {
    flag.current = true
    return () => { flag.current = false }
  }, [flag])
  return null
}

function Stage({
  arrivalRef,
  cfgRef,
  editor,
  ui,
  reduceMotion,
  sceneKey,
  readyFlag,
  lab,
  items,
  selectedId,
  onSelect,
  onMove,
  light,
}) {
  // the butterflies write their sky-tap point here; GardenSky reads it to fault
  // the sky at the impact ("the system wobbles where they hit the LED wall")
  const hitRef = useRef(null)
  return (
    <>
      {/* the glitching sky sits hindmost, behind the ground plate */}
      <GardenSky reduceMotion={reduceMotion} hitRef={hitRef} />
      {/* black smoke: fog sinks the hand into black on the black DOM layer and
          releases it as it pushes forward = "surfacing from smoke" (garden item
          materials opt out of it — it washed their colors toward black) */}
      <fog attach="fog" args={['#000000', 4, 16]} />
      <ambientLight intensity={light.amb} />
      {/* KEY LIGHT = the sun, from the upper-LEFT to match the ground plate's
          baked light (user marked the shadow direction: sun upper-left). Warm. */}
      <directionalLight position={[-7, 5, 3]} intensity={light.dir} color="#fff2d8" />
      {/* SKY FILL from the right so the shadowed side (statue, right-hand
          flowers) doesn't go black — cool, so warm sun vs cool shade reads right */}
      <directionalLight position={[6, 2.5, 2]} intensity={light.dir * 0.32} color="#bcd2ff" />
      {/* keyed: the parent watchdog remounts this subtree if a load race left
          the Suspense stuck pending (rare, ~1 in 3 cold sessions) — on retry
          the loader caches are warm so it commits instantly */}
      <Suspense key={sceneKey} fallback={null}>
        <GardenBg arrivalRef={arrivalRef} cfgRef={cfgRef} editor={editor} />
        <GardenItems
          items={items}
          selectedId={selectedId}
          editorLab={lab}
          onSelect={onSelect}
          onMove={onMove}
          reduceMotion={reduceMotion}
        />
        <Butterflies hitRef={hitRef} reduceMotion={reduceMotion} />
        {SHOW_CHOICE && <Title3D arrivalRef={arrivalRef} cfgRef={cfgRef} editor={editor} ui={ui} />}
        {SHOW_CHOICE && <PillHand arrivalRef={arrivalRef} cfgRef={cfgRef} editor={editor} />}
        <SceneReady flag={readyFlag} />
      </Suspense>
      {SHOW_CHOICE && (
        <AuraVision arrivalRef={arrivalRef} cfgRef={cfgRef} editor={editor} reduceMotion={reduceMotion} />
      )}
    </>
  )
}

function Field({ label, value, min, max, step, onChange }) {
  return (
    <label className="arrival-editor__row">
      <span>{label}: <b>{Math.round(value * 1000) / 1000}</b></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function ArrivalEditor({ cfgRef, registerSync, onUi }) {
  const [cfg, setCfg] = useState({ ...cfgRef.current })
  const [note, setNote] = useState('')
  useEffect(() => { registerSync?.(() => setCfg({ ...cfgRef.current })) }, [registerSync, cfgRef])
  const set = (k, v) => {
    const next = { ...cfgRef.current, [k]: v }
    cfgRef.current = next
    setCfg(next)
    setNote('')
    if (UI_KEYS.includes(k)) onUi?.()
  }
  return (
    <div className="arrival-editor">
      <p className="arrival-editor__title">MEGÉRKEZÉS</p>
      <p className="arrival-editor__hint">A fázis-rögzítés a görgetés nélkül mutatja a jelenetet.</p>

      <p className="arrival-editor__group">Felirat — szöveg</p>
      <label className="arrival-editor__row">
        <span>szöveg <em className="arrival-editor__tip">(Enter = új sor)</em></span>
        <textarea className="arrival-editor__text" rows={3} value={cfg.stext}
          onChange={(e) => set('stext', e.target.value)} />
      </label>
      <label className="arrival-editor__row">
        <span>font</span>
        <select className="arrival-editor__select" value={cfg.sfont}
          onChange={(e) => set('sfont', Number(e.target.value))}>
          {FONTS.map((f, i) => <option key={f.name} value={i}>{f.name}</option>)}
        </select>
      </label>
      <label className="arrival-editor__row arrival-editor__row--check">
        <span>szín</span>
        <input type="color" value={cfg.scolor} onChange={(e) => set('scolor', e.target.value)} />
      </label>
      <Field label="méret" value={cfg.ssize} min={0.1} max={2.5} step={0.01} onChange={(v) => set('ssize', v)} />
      <p className="arrival-editor__group">Felirat — hely / 3D</p>
      <Field label="X (bal/jobb)" value={cfg.sx} min={-8} max={8} step={0.05} onChange={(v) => set('sx', v)} />
      <Field label="Y (le/fel)" value={cfg.sy} min={-5} max={5} step={0.05} onChange={(v) => set('sy', v)} />
      <Field label="Z (mélység)" value={cfg.sz} min={-8} max={3} step={0.05} onChange={(v) => set('sz', v)} />
      <Field label="forgatás X" value={cfg.srx ?? 0} min={-90} max={90} step={1} onChange={(v) => set('srx', v)} />
      <Field label="forgatás Y" value={cfg.sry ?? 0} min={-90} max={90} step={1} onChange={(v) => set('sry', v)} />
      <Field label="forgatás Z" value={cfg.srz ?? 0} min={-90} max={90} step={1} onChange={(v) => set('srz', v)} />

      <p className="arrival-editor__group">Kert (háttér)</p>
      <Field label="háttér X" value={cfg.bx} min={-8} max={8} step={0.05} onChange={(v) => set('bx', v)} />
      <Field label="háttér Y" value={cfg.by} min={-6} max={6} step={0.05} onChange={(v) => set('by', v)} />
      <Field label="háttér mélység Z" value={cfg.bz} min={-14} max={-1} step={0.1} onChange={(v) => set('bz', v)} />
      <Field label="háttér méret" value={cfg.bs} min={0.3} max={3.5} step={0.02} onChange={(v) => set('bs', v)} />
      <Field label="fényerő" value={cfg.gbr ?? 1.4} min={0.5} max={2.5} step={0.02} onChange={(v) => set('gbr', v)} />
      <Field label="telítettség" value={cfg.gsa ?? 1.6} min={0} max={2.5} step={0.02} onChange={(v) => set('gsa', v)} />
      <Field label="kontraszt" value={cfg.gco ?? 1.08} min={0.5} max={2} step={0.02} onChange={(v) => set('gco', v)} />

      <p className="arrival-editor__group">Pill-kéz</p>
      <Field label="kéz X" value={cfg.hx} min={-4} max={4} step={0.05} onChange={(v) => set('hx', v)} />
      <Field label="kéz Y" value={cfg.hy} min={-3} max={3} step={0.05} onChange={(v) => set('hy', v)} />
      <Field label="kéz méret" value={cfg.hs} min={0.3} max={3} step={0.05} onChange={(v) => set('hs', v)} />
      <Field label="kezdő mélység (z)" value={cfg.hz} min={-16} max={-2} step={0.5} onChange={(v) => set('hz', v)} />
      <Field label="forgatás X" value={cfg.rx ?? 0} min={-180} max={180} step={1} onChange={(v) => set('rx', v)} />
      <Field label="forgatás Y" value={cfg.ry ?? 0} min={-180} max={180} step={1} onChange={(v) => set('ry', v)} />
      <Field label="forgatás Z" value={cfg.rz ?? 0} min={-180} max={180} step={1} onChange={(v) => set('rz', v)} />

      <label className="arrival-editor__row arrival-editor__row--check">
        <input type="checkbox" checked={cfg.freeze === 1} onChange={(e) => set('freeze', e.target.checked ? 1 : 0)} />
        <span>fázis rögzítése</span>
      </label>
      <Field label="fázis" value={cfg.at} min={0} max={1} step={0.01} onChange={(v) => set('at', v)} />

      <div className="arrival-editor__actions">
        <button type="button" onClick={() => { localStorage.setItem(CFG_KEY, JSON.stringify(cfgRef.current)); setNote('elmentve ✓') }}>Mentés</button>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(cfgRef.current)); setNote('vágólapon ✓') }}>Másolás</button>
        <button type="button" onClick={() => { localStorage.removeItem(CFG_KEY); cfgRef.current = { ...DEFAULT_CFG, freeze: 1 }; setCfg({ ...cfgRef.current }); onUi?.(); setNote('alaphelyzet') }}>Reset</button>
      </div>
      {note && <p className="arrival-editor__note">{note}</p>}
    </div>
  )
}

export default function ArrivalScene({ arrivalRef }) {
  const editor = useMemo(() => new URLSearchParams(window.location.search).has('arrival'), [])
  // ?garden → the GardenLab: arrange the 3D set dressing on the ground plate
  const lab = useMemo(() => new URLSearchParams(window.location.search).has('garden'), [])
  const frozen = editor || lab
  const cfgRef = useRef(null)
  if (cfgRef.current === null) {
    cfgRef.current = loadCfg()
    if (frozen) {
      cfgRef.current.freeze = 1
      if (lab) cfgRef.current.at = 1 // the lab shows the fully-arrived scene
    }
  }
  const [active, setActive] = useState(frozen)
  // garden set-dressing instances (lab edits them; production renders baked)
  const [items, setItems] = useState(() => withIds(loadItems()))
  const [selectedId, setSelectedId] = useState(null)
  const [light, setLight] = useState(() => loadLight())
  const onItemMove = useCallback((id, p) => {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...p } : i)))
  }, [])
  useEffect(() => {
    if (lab) preloadGardenModels()
  }, [lab])
  // render-critical title props (text/font/size/color) re-render the <Text>
  const [ui, setUi] = useState(() => pickUi(cfgRef.current))
  const reduceMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const layerRef = useRef(null)
  const curtainRef = useRef(null)
  const syncFnRef = useRef(null)
  const registerSync = useCallback((fn) => { syncFnRef.current = fn }, [])
  const onUi = useCallback(() => setUi(pickUi(cfgRef.current)), [])
  // load-race watchdog: if the Suspense subtree hasn't committed shortly after
  // the canvas mounted, remount it (loader caches are warm → instant commit)
  const [sceneKey, setSceneKey] = useState(0)
  const readyFlag = useRef(false)
  const activeAtRef = useRef(0)
  const retriesRef = useRef(0)

  useEffect(() => {
    if (frozen) {
      if (layerRef.current) layerRef.current.style.opacity = '1'
    }
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const a = arrivalRef.current
      if (!active && a > 0.001) setActive(true)
      if (active) {
        const now = performance.now()
        if (!activeAtRef.current) activeAtRef.current = now
        if (!readyFlag.current && retriesRef.current < 3 && now - activeAtRef.current > 2500) {
          retriesRef.current += 1
          activeAtRef.current = now
          setSceneKey((k) => k + 1)
        }
      }
      // the matrix curtain surfaces in the second half of the arrival (once the
      // void + garden have settled) — the "you are here, now choose" beat
      if (curtainRef.current) {
        curtainRef.current.style.opacity = frozen ? '1' : String(smooth(a, 0.45, 0.85))
      }
      if (frozen) return
      // the black void fades up over the tube's (already dark) exit
      if (layerRef.current) {
        layerRef.current.style.opacity = String(smooth(a, 0.02, 0.14))
        // once the hands have surfaced, the layer takes the pointer so the
        // pills become clickable (before that it stays transparent to input)
        layerRef.current.style.pointerEvents = SHOW_CHOICE && a > 0.55 ? 'auto' : 'none'
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, frozen, arrivalRef])

  return (
    <div className={`arrival${frozen ? ' arrival--editor' : ''}`} aria-hidden="true" ref={layerRef}>
      {active && SHOW_CHOICE && (
        <MatrixCurtain arrivalRef={arrivalRef} curtainRef={curtainRef} reduceMotion={reduceMotion} />
      )}
      {active && (
        <div className="arrival__canvas-wrap">
          <Canvas
            className="arrival__canvas"
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            camera={{ position: [0, 0, 5], fov: 42, near: 0.1, far: 40 }}
          >
            <Stage
              arrivalRef={arrivalRef}
              cfgRef={cfgRef}
              editor={frozen}
              ui={ui}
              reduceMotion={reduceMotion}
              sceneKey={sceneKey}
              readyFlag={readyFlag}
              lab={lab}
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={onItemMove}
              light={light}
            />
          </Canvas>
        </div>
      )}
      {editor && !lab && <ArrivalEditor cfgRef={cfgRef} registerSync={registerSync} onUi={onUi} />}
      {lab && (
        <GardenLabPanel
          items={items}
          setItems={setItems}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          light={light}
          setLight={setLight}
        />
      )}
    </div>
  )
}

useGLTF.preload(MODEL)
useTexture.preload(GARDEN)
