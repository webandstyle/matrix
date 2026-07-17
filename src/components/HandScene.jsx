import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sparkles, Text, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// the brand hand: the 3D version of the hand in the original logo — palm up,
// cradling the W|S portal from below.
//
// Pose/light editor: open the site with ?hand — sliders for the logo size,
// hand pose, lights and skin tone. Save persists to localStorage, Copy puts
// the JSON on the clipboard — paste it back to me and I hardcode it as
// DEFAULT_POSE.
//
// Motion (cursor-follow + idle float) exists but is OFF by default (mv: 0)
// — the user wants the pose/lights dialed in first; enable via the editor
// checkbox or by hardcoding mv: 1 later.

const MODELS = ['/assets/models/hand.glb', '/assets/models/hand2.glb']
const LOGO3D = '/assets/models/logo3d.glb'
const LOGO_TEX = '/assets/brand/ws-mark.webp'
const FONT_MILKER = '/assets/fonts/Milker.otf'
const FONT_METRO = '/assets/fonts/Metropolis-Medium.otf'
const POSE_KEY = 'ws-hand-pose'

// degrees / world units — the user's own tuning from the ?hand editor.
// lx/ly = DOM logo center in viewport %; x/y = hand position in world units;
// lg = logo mode (0 = DOM image, 1 = image plane IN the 3D space so it has
// real depth and can sit in the palm, 2 = the Meshy 3D logo model);
// lgx/lgy/lgz/lgs/lgry = the in-space logo's transform (z = depth).
export const DEFAULT_POSE = {
  rx: -1,
  ry: 338,
  rz: -41,
  x: 0.57,
  y: 0.6,
  s: 2.09,
  m: 0,
  lw: 20,
  lx: 46.4,
  ly: 23.4,
  mv: 0,
  md: 1, // model index (0 = textured hand.glb, 1 = sculpted hand2.glb)
  lg: 2, // the Meshy 3D logo model, laid nearly flat above the palm
  lgx: -0.02,
  lgy: 0.25,
  lgz: 1.99,
  lgs: 0.33,
  lgrx: 99,
  lgry: -4,
  lgrz: -1,
  larc: 1.1, // descent height: the logo drops in from above as the FINAL beat
  // the & landing anchor: where the falling & lands INSIDE the 3D logo —
  // offset from the logo's center (world units) + glyph size (world units).
  // AmpAnchor projects this to screen and glues .choose__amp onto it.
  ax: 0.05,
  ay: -0.01,
  as: 0.18,
  ef: 0.5, // editor-only: frozen entrance phase for tuning mid-move frames
  efon: 0, // 1 = freeze the entrance at `ef` while the editor is open
  // background code universe
  bg: 0.5, // backdrop intensity
  bgc: '#8a4bbf', // backdrop code color
  // the two wordmark lines IN the 3D space (the finger reaches between the
  // letters) — fully independent: position, size, letter spacing, color
  t1x: 0,
  t1y: -0.71,
  t1z: 0.53,
  t1s: 0.57, // font size in world units
  t1ls: 0.045, // letter spacing (em)
  t1c: '#f2ecf7',
  t2x: 0,
  t2y: -1.22,
  t2z: -0.23,
  t2s: 0.053,
  t2ls: 1.2,
  t2c: '#c3b3d6',
  // lights & color — user's magenta/violet grade
  amb: 0.22, // ambient intensity
  env: 1, // environment (reflection) intensity
  rgh: 0.11, // roughness multiplier (glossy)
  met: 0.99, // metalness multiplier (chrome-like)
  key: 1.0, // key light
  keyc: '#8c2679',
  gold: 2.4, // warm gold from the portal flare
  goldc: '#ffc978',
  vio: 1.3, // magenta rim
  vioc: '#d864bf',
  tint: '#803286', // skin tone multiplier (user's pick — magenta violet)
}

export function logoWidth(lw) {
  return `min(100%, ${lw}rem)`
}

// visible world height of the full-screen hand canvas (camera z=4, fov 35) —
// used to convert dragged pixels to world units
export const WORLD_HEIGHT = 2 * 4 * Math.tan((35 / 2) * (Math.PI / 180))

// ---- scroll-driven entrance choreography ----
// entry = how far the stage has scrolled into view (0 → 1, from ChooseSection)
const clamp01 = (v) => Math.min(Math.max(v, 0), 1)
const easeOutCubic = (t) => 1 - (1 - t) ** 3
// the hand must NOT move in depth (that would reveal the arm's cut shoulder
// at the top) — instead we CHEAT: it scales up around an anchor point placed
// where the arm exits the frame, so the shoulder always stays off-screen
const HAND_SCALE_FROM = 0.8
const HAND_SCALE_TO = 1.05 // slight overshoot past the tuned state
const HAND_ANCHOR = { x: 0.27, y: 0.9 } // offset from hand pos toward the frame exit
const TEXT_RISE = 0.5 // the wordmark floats up from this far below

