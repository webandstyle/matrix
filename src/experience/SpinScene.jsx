import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sparkles, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCREENSHOT_URLS, toRoundedCardTexture } from './mockupPhotos'
import SwirlEffect from './SwirlEffect'
import HeadlineBurst from './HeadlineBurst'
import DotGlobe from './DotGlobe'

gsap.registerPlugin(ScrollTrigger)

// uniform square cards — identical projected size everywhere
const CARD_SCALE = 1.42
// grid step in projected screen space; smaller than the projected card size
// (~0.142) so tiles overlap slightly and the wall stays sealed
const GRID_STEP = 0.12

function seededRandom(seed) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// a full-screen wall of equal squares — the whole viewport is tiled edge to
// edge, no window, no gaps: just the endless matrix of websites. The golden
// glow sits BEHIND the wall and is only revealed when the swirl tears the
// matrix open at the end. Positions are laid out in projected screen space
// and unprojected to world; scale is compensated by distance so every card
// has the same projected size regardless of its depth.
function buildLayout() {
  const rand = seededRandom(77)
  const layout = []
  for (let gy = -0.6; gy <= 0.6; gy += GRID_STEP) {
    for (let gx = -1.02; gx <= 1.02; gx += GRID_STEP) {
      const px = gx + (rand() - 0.5) * 0.02
      const py = gy + (rand() - 0.5) * 0.02
      const z = 0.4 - rand() * 1.6
      const dist = 10 - z
      layout.push({
        x: px * dist,
        y: py * dist,
        z,
        px,
        py,
        // elliptical screen-space distance from center — drives the burn hole
        rr: Math.hypot(px, py * 1.69),
        scale: (CARD_SCALE * dist) / 10,
        phase: rand() * Math.PI * 2,
      })
    }
  }
  return layout
}

// pick a texture per card so the same screenshot never lands near itself on
// screen — bans every texture already used within a screen-space radius
function assignTextures(layout, texCount) {
  const rand = seededRandom(99)
  const picks = []
  for (let i = 0; i < layout.length; i += 1) {
    const banned = new Set()
    for (let j = 0; j < i; j += 1) {
      const dx = layout[i].px - layout[j].px
      const dy = (layout[i].py - layout[j].py) * 1.7
      if (dx * dx + dy * dy < 0.16) banned.add(picks[j])
    }
    let pick = Math.floor(rand() * texCount)
    for (let tries = 0; tries < texCount && banned.has(pick); tries += 1) {
      pick = (pick + 1) % texCount
    }
    picks.push(pick)
  }
  return picks
}

const LAYOUT = buildLayout()
const TEXTURE_PICKS = assignTextures(LAYOUT, SCREENSHOT_URLS.length)

