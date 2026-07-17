import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sparkles, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCREENSHOT_URLS, toRoundedCardTexture } from './mockupPhotos'

gsap.registerPlugin(ScrollTrigger)

const TUNNEL_LENGTH = 140
const SPIRAL_TURNS = 4
const SPIRAL_RADIUS = 6
const TUBE_RADIUS = 3.6
const FRAME_SAMPLES = 600

const RINGS_DESKTOP = 46
const CARDS_PER_RING_DESKTOP = 8
const RINGS_MOBILE = 26
const CARDS_PER_RING_MOBILE = 6

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_FALLBACK_UP = new THREE.Vector3(0, 0, 1)

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

// the tube's centerline: a coiling spiral that tightens to the axis right at
// the very end, so the tube "drains" into the finale glow
function buildTunnelCurve() {
  const points = []
  const samples = 400
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const angle = t * SPIRAL_TURNS * Math.PI * 2
    const radiusEase = 1 - THREE.MathUtils.smoothstep(t, 0.86, 1)
    const r = SPIRAL_RADIUS * radiusEase
    points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, -t * TUNNEL_LENGTH))
  }
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2)
}

function useTunnel() {
  return useMemo(() => {
    const curve = buildTunnelCurve()
    // three's computeFrenetFrames uses a stable parallel-transport method (not
    // naive Frenet-Serret), so the frame doesn't flip/twist on straight bits
    const frames = curve.computeFrenetFrames(FRAME_SAMPLES, false)
    return { curve, frames }
  }, [])
}

function frameAt(frames, t) {
  const idx = THREE.MathUtils.clamp(Math.round(t * FRAME_SAMPLES), 0, FRAME_SAMPLES)
  return { normal: frames.normals[idx], binormal: frames.binormals[idx], tangent: frames.tangents[idx] }
}

function useTubeCards(curve, frames, ringCount, cardsPerRing, rawTextures) {
  return useMemo(() => {
    const textures = rawTextures.map((tex) => toRoundedCardTexture(tex.image))
    const materials = textures.map(
      (tex) => new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    )
    const ringCircumference = 2 * Math.PI * TUBE_RADIUS
    const cardWidth = (ringCircumference / cardsPerRing) * 1.28
    const ringStepT = 1 / ringCount
    const cardHeight = TUNNEL_LENGTH * ringStepT * 1.45
    const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight)

    const rand = seededRandom(2024)
    const cards = []
    let matIndex = 0

    for (let ring = 0; ring < ringCount; ring += 1) {
      const t = (ring + 0.5) / ringCount
      const center = curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1))
      const { normal, binormal } = frameAt(frames, t)
      const stagger = (ring % 2) * (Math.PI / cardsPerRing)

      for (let j = 0; j < cardsPerRing; j += 1) {
        const angle = (j / cardsPerRing) * Math.PI * 2 + stagger + (rand() - 0.5) * 0.12
        const radius = TUBE_RADIUS * (0.94 + rand() * 0.12)
        const offset = normal.clone().multiplyScalar(Math.cos(angle) * radius)
          .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius))
        const position = center.clone().add(offset)

        const outward = offset.clone().normalize()
        // keep card text world-upright instead of wrapping "up" around the
        // tube's local frame — a tangent-based up flips readable screenshots
        // upside down on the bottom half of every ring (fine for abstract
        // color blocks, not for real text)
        const upHint = Math.abs(outward.dot(WORLD_UP)) > 0.9 ? WORLD_FALLBACK_UP : WORLD_UP
        const m = new THREE.Matrix4()
        // lookAt points local -Z at the target, so the target must be OUTWARD
        // (away from the tube axis) for the plane's +Z front face — where the
        // texture actually is — to end up facing inward toward the camera
        m.lookAt(position, position.clone().add(outward), upHint)
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(m)

        cards.push({ position, quaternion, material: materials[matIndex % materials.length] })
        matIndex += 1
      }
    }

    return { cards, geometry }
  }, [curve, frames, ringCount, cardsPerRing, rawTextures])
}