// choreography order (user-defined): the hand grows in alone first, the
// wordmark rises mid-way, and the FINAL beat is the logo descending from
// above into the palm (no depth travel — a pure, ceremonial drop)
const handEntryScale = (e) =>
  THREE.MathUtils.lerp(HAND_SCALE_FROM, HAND_SCALE_TO, easeOutCubic(clamp01(e / 0.85)))
const logoLift = (e, larc) => (larc ?? 1.1) * (1 - easeOutCubic(clamp01((e - 0.72) / 0.28)))
const textEntry = (e) => easeOutCubic(clamp01((e - 0.35) / 0.5))

export function loadPose() {
  let pose = { ...DEFAULT_POSE }
  try {
    const stored = localStorage.getItem(POSE_KEY)
    if (stored) pose = { ...pose, ...JSON.parse(stored) }
  } catch {
    // corrupted store — fall back to defaults
  }
  // URL params override everything (used for automated pose screenshots)
  const url = new URLSearchParams(window.location.search)
  const map = {
    hrx: 'rx',
    hry: 'ry',
    hrz: 'rz',
    hpx: 'x',
    hpy: 'y',
    hs: 's',
    hm: 'm',
    hlw: 'lw',
    hmd: 'md',
    hlg: 'lg',
    hlgz: 'lgz',
    hlgs: 'lgs',
    hty: 't1y',
    htz: 't1z',
  }
  for (const [param, key] of Object.entries(map)) {
    const v = url.get(param)
    if (v !== null && Number.isFinite(Number(v))) pose[key] = Number(v)
  }
  return pose
}

// image-based lighting without any network fetch: three's built-in
// RoomEnvironment gives the PBR skin believable soft reflections
function EnvLight() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

// lights driven live from the shared pose store (editor sliders)
function LightRig({ poseRef }) {
  const ambRef = useRef()
  const keyRef = useRef()
  const goldRef = useRef()
  const vioRef = useRef()

  useFrame(() => {
    const p = poseRef.current
    if (ambRef.current) ambRef.current.intensity = p.amb
    if (keyRef.current) {
      keyRef.current.intensity = p.key
      keyRef.current.color.set(p.keyc)
    }
    if (goldRef.current) {
      goldRef.current.intensity = p.gold
      goldRef.current.color.set(p.goldc)
    }
    if (vioRef.current) {
      vioRef.current.intensity = p.vio
      vioRef.current.color.set(p.vioc)
    }
  })

  return (
    <>
      <ambientLight ref={ambRef} intensity={DEFAULT_POSE.amb} />
      {/* cool key from the upper left (logo's silver-violet), warm gold from
          the portal's light burst above the palm, violet rim from below */}
      <directionalLight ref={keyRef} position={[2, 3, 4]} intensity={DEFAULT_POSE.key} />
      <pointLight ref={goldRef} position={[0.2, 1.3, 0.9]} intensity={DEFAULT_POSE.gold} distance={6} />
      <pointLight ref={vioRef} position={[-2, -1.2, 2]} intensity={DEFAULT_POSE.vio} distance={8} />
    </>
  )
}

// ---- the code universe: a huge sphere AROUND the scene ----
// we sit inside it (BackSide material), so only the far curved wall of
// slowly streaming code is visible, wrapping around the arm.
const CODE_SNIPPETS = [
  "const universe = await mount('#root')",
  "import { experience } from 'web&style'",
  'if (!memorable) dissolve(page)',
  "scroll.on('progress', p => swirl(p))",
  'requestAnimationFrame(driftForever)',
  "camera.lookAt(new Vector3(0, 0, '&'))",
  'export default function WebAndStyle()',
  'return <Experience immersive />',
  'while (scrolling) universe.expand()',
  'gsap.to(reality, { opacity: 0 })',
  'const hero = pick(hands).cradle(logo)',
]

function buildCodeTexture(color) {
  const cnv = document.createElement('canvas')
  cnv.width = 2048
  cnv.height = 1024
  const c = cnv.getContext('2d')
  c.font = '500 14px "IBM Plex Mono", Consolas, monospace'
  c.textAlign = 'left'
  c.textBaseline = 'top'
  c.fillStyle = color
  const colW = 20
  const rowH = 18
  const rows = Math.ceil(cnv.height / rowH)
  for (let x = 0; x < cnv.width; x += colW) {
    let str = ''
    while (str.length < rows) {
      str += `${CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)]} `
    }
    for (let i = 0; i < rows; i += 1) {
      const ch = str[i]
      if (ch === ' ') continue
      const v = Math.random()
      c.globalAlpha = v > 0.97 ? 0.6 : v > 0.8 ? 0.3 : 0.15
      c.fillText(ch, x, i * rowH)
    }
  }
  c.globalAlpha = 1
  return cnv
}