function CardRing({ groupRef, cardsRef }) {
  const raw = useTexture(SCREENSHOT_URLS)
  const materials = useMemo(
    () =>
      raw.map(
        (tex) =>
          new THREE.MeshBasicMaterial({
            map: toRoundedCardTexture(tex.image),
            transparent: true,
            toneMapped: false,
          }),
      ),
    [raw],
  )

  // every card gets its own material clone so the burn front can fade and
  // char each tile individually (opacity + color tint per card)
  const cards = useMemo(
    () =>
      LAYOUT.map((c, i) => ({
        mat: materials[TEXTURE_PICKS[i] % materials.length].clone(),
        rr: c.rr,
        phase: c.phase,
      })),
    [materials],
  )

  useEffect(() => {
    cardsRef.current = cards
  }, [cards, cardsRef])

  return (
    <group ref={groupRef}>
      {LAYOUT.map((c, i) => (
        <mesh
          key={i}
          position={[c.x, c.y, c.z]}
          scale={[c.scale, c.scale, 1]}
          material={cards[i].mat}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}

// per-frame choreography: damped scroll progress + velocity drive the swirl
// strength, card fade-out and the reveal; the cards themselves only drift
// gently in place — all rotation comes from the swirl post-effect
function Driver({ groupRef, cardsRef, swirl, progressRef }) {
  const smooth = useRef(0)
  const prevTarget = useRef(0)
  const vel = useRef(0)

  useFrame((state, delta) => {
    const dt = Math.max(delta, 1e-4)
    const tm = state.clock.elapsedTime
    const target = progressRef.current
    smooth.current = THREE.MathUtils.damp(smooth.current, target, 4, dt)
    // p = global journey progress; the wall/burn act owns the first 42%,
    // the rest belongs to the globe bloom, headline burst + code universe
    const p = smooth.current
    const ps = Math.min(p / 0.42, 1)

    const instV = (target - prevTarget.current) / dt
    prevTarget.current = target
    vel.current = THREE.MathUtils.damp(vel.current, instV, 3, dt)

    state.camera.position.z = 10 - ps * 3.2

    if (groupRef.current) {
      // drift is kept tiny so the sealed wall never opens visible seams
      const kids = groupRef.current.children
      for (let i = 0; i < kids.length && i < LAYOUT.length; i += 1) {
        const c = LAYOUT[i]
        kids[i].position.x = c.x + Math.sin(tm * 0.32 + c.phase) * 0.05
        kids[i].position.y = c.y + Math.cos(tm * 0.27 + c.phase * 1.7) * 0.04
        kids[i].rotation.z = Math.sin(tm * 0.2 + c.phase) * 0.018
      }
    }

    // swirl envelope: silent start → winds up through the middle → releases
    // near the end so the arrival into the glow is calm
    const up = THREE.MathUtils.smoothstep(ps, 0.12, 0.72)
    const down = THREE.MathUtils.smoothstep(ps, 0.78, 1.0)
    const velKick = Math.min(Math.abs(vel.current) * 2.5, 1.2)
    // (1 - down) must reach exactly zero — any residual swirl smears the
    // headline that appears on the black universe right after
    swirl.uniforms.get('uStrength').value = (up * 6.2 + velKick) * (1.0 - down)
    swirl.uniforms.get('uAspect').value = state.size.width / state.size.height

    // the matrix burns out from the center: a ragged burn front (radius R in
    // screen space) eats the wall outward — tiles char to ember orange, then
    // near-black, then vanish into the golden light behind
    if (cardsRef.current) {
      const R = THREE.MathUtils.smoothstep(ps, 0.48, 0.92) * 1.65 - 0.06
      const lateFade = 1 - THREE.MathUtils.smoothstep(ps, 0.93, 0.99)
      // roaming matrix glitch: every ~0.8s a different random subset blinks
      const seg = Math.floor(tm * 1.25)
      for (const c of cardsRef.current) {
        // jagged, slowly writhing burn edge instead of a clean circle
        const jag = Math.sin(c.phase * 7.3) * 0.07 + Math.sin(tm * 2.1 + c.phase * 3.7) * 0.02
        const d = c.rr + jag - R

        let opacity = 1
        let char = 0 // 0 = untouched, 1 = fully charred at the front
        if (d < 0) {
          opacity = THREE.MathUtils.clamp(1 + d / 0.09, 0, 1)
          char = 1
        } else if (d < 0.26) {
          char = 1 - d / 0.26
        }

        const h = Math.sin(c.phase * 91.7 + seg * 47.9) * 437.585
        const hh = h - Math.floor(h)
        if (hh < 0.08) {
          opacity *= 0.3 + 0.7 * Math.abs(Math.sin(tm * 22 + c.phase * 9))
        }
        // embers pulse faintly while charring
        if (char > 0) {
          opacity *= 1 - char * 0.12 * (0.5 + 0.5 * Math.sin(tm * 15 + c.phase * 5))
        }
        c.mat.opacity = opacity * lateFade

        // tint: white → ember orange → charred near-black toward the front
        const t1 = Math.min(char / 0.55, 1)
        const t2 = Math.max((char - 0.55) / 0.45, 0)
        c.mat.color.setRGB(
          (1 - t1 + t1 * 1.0) * (1 - t2 * 0.8),
          (1 - t1 + t1 * 0.42) * (1 - t2 * 0.88),
          (1 - t1 + t1 * 0.13) * (1 - t2 * 0.92),
        )
      }
    }

  })

  return null
}

const clamp01 = (v) => Math.min(Math.max(v, 0), 1)

// one scroll drives four phases (fractions of the raw scroll progress):
//   raw 0..heroEnd        → hero journey    (progressRef 0→1)
//   heroEnd..entryEnd     → stage entrance  (entryRef 0→1)
//   entryEnd..rabbitEnd   → rabbit hole     (rabbitRef 0→1)
//   rabbitEnd..1          → arrival+choice  (arrivalRef 0→1)
function ScrollDriver({
  progressRef,
  entryRef,
  rabbitRef,
  arrivalRef,
  heroEnd = 1,
  entryEnd = 1,
  rabbitEnd = 1,
  scrollTargetRef,
}) {
  useEffect(() => {
    const el = scrollTargetRef.current
    if (!el) return undefined

    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        const raw = self.progress
        progressRef.current = heroEnd >= 1 ? raw : clamp01(raw / heroEnd)
        if (entryRef) entryRef.current = clamp01((raw - heroEnd) / (entryEnd - heroEnd))
        if (rabbitRef) rabbitRef.current = clamp01((raw - entryEnd) / (rabbitEnd - entryEnd))
        if (arrivalRef) arrivalRef.current = clamp01((raw - rabbitEnd) / (1 - rabbitEnd))
      },
    })

    return () => st.kill()
  }, [progressRef, entryRef, rabbitRef, arrivalRef, heroEnd, entryEnd, rabbitEnd, scrollTargetRef])

  return null
}

export default function SpinScene({
  scrollTargetRef,
  progressRef,
  entryRef,
  rabbitRef,
  arrivalRef,
  heroEnd = 1,
  entryEnd = 1,
  rabbitEnd = 1,
}) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
  const groupRef = useRef(null)
  const cardsRef = useRef(null)
  const swirl = useMemo(() => new SwirlEffect({ samples: isMobile ? 8 : 16 }), [isMobile])

  return (
    <Canvas
      dpr={[1, isMobile ? 1.3 : 1.5]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 10], fov: 55, near: 0.1, far: 60 }}
    >
      <color attach="background" args={['#0a0907']} />
      {/* far layers sink into darkness — reads as endless depth */}
      <fog attach="fog" args={['#0a0907', 9, 26]} />

      <Suspense fallback={null}>
        <CardRing groupRef={groupRef} cardsRef={cardsRef} />
      </Suspense>
      <DotGlobe progressRef={progressRef} />
      <HeadlineBurst progressRef={progressRef} />
      <Sparkles count={isMobile ? 60 : 120} scale={[14, 14, 6]} size={2.5} speed={0.15} opacity={0.5} color="#e0c27f" />

      <Driver groupRef={groupRef} cardsRef={cardsRef} swirl={swirl} progressRef={progressRef} />
      <ScrollDriver
        progressRef={progressRef}
        entryRef={entryRef}
        rabbitRef={rabbitRef}
        arrivalRef={arrivalRef}
        heroEnd={heroEnd}
        entryEnd={entryEnd}
        rabbitEnd={rabbitEnd}
        scrollTargetRef={scrollTargetRef}
      />

      {isMobile ? (
        <EffectComposer>
          <primitive object={swirl} />
        </EffectComposer>
      ) : (
        <EffectComposer>
          <primitive object={swirl} />
          <Bloom intensity={0.9} luminanceThreshold={0.8} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  )
}
