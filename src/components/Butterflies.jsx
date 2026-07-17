import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Two monarch butterflies drift over the sky. Every so often one climbs toward
// the "sky wall" and TAPS it — as if the pretty blue sky were a LED panel — and
// that impact is what makes the system wobble: the tap point + a decaying pulse
// are written to hitRef, which GardenSky reads to fault the sky right there.
// (No morph animation survived the cluster-cleanup, so the wing-flap is a fast
// scale-across-the-wingspan oscillation, convincing from this tilted view.)

const A_URL = '/assets/models/garden/butterfly_a.glb'
const B_URL = '/assets/models/garden/butterfly_b.glb'
const SKY_Z = -4.6 // the "LED wall" depth the butterflies tap

// each butterfly's flight parameters (drift over the upper sky, occasional taps)
// fz drives the climb toward the sky wall — keep it lively (a low fz means a
// tap only every ~48s, which reads as "the glitch never happens")
const PATHS = [
  { cx: -1.6, cy: 1.5, cz: -3.0, tx: -2.2, ty: 2.0, ax: 2.6, ay: 0.7, az: 1.7, fx: 0.17, fy: 0.31, fz: 0.55, ph: 0.0, flap: 13, roll: 0.5 },
  { cx: 2.1, cy: 1.8, cz: -3.3, tx: 2.25, ty: 1.65, ax: 2.9, ay: 0.8, az: 1.9, fx: 0.14, fy: 0.27, fz: 0.45, ph: 4.03, flap: 15, roll: -0.4 },
]