function CodeSphere({ poseRef, reduceMotion }) {
  const matRef = useRef()
  const texRef = useRef(null)
  const lastColor = useRef(null)

  // soft dark pool floating between the sphere and the stage, so the
  // composition keeps sitting on near-black in the middle
  const poolTex = useMemo(() => {
    const cnv = document.createElement('canvas')
    cnv.width = 512
    cnv.height = 512
    const c = cnv.getContext('2d')
    const g = c.createRadialGradient(256, 256, 0, 256, 256, 256)
    g.addColorStop(0, 'rgba(6, 4, 9, 0.95)')
    g.addColorStop(0.6, 'rgba(6, 4, 9, 0.55)')
    g.addColorStop(1, 'rgba(6, 4, 9, 0)')
    c.fillStyle = g
    c.fillRect(0, 0, 512, 512)
    return new THREE.CanvasTexture(cnv)
  }, [])

  useEffect(() => () => {
    texRef.current?.dispose()
    poolTex.dispose()
  }, [poolTex])

  useFrame((state) => {
    const p = poseRef.current
    const color = p.bgc || '#8a4bbf'
    if (color !== lastColor.current) {
      lastColor.current = color
      const tex = new THREE.CanvasTexture(buildCodeTexture(color))
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      // seen from INSIDE the sphere — flip horizontally so the code reads right
      tex.repeat.x = -1
      tex.colorSpace = THREE.NoColorSpace
      texRef.current?.dispose()
      texRef.current = tex
      if (matRef.current) {
        matRef.current.map = tex
        matRef.current.needsUpdate = true
      }
    }
    if (texRef.current && !reduceMotion) {
      // the code streams slowly upward around us
      texRef.current.offset.y = -((state.clock.elapsedTime * 0.005) % 1)
    }
    if (matRef.current) matRef.current.opacity = p.bg ?? 0.5
  })

  return (
    <>
      <mesh renderOrder={-2}>
        <sphereGeometry args={[9, 48, 32]} />
        <meshBasicMaterial
          ref={matRef}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, -4]} renderOrder={-1}>
        <planeGeometry args={[16, 16]} />
        <meshBasicMaterial map={poolTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}

// ---- background life: glow + shooting streaks (user-picked 2025 extras) ----
function makeGlowTexture() {
  const cnv = document.createElement('canvas')
  cnv.width = 256
  cnv.height = 256
  const c = cnv.getContext('2d')
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255, 138, 216, 0.85)')
  g.addColorStop(0.35, 'rgba(199, 127, 255, 0.42)')
  g.addColorStop(1, 'rgba(138, 75, 191, 0)')
  c.fillStyle = g
  c.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(cnv)
}

