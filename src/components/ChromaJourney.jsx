import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, ScreenQuad } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import * as THREE from 'three'

// The GLB's surfaces (mat0 "dots", mat2 "gradient") are METALLIC PBR — they
// render black without something to reflect. A self-contained PMREM environment
// (three's RoomEnvironment, no network) gives them reflections so their baked
// rainbow textures actually show, exactly as they do on Sketchfab. This is the
// model's own material intent, not an invented look.
// Restore the ORIGINAL material intent that the Sketchfab GLB export lost. The
// source .blend (inspected 2026-07-25) has NO lights: only the RIBBON materials
// EMIT (rainbow), non-metallic, while the "dots" surface does NOT emit (it's the
// dark wall), all lit by a dark 0.05 world + Eevee Bloom. The GLB export wrongly
// made the surfaces METALLIC (0.5–0.7), which needed reflections and washed out.
// So: kill metalness (the export artifact) and keep the emissive maps the ribbons
// already have — the dots material stays non-emissive = the dark wall.
export function enhanceChromaMaterials(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if ('metalness' in m) m.metalness = 0
      if (m.emissiveMap && m.emissive) m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 1, 1)
      m.toneMapped = true
      m.needsUpdate = true
    }
  })
}

export function ChromaEnv({ intensity = 0.3, exposure = 0.9 }) {
  const { scene, gl } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => { scene.environment = null; env.dispose(); pmrem.dispose() }
  }, [scene, gl])
  // metals reflect the env — a BRIGHT env washes them out; keep it dim so the
  // surface stays dark like the Sketchfab reference and only the emissive neon
  // ribbons pop. Exposure trims the overall over-brightness.
  useEffect(() => { scene.environmentIntensity = intensity }, [scene, intensity])
  useEffect(() => { gl.toneMappingExposure = exposure }, [gl, exposure])
  return null
}

// Part 3 of the rabbit hole (2026-07-24): the CHROMATIC JOURNEY — replaces the
// old procedural rollercoaster TubeRide. The camera rides INSIDE the tube of a
// chromatic torus/donut (Sketchfab "Chromatic Journey", Tycho Magnetic Anomaly,
// CC-BY-4.0), around the ring, rolling on its travel axis so the rainbow coils
// rush past as a vortex. The DONUT itself stays still — only the camera moves.
// Driven by rabbitRef over the same window the tube used, and fades to black at
// the end to hand off to the arrival (Part 4), exactly like the tube's dark exit.
//
// Values baked live in the ?chroma lab (ChromaLab.jsx), which still opens on
// this same look for further tuning.
//
// The GLB was optimized 2026-07-25 (gltf-transform: weld + 0.6 simplify + webp
// textures + KHR_mesh_quantization): 18.4MB/308k verts → 6.7MB/~185k verts,
// look verified unchanged in the ?chroma interior view. Quantization is native
// to three's GLTFLoader — no extra decoder needed.
const GLB = '/assets/models/chromatic_journey.glb'

// where in the rabbit phase the journey owns the camera (matches the tube's
// window so RabbitHole's portal→journey crossfade timing is unchanged)
const RIDE_IN = 0.16
const RIDE_OUT = 0.92

// baked from the ?chroma "Belső utazás" tuning
const BAKED = {
  mrx: 0, mry: 1.5708, mrz: 0, mscale: 6, // donut alignment / size
  rideR: 0.39,     // where in the tube cross-section the camera sits
  rideLoops: 1,    // times around the ring across the whole ride
  ridePhase: 0,    // starting angle
  rollTurns: 2.1,  // camera spins on its travel axis (vortex); sign = direction
}

function smoothstep(t, a, b) {
  const x = Math.min(Math.max((t - a) / (b - a), 0), 1)
  return x * x * (3 - 2 * x)
}

// the donut, centred at the origin, held STILL at frame 0 (the baked sway would
// make it drift — we only want the camera to move)
function ChromaModel() {
  const { scene, animations } = useGLTF(GLB)
  const center = useMemo(() => {
    enhanceChromaMaterials(scene)
    const c = new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3())
    return [c.x, c.y, c.z]
  }, [scene])
  useEffect(() => {
    if (!animations[0]) return undefined
    const mixer = new THREE.AnimationMixer(scene)
    mixer.clipAction(animations[0]).play()
    mixer.setTime(0) // pin to the rest pose and never advance
    return () => mixer.stopAllAction()
  }, [scene, animations])
  return (
    <group rotation={[BAKED.mrx, BAKED.mry, BAKED.mrz]} scale={BAKED.mscale}>
      <group position={[-center[0], -center[1], -center[2]]}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

// rides the donut's tube centreline (a circle in the model's YZ plane, symmetry
// axis = X) as rabbitRef sweeps the ride window, looking along the tube, rolling
// on the travel axis. Everything is transformed by the SAME wrapper rot+scale
// the model uses, so the path stays inside the tube.
function RideCamera({ rabbitRef }) {
  const q = useMemo(() => new THREE.Quaternion(), [])
  const qRoll = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(BAKED.mrx, BAKED.mry, BAKED.mrz), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const tan = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    q.setFromEuler(e)
    const t = Math.min(Math.max((rabbitRef.current - RIDE_IN) / (RIDE_OUT - RIDE_IN), 0), 1)
    const theta = t * Math.PI * 2 * BAKED.rideLoops + BAKED.ridePhase
    const c = Math.cos(theta), s = Math.sin(theta)
    pos.set(0, BAKED.rideR * c, BAKED.rideR * s).multiplyScalar(BAKED.mscale).applyQuaternion(q)
    tan.set(0, -s, c).applyQuaternion(q).normalize()
    up.set(1, 0, 0).applyQuaternion(q)
    if (BAKED.rollTurns) {
      qRoll.setFromAxisAngle(tan, t * BAKED.rollTurns * Math.PI * 2)
      up.applyQuaternion(qRoll)
    }
    state.camera.up.copy(up)
    state.camera.position.copy(pos)
    state.camera.lookAt(look.copy(pos).add(tan))
  })
  return null
}

// black wash over the last stretch of the ride → the dark handoff the arrival
// scene fades up from (same role as the tube's dark exit mouth)
function FadeOut({ rabbitRef }) {
  const matRef = useRef()
  useFrame(() => {
    if (matRef.current) matRef.current.opacity = smoothstep(rabbitRef.current, 0.86, 1.0)
  })
  return (
    <ScreenQuad renderOrder={10}>
      <meshBasicMaterial ref={matRef} color="#05030a" transparent opacity={0} depthTest={false} depthWrite={false} />
    </ScreenQuad>
  )
}

export default function ChromaJourney({ rabbitRef }) {
  return (
    <Canvas
      className="rabbit__canvas"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 75, near: 0.01, far: 1000, position: [0, 0, 6] }}
    >
      {/* opaque dark backdrop: fully hides the stage while we're inside */}
      <color attach="background" args={['#05030a']} />
      <ambientLight intensity={0.12} />
      <ChromaEnv intensity={0.2} exposure={0.92} />
      <Suspense fallback={null}>
        <ChromaModel />
      </Suspense>
      <RideCamera rabbitRef={rabbitRef} />
      <FadeOut rabbitRef={rabbitRef} />
      {/* neon glow (bloom) + the original's VHS-style RGB split
          (chromatic aberration) that fringes the neon edges red/blue */}
      <EffectComposer>
        <Bloom intensity={0.3} luminanceThreshold={0.56} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
        <ChromaticAberration offset={[0.0058, 0.0058]} radialModulation={false} modulationOffset={0} />
      </EffectComposer>
    </Canvas>
  )
}

useGLTF.preload(GLB)