function Butterfly({ url, path, index, hitRef, reduceMotion }) {
  const { scene } = useGLTF(url)
  const { camera } = useThree()
  const { model, materials } = useMemo(() => {
    const m = scene.clone(true)
    const mats = []
    m.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone()
        o.material.fog = false
        o.material.side = THREE.DoubleSide
        mats.push({
          material: o.material,
          color: o.material.color?.clone(),
          emissive: o.material.emissive?.clone(),
          emissiveIntensity: o.material.emissiveIntensity || 0,
        })
      }
    })
    // normalize to ~1-unit max dimension, centred
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const s = 1 / (Math.max(size.x, size.y, size.z) || 1)
    const c = box.getCenter(new THREE.Vector3())
    m.scale.setScalar(s)
    m.position.set(-c.x * s, -c.y * s, -c.z * s)
    return { model: m, materials: mats }
  }, [scene])

  const outer = useRef()
  const flap = useRef()
  const prev = useRef(new THREE.Vector3())
  const proj = useRef(new THREE.Vector3())
  const lastPeak = useRef(null)
  const lastImpact = useRef(-100)
  const glitchGreen = useMemo(() => new THREE.Color('#55ff88'), [])

  useFrame((state) => {
    if (!outer.current) return
    const t = reduceMotion ? index * 3 : state.clock.elapsedTime
    const p = path
    const phase = t * p.fz + p.ph
    const peakIndex = Math.round((phase - Math.PI * 0.5) / (Math.PI * 2))
    const peakPhase = Math.PI * 0.5 + peakIndex * Math.PI * 2
    const fromImpact = phase - peakPhase
    const approach = Math.pow(Math.max(0, Math.cos(fromImpact)), 5)

    const driftX = (at) => p.cx + Math.sin(at * p.fx + p.ph) * p.ax + Math.sin(at * 0.7) * 0.3
    const driftY = (at) => p.cy + Math.sin(at * p.fy + p.ph * 1.3) * p.ay
    // Lock onto one point while approaching the wall: lateral wandering fades
    // out, then a short camera-ward kick makes the collision read as a bounce.
    const x = THREE.MathUtils.lerp(driftX(t), p.tx, approach * 0.9)
    const y = THREE.MathUtils.lerp(driftY(t), p.ty, approach * 0.9)
    const baseZ = p.cz + p.az * 0.35
    const rebound = fromImpact > 0 && fromImpact < 0.75
      ? Math.sin((fromImpact / 0.75) * Math.PI) * 0.7
      : 0
    const z = THREE.MathUtils.lerp(baseZ, SKY_Z, approach) + rebound

    const impactAge = t - lastImpact.current
    const impactFade = impactAge >= 0 && impactAge < 0.65 ? 1 - impactAge / 0.65 : 0
    const digitalFlicker = impactFade
      * (0.55 + 0.45 * Math.abs(Math.sin(t * 68 + index * 1.7)))
    outer.current.position.set(x, y, z)
    if (digitalFlicker > 0) {
      outer.current.position.x += Math.sin(t * 91 + index) * 0.045 * digitalFlicker
      outer.current.position.y += Math.sin(t * 73 + index * 2) * 0.03 * digitalFlicker
    }

    // Face the direction of travel. Near contact the banking collapses and the
    // butterfly squares up to the flat wall before the impact jolt twists it.
    const cur = outer.current.position
    const vel = cur.clone().sub(prev.current)
    prev.current.copy(cur)
    if (vel.lengthSq() > 1e-6) {
      const yaw = Math.atan2(vel.x, vel.z)
      const cruiseRoll = Math.sin(t * 1.3 + p.ph) * p.roll
      outer.current.rotation.set(
        -0.9 + vel.y * 2.0 + digitalFlicker * 0.22,
        THREE.MathUtils.lerp(yaw, 0, approach * 0.78),
        cruiseRoll * (1 - approach * 0.82) + digitalFlicker * 0.32,
      )
    }
    const bodyScale = 0.85
    outer.current.scale.set(
      bodyScale * (1 + digitalFlicker * 0.12),
      bodyScale * (1 - digitalFlicker * 0.1),
      bodyScale,
    )

    // wing flap: squash the wingspan quickly (looks like flapping from this
    // tilt). The wings spread before contact, then corrupt for a few frames.
    if (flap.current) {
      const natural = reduceMotion ? 0.82 : 0.55 + 0.45 * Math.abs(Math.sin(t * p.flap))
      const spread = THREE.MathUtils.lerp(natural, 1, approach * 0.88)
      flap.current.scale.set(spread * (1 + digitalFlicker * 0.16), 1, 1)
    }

    // One collision event at the exact turning point. GardenSky receives the
    // same projected contact point that the butterfly visibly rebounds from.
    if (!reduceMotion && Math.abs(fromImpact) < 0.1 && lastPeak.current !== peakIndex && hitRef) {
      lastPeak.current = peakIndex
      lastImpact.current = state.clock.elapsedTime
      proj.current.copy(cur).project(camera)
      hitRef.current = {
        x: proj.current.x * 0.5 + 0.5,
        y: proj.current.y * 0.5 + 0.5,
        t: state.clock.elapsedTime,
        seed: index + 1,
      }
    }

    // The fake-nature asset itself briefly leaks the same Matrix green as the
    // wall, tying the butterfly and the code fault into one causal event.
    for (const entry of materials) {
      const { material, color, emissive, emissiveIntensity } = entry
      if (material.color && color) material.color.copy(color).lerp(glitchGreen, digitalFlicker * 0.48)
      if (material.emissive && emissive) {
        material.emissive.copy(emissive).lerp(glitchGreen, digitalFlicker)
        material.emissiveIntensity = emissiveIntensity + digitalFlicker * 2.2
      }
    }
  })

  return (
    <group ref={outer} scale={0.85}>
      <group ref={flap}>
        <primitive object={model} />
      </group>
    </group>
  )
}

export default function Butterflies({ hitRef, reduceMotion }) {
  return (
    <>
      <Butterfly url={A_URL} path={PATHS[0]} index={0} hitRef={hitRef} reduceMotion={reduceMotion} />
      <Butterfly url={B_URL} path={PATHS[1]} index={1} hitRef={hitRef} reduceMotion={reduceMotion} />
    </>
  )
}

useGLTF.preload(A_URL)
useGLTF.preload(B_URL)