// slow breathing light halo behind the in-space logo
function LogoGlow({ poseRef, entryRef, reduceMotion }) {
  const ref = useRef()
  const tex = useMemo(makeGlowTexture, [])
  useEffect(() => () => tex.dispose(), [tex])
  useFrame((state) => {
    const p = poseRef.current
    if (!ref.current) return
    const t = state.clock.elapsedTime
    const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 0.8) * 0.12
    const e = entryRef.current
    ref.current.position.set(p.lgx, p.lgy + logoLift(e, p.larc), p.lgz - 0.5)
    ref.current.scale.setScalar((p.lgs || 0.5) * 4.6 * pulse)
    ref.current.material.opacity = 0.5 + (reduceMotion ? 0 : Math.sin(t * 0.8) * 0.12)
  })
  return (
    <mesh ref={ref} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={tex}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

function makeStreakTexture() {
  const cnv = document.createElement('canvas')
  cnv.width = 256
  cnv.height = 16
  const c = cnv.getContext('2d')
  const g = c.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0, 'rgba(255, 255, 255, 0)')
  g.addColorStop(0.5, 'rgba(255, 210, 250, 0.9)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  c.fillStyle = g
  c.fillRect(0, 0, 256, 16)
  return new THREE.CanvasTexture(cnv)
}

// rare data-streaks shooting across the far code wall
const STREAK_COUNT = 3
function Streaks({ reduceMotion }) {
  const tex = useMemo(makeStreakTexture, [])
  const refs = useRef([])
  const streaks = useMemo(
    () =>
      Array.from({ length: STREAK_COUNT }, () => ({
        next: 2 + Math.random() * 6,
        active: false,
        t0: 0,
        dur: 1.2,
        from: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        rot: 0,
      })),
    [],
  )
  useEffect(() => () => tex.dispose(), [tex])
  useFrame(({ clock }) => {
    if (reduceMotion) return
    const now = clock.elapsedTime
    streaks.forEach((s, i) => {
      const m = refs.current[i]
      if (!m) return
      if (!s.active) {
        m.visible = false
        if (now >= s.next) {
          s.active = true
          s.t0 = now
          s.dur = 1 + Math.random() * 0.8
          s.from.set(-6 + Math.random() * 3, -1.5 + Math.random() * 3.5, -5.5 - Math.random() * 1.5)
          const ang = -0.35 + Math.random() * 0.7
          s.dir.set(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(8 + Math.random() * 3)
          s.rot = ang
        }
        return
      }
      const u = (now - s.t0) / s.dur
      if (u >= 1) {
        s.active = false
        s.next = now + 3 + Math.random() * 7
        m.visible = false
        return
      }
      m.visible = true
      m.position.copy(s.from).addScaledVector(s.dir, u)
      m.rotation.z = s.rot
      m.material.opacity = Math.sin(u * Math.PI) * 0.7
    })
  })
  return (
    <>
      {Array.from({ length: STREAK_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          visible={false}
          renderOrder={-1}
        >
          <planeGeometry args={[2.6, 0.045]} />
          <meshBasicMaterial
            map={tex}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            opacity={0}
          />
        </mesh>
      ))}
    </>
  )
}

// the wordmark IN the 3D space, slightly behind the fingertips — the finger
// genuinely reaches between/over the letters (real depth occlusion).
// Both lines are fully independent (pose keys t1*/t2*): position and size
// apply every frame (cheap transform), letter spacing / color only on change
// (they trigger a troika re-layout / material update).
const T1_BASE = 0.2
const T2_BASE = 0.053

function StageTextLine({ poseRef, entryRef, keys, base, font, children }) {
  const ref = useRef()
  const last = useRef({ ls: null, c: null })
  useFrame(() => {
    const p = poseRef.current
    const t = ref.current
    if (!t) return
    // scroll entrance: fade in while floating up from below
    const e = textEntry(entryRef.current)
    t.position.set(p[keys.x], p[keys.y] - (1 - e) * TEXT_RISE, p[keys.z])
    t.scale.setScalar((p[keys.s] ?? base) / base)
    t.fillOpacity = e
    const ls = p[keys.ls]
    const c = p[keys.c]
    if (last.current.ls !== ls || last.current.c !== c) {
      last.current = { ls, c }
      t.letterSpacing = ls
      t.color = c
      t.sync?.()
    }
  })
  return (
    <Text ref={ref} font={font} fontSize={base} anchorX="center" anchorY="middle">
      {children}
    </Text>
  )
}

function StageTexts({ poseRef, entryRef }) {
  return (
    <>
      <StageTextLine
        poseRef={poseRef}
        entryRef={entryRef}
        keys={{ x: 't1x', y: 't1y', z: 't1z', s: 't1s', ls: 't1ls', c: 't1c' }}
        base={T1_BASE}
        font={FONT_MILKER}
      >
        WEB &amp; STYLE
      </StageTextLine>
      <StageTextLine
        poseRef={poseRef}
        entryRef={entryRef}
        keys={{ x: 't2x', y: 't2y', z: 't2z', s: 't2s', ls: 't2ls', c: 't2c' }}
        base={T2_BASE}
        font={FONT_METRO}
      >
        CREATIVE WEB EXPERIENCE STUDIO
      </StageTextLine>
    </>
  )
}

// keeps the DOM landing anchor (.choose__amp) glued to the 3D logo's own
// & slot: the SETTLED (post-descent) slot is projected to screen every frame,
// so the falling & from CodeUniverse aims at the real glyph's final home —
// the green & then waits there while the logo frame descends around it
function AmpAnchor({ poseRef, ampRef }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const el = ampRef?.current
    if (!el) return
    const p = poseRef.current
    v.set(p.lgx + (p.ax ?? 0), p.lgy + (p.ay ?? 0), p.lgz).project(camera)
    el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`
    el.style.top = `${(0.5 - v.y * 0.5) * 100}%`
    // px per world unit at the logo's depth → glyph size in px
    const dist = camera.position.z - p.lgz
    const pxPerWorld =
      size.height / (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    el.style.fontSize = `${(p.as ?? 0.12) * pxPerWorld}px`
  })
  return null
}

// shared: the in-space logo transform driven from the pose store
function applyLogoTransform(obj, p, e = 1) {
  const d = Math.PI / 180
  obj.position.set(p.lgx, p.lgy + logoLift(e, p.larc), p.lgz)
  obj.rotation.set((p.lgrx || 0) * d, (p.lgry || 0) * d, (p.lgrz || 0) * d)
  obj.scale.setScalar(p.lgs)
}

// the transparent brand image as a PLANE in the 3D space — real depth, so it
// can be pulled forward into the palm (lgz slider / drag)
function LogoPlane({ poseRef, entryRef }) {
  const tex = useTexture(LOGO_TEX)
  const ref = useRef()
  useFrame(() => {
    if (ref.current) applyLogoTransform(ref.current, poseRef.current, entryRef.current)
  })
  return (
    <mesh ref={ref}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  )
}

// the Meshy-generated 3D logo model
function Logo3D({ poseRef, entryRef }) {
  const { scene } = useGLTF(LOGO3D)
  const ref = useRef()
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const s = 2 / maxDim
    const c = box.getCenter(new THREE.Vector3())
    return { s, p: [-c.x * s, -c.y * s, -c.z * s] }
  }, [scene])
  useFrame(() => {
    if (ref.current) applyLogoTransform(ref.current, poseRef.current, entryRef.current)
  })
  return (
    <group ref={ref}>
      <group scale={norm.s} position={norm.p}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

function Hand({ url, poseRef, entryRef, reduceMotion }) {
  const { scene } = useGLTF(url)
  const posRef = useRef()
  const mirrorRef = useRef()
  const rotRef = useRef()
  const pointer = useRef({ x: 0, y: 0 })
  const matsRef = useRef([])
  const lastMat = useRef({})

  useEffect(() => {
    const mats = []
    scene.traverse((o) => {
      if (o.isMesh && o.material) mats.push(o.material)
    })
    matsRef.current = mats
    lastMat.current = {}
  }, [scene])

  // normalize any model to the same working size (max dimension = 2 world
  // units, centered), so the pose sliders mean the same for every model
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const s = 2 / maxDim
    const c = box.getCenter(new THREE.Vector3())
    return { s, p: [-c.x * s, -c.y * s, -c.z * s] }
  }, [scene])

  useEffect(() => {
    if (reduceMotion) return undefined
    const onMove = (e) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduceMotion])

  useFrame((state, delta) => {
    const p = poseRef.current
    const t = state.clock.elapsedTime
    const moving = p.mv === 1 && !reduceMotion

    // scroll entrance: scale-around-anchor cheat (see HAND_ANCHOR above) —
    // the hand grows in as if reaching forward, but its position compensates
    // so the arm's frame-exit point never moves and the shoulder stays hidden
    const f = handEntryScale(entryRef.current)
    if (posRef.current) {
      posRef.current.position.x = p.x + HAND_ANCHOR.x * (1 - f)
      // idle float only when motion is enabled
      posRef.current.position.y =
        p.y + HAND_ANCHOR.y * (1 - f) + (moving ? Math.sin(t * 0.9) * 0.035 : 0)
      posRef.current.position.z = 0
    }
    if (mirrorRef.current) mirrorRef.current.scale.x = p.m ? -1 : 1
    if (rotRef.current) {
      const bx = THREE.MathUtils.degToRad(p.rx)
      const by = THREE.MathUtils.degToRad(p.ry)
      const bz = THREE.MathUtils.degToRad(p.rz)
      if (moving) {
        // the hand leans toward the cursor — small angles, heavy easing
        const dir = p.m ? -1 : 1
        const k = Math.min(1, delta * 3.5)
        rotRef.current.rotation.x += (bx + pointer.current.y * 0.14 - rotRef.current.rotation.x) * k
        rotRef.current.rotation.y += (by + pointer.current.x * 0.3 * dir - rotRef.current.rotation.y) * k
        rotRef.current.rotation.z = bz + Math.sin(t * 0.6) * 0.02
      } else {
        rotRef.current.rotation.set(bx, by, bz)
      }
      rotRef.current.scale.setScalar(p.s * f)
    }

    // material: skin tone / reflections / surface (only touch on change)
    const lm = lastMat.current
    if (lm.env !== p.env || lm.tint !== p.tint || lm.rgh !== p.rgh || lm.met !== p.met) {
      for (const m of matsRef.current) {
        m.envMapIntensity = p.env
        m.color.set(p.tint)
        m.roughness = p.rgh
        m.metalness = p.met
      }
      lastMat.current = { env: p.env, tint: p.tint, rgh: p.rgh, met: p.met }
    }
  })

  return (
    // position in world space → mirror → rotation/scale, so the x slider
    // always moves the hand the way the screen shows it
    <group ref={posRef}>
      <group ref={mirrorRef}>
        <group ref={rotRef}>
          <group scale={norm.s} position={norm.p}>
            <primitive object={scene} />
          </group>
        </group>
      </group>
    </group>
  )
}

const ENTRY_DONE = { current: 1 }

export default function HandScene({
  poseRef,
  entryRef = ENTRY_DONE,
  modelIdx = 0,
  logoMode = 0,
  reduceMotion = false,
  ampRef,
}) {
  const url = MODELS[modelIdx] || MODELS[0]
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4], fov: 35 }}
      gl={{ alpha: true, antialias: true }}
    >
      <EnvLight />
      <LightRig poseRef={poseRef} />
      <CodeSphere poseRef={poseRef} reduceMotion={reduceMotion} />
      {/* background life: violet star dust, breathing glow, rare data-streaks */}
      <Sparkles
        count={260}
        scale={[9, 5.5, 4]}
        size={2.4}
        speed={reduceMotion ? 0 : 0.25}
        opacity={0.5}
        color="#c77fff"
        position={[0, 0, -1.5]}
      />
      <Sparkles
        count={70}
        scale={[6, 4, 2]}
        size={5}
        speed={reduceMotion ? 0 : 0.16}
        opacity={0.35}
        color="#ff8ad8"
        position={[0, 0, -0.5]}
      />
      {logoMode > 0 && <LogoGlow poseRef={poseRef} entryRef={entryRef} reduceMotion={reduceMotion} />}
      {logoMode > 0 && <AmpAnchor poseRef={poseRef} ampRef={ampRef} />}
      <Streaks reduceMotion={reduceMotion} />
      <Suspense fallback={null}>
        <Hand key={url} url={url} poseRef={poseRef} entryRef={entryRef} reduceMotion={reduceMotion} />
        {logoMode === 1 && <LogoPlane poseRef={poseRef} entryRef={entryRef} />}
        {logoMode === 2 && <Logo3D poseRef={poseRef} entryRef={entryRef} />}
        <StageTexts poseRef={poseRef} entryRef={entryRef} />
      </Suspense>
    </Canvas>
  )
}

// ---- ?hand pose editor ----
const POSE_FIELDS = [
  { key: 'lw', label: 'LOGÓ méret (rem)', min: 14, max: 44, step: 0.5 },
  { key: 's', label: 'kéz méret', min: 0.2, max: 3, step: 0.01 },
  { key: 'rx', label: 'forgatás X (dőlés)', min: -180, max: 180, step: 1 },
  { key: 'ry', label: 'forgatás Y (perdület)', min: 0, max: 360, step: 1 },
  { key: 'rz', label: 'forgatás Z (síkban)', min: -180, max: 180, step: 1 },
  { key: 'x', label: 'kéz pozíció X', min: -2.5, max: 2.5, step: 0.01 },
  { key: 'y', label: 'kéz pozíció Y', min: -2.5, max: 2.5, step: 0.01 },
]

// the two wordmark lines in space — independent full control
const TEXT1_FIELDS = [
  { key: 't1x', label: 'pozíció X', min: -2, max: 2, step: 0.01 },
  { key: 't1y', label: 'magasság', min: -2.5, max: 0.5, step: 0.01 },
  { key: 't1z', label: 'mélység (előre +)', min: -1.5, max: 2.5, step: 0.01 },
  { key: 't1s', label: 'betűméret', min: 0.05, max: 0.6, step: 0.005 },
  { key: 't1ls', label: 'betűköz', min: 0, max: 0.5, step: 0.005 },
  { key: 't1c', label: 'szín', type: 'color' },
]
const TEXT2_FIELDS = [
  { key: 't2x', label: 'pozíció X', min: -2, max: 2, step: 0.01 },
  { key: 't2y', label: 'magasság', min: -2.5, max: 0.5, step: 0.01 },
  { key: 't2z', label: 'mélység (előre +)', min: -1.5, max: 2.5, step: 0.01 },
  { key: 't2s', label: 'betűméret', min: 0.02, max: 0.3, step: 0.002 },
  { key: 't2ls', label: 'betűköz', min: 0, max: 1.2, step: 0.01 },
  { key: 't2c', label: 'szín', type: 'color' },
]

// the in-space logo (lg 1/2) — depth is the point: pull it into the palm
const LOGO3D_FIELDS = [
  { key: 'lgz', label: 'logó mélység (előre +)', min: -2, max: 2.5, step: 0.01 },
  { key: 'lgs', label: 'logó méret (térben)', min: 0.2, max: 3, step: 0.01 },
  { key: 'lgy', label: 'logó magasság', min: -2.5, max: 2.5, step: 0.01 },
  { key: 'lgrx', label: 'logó forgatás X (dőlés)', min: -180, max: 180, step: 1 },
  { key: 'lgry', label: 'logó forgatás Y (perdület)', min: -180, max: 180, step: 1 },
  { key: 'lgrz', label: 'logó forgatás Z (síkban)', min: -180, max: 180, step: 1 },
  { key: 'larc', label: 'leereszkedés magassága', min: 0, max: 2, step: 0.01 },
  // where the falling & lands inside the logo (offset from the logo center)
  { key: 'ax', label: '& horgony X', min: -0.6, max: 0.6, step: 0.005 },
  { key: 'ay', label: '& horgony Y', min: -0.6, max: 0.6, step: 0.005 },
  { key: 'as', label: '& horgony méret', min: 0.02, max: 0.6, step: 0.005 },
]

const LIGHT_FIELDS = [
  { key: 'bg', label: 'kód-univerzum erő', min: 0, max: 1, step: 0.01 },
  { key: 'bgc', label: 'kód-univerzum szín', type: 'color' },
  { key: 'tint', label: 'bőrtónus', type: 'color' },
  { key: 'rgh', label: 'érdesség (matt ↔ fényes)', min: 0, max: 1.5, step: 0.01 },
  { key: 'met', label: 'fémesség', min: 0, max: 1, step: 0.01 },
  { key: 'amb', label: 'alapfény', min: 0, max: 1.5, step: 0.01 },
  { key: 'env', label: 'környezeti tükröződés', min: 0, max: 3, step: 0.05 },
  { key: 'key', label: 'fő fény erő', min: 0, max: 4, step: 0.05 },
  { key: 'keyc', label: 'fő fény szín', type: 'color' },
  { key: 'gold', label: 'arany fény erő', min: 0, max: 6, step: 0.05 },
  { key: 'goldc', label: 'arany fény szín', type: 'color' },
  { key: 'vio', label: 'lila fény erő', min: 0, max: 4, step: 0.05 },
  { key: 'vioc', label: 'lila fény szín', type: 'color' },
]

function EditorField({ field, value, onChange }) {
  if (field.type === 'color') {
    return (
      <label className="hand-editor__row hand-editor__row--color">
        <span>{field.label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  const shown = typeof value === 'number' ? Math.round(value * 100) / 100 : value
  return (
    <label className="hand-editor__row">
      <span>
        {field.label}: <b>{shown}</b>
      </span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function HandPoseEditor({
  poseRef,
  logoRef,
  onModel,
  onLogoMode,
  dragTarget,
  onDragTarget,
  registerSync,
}) {
  const [pose, setPose] = useState({ ...poseRef.current })
  const [note, setNote] = useState('')
  // editor aid: force the (normally invisible) & landing anchor visible so
  // it can be aligned onto the logo's own & glyph
  const [showAmp, setShowAmp] = useState(false)
  useEffect(() => {
    const el = document.querySelector('.choose__amp')
    if (el) el.style.opacity = showAmp ? '1' : ''
    return () => {
      if (el) el.style.opacity = ''
    }
  }, [showAmp])

  // the stage drag (ChooseSection) mutates poseRef directly; it calls this
  // back so the panel numbers stay in sync
  useEffect(() => {
    registerSync?.(() => setPose({ ...poseRef.current }))
  }, [registerSync, poseRef])

  const update = (key, value) => {
    const next = { ...poseRef.current, [key]: value }
    setPose(next)
    poseRef.current = next
    if (key === 'lw' && logoRef?.current) {
      logoRef.current.style.width = logoWidth(value)
    }
    if (key === 'md') onModel?.(value)
    if (key === 'lg') onLogoMode?.(value)
    setNote('')
  }

  return (
    <div className="hand-editor">
      <p className="hand-editor__title">HAND POSE EDITOR</p>
      <div className="hand-editor__row hand-editor__models">
        <span>húzod:</span>
        <button
          type="button"
          className={dragTarget === 'logo' ? 'is-active' : ''}
          onClick={() => onDragTarget?.('logo')}
        >
          logó
        </button>
        <button
          type="button"
          className={dragTarget === 'hand' ? 'is-active' : ''}
          onClick={() => onDragTarget?.('hand')}
        >
          kéz
        </button>
        <button
          type="button"
          className={dragTarget === 'text1' ? 'is-active' : ''}
          onClick={() => onDragTarget?.('text1')}
        >
          felirat 1
        </button>
        <button
          type="button"
          className={dragTarget === 'text2' ? 'is-active' : ''}
          onClick={() => onDragTarget?.('text2')}
        >
          felirat 2
        </button>
      </div>
      <div className="hand-editor__row hand-editor__models">
        <span>modell:</span>
        <button
          type="button"
          className={pose.md === 0 ? 'is-active' : ''}
          onClick={() => update('md', 0)}
        >
          1 · fotó-kéz
        </button>
        <button
          type="button"
          className={pose.md === 1 ? 'is-active' : ''}
          onClick={() => update('md', 1)}
        >
          2 · szobor-kéz
        </button>
      </div>
      <div className="hand-editor__row hand-editor__models">
        <span>logó:</span>
        <button
          type="button"
          className={pose.lg === 0 ? 'is-active' : ''}
          onClick={() => update('lg', 0)}
        >
          kép
        </button>
        <button
          type="button"
          className={pose.lg === 1 ? 'is-active' : ''}
          onClick={() => update('lg', 1)}
        >
          kép térben
        </button>
        <button
          type="button"
          className={pose.lg === 2 ? 'is-active' : ''}
          onClick={() => update('lg', 2)}
        >
          3D modell
        </button>
      </div>
      {POSE_FIELDS.map((f) => (
        <EditorField key={f.key} field={f} value={pose[f.key]} onChange={(v) => update(f.key, v)} />
      ))}
      <label className="hand-editor__row hand-editor__row--check">
        <input
          type="checkbox"
          checked={pose.m === 1}
          onChange={(e) => update('m', e.target.checked ? 1 : 0)}
        />
        <span>tükrözés</span>
      </label>
      <label className="hand-editor__row hand-editor__row--check">
        <input
          type="checkbox"
          checked={pose.mv === 1}
          onChange={(e) => update('mv', e.target.checked ? 1 : 0)}
        />
        <span>mozgás (kurzorkövetés + lebegés)</span>
      </label>

      <p className="hand-editor__title hand-editor__title--section">BELÉPŐ MOZGÁS</p>
      <label className="hand-editor__row hand-editor__row--check">
        <input
          type="checkbox"
          checked={pose.efon === 1}
          onChange={(e) => update('efon', e.target.checked ? 1 : 0)}
        />
        <span>fázis rögzítése (görgetés helyett a csúszka)</span>
      </label>
      <EditorField
        field={{ key: 'ef', label: 'belépő fázis', min: 0, max: 1, step: 0.01 }}
        value={pose.ef}
        onChange={(v) => update('ef', v)}
      />

      <p className="hand-editor__title hand-editor__title--section">FELIRAT 1 — WEB &amp; STYLE</p>
      {TEXT1_FIELDS.map((f) => (
        <EditorField key={f.key} field={f} value={pose[f.key]} onChange={(v) => update(f.key, v)} />
      ))}

      <p className="hand-editor__title hand-editor__title--section">FELIRAT 2 — STUDIO SOR</p>
      {TEXT2_FIELDS.map((f) => (
        <EditorField key={f.key} field={f} value={pose[f.key]} onChange={(v) => update(f.key, v)} />
      ))}

      {pose.lg > 0 && (
        <>
          <p className="hand-editor__title hand-editor__title--section">TÉRBELI LOGÓ</p>
          <label className="hand-editor__row hand-editor__row--check">
            <input
              type="checkbox"
              checked={showAmp}
              onChange={(e) => setShowAmp(e.target.checked)}
            />
            <span>&amp; horgony mutatása (zöld &amp;)</span>
          </label>
          {LOGO3D_FIELDS.map((f) => (
            <EditorField
              key={f.key}
              field={f}
              value={pose[f.key]}
              onChange={(v) => update(f.key, v)}
            />
          ))}
        </>
      )}

      <p className="hand-editor__title hand-editor__title--section">FÉNYEK / SZÍN</p>
      {LIGHT_FIELDS.map((f) => (
        <EditorField key={f.key} field={f} value={pose[f.key]} onChange={(v) => update(f.key, v)} />
      ))}

      <div className="hand-editor__actions">
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(POSE_KEY, JSON.stringify(poseRef.current))
            setNote('elmentve ✓')
          }}
        >
          Mentés
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify(poseRef.current))
            setNote('vágólapon ✓')
          }}
        >
          Másolás
        </button>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(POSE_KEY)
            const next = { ...DEFAULT_POSE }
            setPose(next)
            poseRef.current = next
            if (logoRef?.current) {
              logoRef.current.style.width = logoWidth(next.lw)
              logoRef.current.style.left = `${next.lx}%`
              logoRef.current.style.top = `${next.ly}%`
            }
            onModel?.(next.md)
            onLogoMode?.(next.lg)
            setNote('alaphelyzet')
          }}
        >
          Reset
        </button>
      </div>
      {note && <p className="hand-editor__note">{note}</p>}
      <p className="hand-editor__hint">
        A színpadon fogd meg és húzd az elemet (fent választod, melyiket).
        Mentés = ebben a böngészőben marad. Másolás után küldd el a JSON-t, és
        beégetem alapértelmezettnek. A ?hand elhagyásával tűnik el a panel.
      </p>
    </div>
  )
}