function TubeCards({ curve, frames, ringCount, cardsPerRing }) {
  const rawTextures = useTexture(SCREENSHOT_URLS)
  const { cards, geometry } = useTubeCards(curve, frames, ringCount, cardsPerRing, rawTextures)
  return cards.map((c, i) => (
    <mesh key={i} position={c.position} quaternion={c.quaternion} geometry={geometry} material={c.material} />
  ))
}

function glowTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,244,214,1)')
  g.addColorStop(0.35, 'rgba(255,214,140,0.9)')
  g.addColorStop(1, 'rgba(255,214,140,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

function Glow({ progressRef, endPoint }) {
  const matRef = useRef()
  const texture = useMemo(() => glowTexture(), [])

  useFrame(() => {
    if (!matRef.current) return
    const p = progressRef.current
    matRef.current.opacity = THREE.MathUtils.smoothstep(p, 0.7, 1)
  })

  return (
    <sprite position={endPoint} scale={[20, 20, 1]}>
      <spriteMaterial
        ref={matRef}
        map={texture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0}
        toneMapped={false}
      />
    </sprite>
  )
}

function CameraRig({ curve, frames, progressRef }) {
  const posVec = useRef(new THREE.Vector3())
  const aheadVec = useRef(new THREE.Vector3())

  useFrame((state) => {
    const p = THREE.MathUtils.clamp(progressRef.current, 0, 1)
    curve.getPointAt(p, posVec.current)
    state.camera.position.copy(posVec.current)

    // use the frame's own tangent as the look-ahead direction (not a second
    // curve sample) — sampling p+epsilon degenerates to the same point right
    // at t=1 once clamped, which corrupts the view matrix into a black frame
    const { normal, tangent } = frameAt(frames, p)
    state.camera.up.copy(normal)
    aheadVec.current.copy(posVec.current).add(tangent)
    state.camera.lookAt(aheadVec.current)
  })

  return null
}

function ScrollDriver({ progressRef, scrollTargetRef }) {
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const el = scrollTargetRef.current
    if (!el) return undefined

    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        progressRef.current = self.progress
        invalidate()
      },
    })
    invalidate()

    return () => st.kill()
  }, [invalidate, progressRef, scrollTargetRef])

  return null
}

function Scene({ scrollTargetRef, isMobile }) {
  const progressRef = useRef(0)
  const { curve, frames } = useTunnel()
  const endPoint = useMemo(() => {
    // parked a bit past the curve's literal end so it never coincides with
    // the camera's final resting position (see CameraRig degenerate-lookAt note)
    const p = curve.getPointAt(1)
    const tangent = curve.getTangentAt(1)
    return p.clone().add(tangent.multiplyScalar(8))
  }, [curve])
  const ringCount = isMobile ? RINGS_MOBILE : RINGS_DESKTOP
  const cardsPerRing = isMobile ? CARDS_PER_RING_MOBILE : CARDS_PER_RING_DESKTOP

  return (
    <>
      <color attach="background" args={['#0a0907']} />
      <fog attach="fog" args={['#0a0907', 8, TUNNEL_LENGTH * 0.82]} />

      <Suspense fallback={null}>
        <TubeCards curve={curve} frames={frames} ringCount={ringCount} cardsPerRing={cardsPerRing} />
      </Suspense>
      <Sparkles
        count={isMobile ? 60 : 140}
        scale={[SPIRAL_RADIUS * 2.5, SPIRAL_RADIUS * 2.5, TUNNEL_LENGTH]}
        size={2}
        speed={0.15}
        opacity={0.5}
        color="#e0c27f"
      />
      <Glow progressRef={progressRef} endPoint={endPoint} />
      <CameraRig curve={curve} frames={frames} progressRef={progressRef} />
      <ScrollDriver progressRef={progressRef} scrollTargetRef={scrollTargetRef} />

      {!isMobile && (
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.82} luminanceSmoothing={0.35} mipmapBlur />
        </EffectComposer>
      )}
    </>
  )
}

export default function TunnelScene({ scrollTargetRef }) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, isMobile ? 1.3 : 1.5]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 0], fov: 60, near: 0.1, far: TUNNEL_LENGTH + 40 }}
    >
      <Scene scrollTargetRef={scrollTargetRef} isMobile={isMobile} />
    </Canvas>
  )
}
