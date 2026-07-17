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
const PATHS = [
  { cx: -1.6, cy: 2.2, cz: -3.0, ax: 2.6, ay: 0.9, az: 1.7, fx: 0.17, fy: 0.31, fz: 0.13, ph: 0.0, flap: 13, roll: 0.5 },
  { cx: 2.1, cy: 2.6, cz: -3.3, ax: 2.9, ay: 1.1, az: 1.9, fx: 0.14, fy: 0.27, fz: 0.11, ph: 2.3, flap: 15, roll: -0.4 },
]

function Butterfly({ url, path, index, hitRef, reduceMotion }) {
  const { scene } = useGLTF(url)
  const { camera } = useThree()
  const model = useMemo(() => {
    const m = scene.clone(true)
    m.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone()
        o.material.fog = false
        o.material.side = THREE.DoubleSide
      }
    })
    // normalize to ~1-unit max dimension, centred
    const box = new THREE.Box3().setFromObject(m)
    const size = box.getSize(new THREE.Vector3())
    const s = 1 / (Math.max(size.x, size.y, size.z) || 1)
    const c = box.getCenter(new THREE.Vector3())
    m.scale.setScalar(s)
    m.position.set(-c.x * s, -c.y * s, -c.z * s)
    return m
  }, [scene])

  const outer = useRef()
  const flap = useRef()
  const prev = useRef(new THREE.Vector3())
  const tapCooldown = useRef(0)
  const proj = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    if (!outer.current) return
    const t = reduceMotion ? index * 3 : state.clock.elapsedTime
    const p = path
    // position: lazy drifting; z sometimes rises to the sky wall (the tap)
    const climb = Math.pow(Math.max(0, Math.sin(t * p.fz + p.ph)), 3) // 0..1 spikes
    const x = p.cx + Math.sin(t * p.fx + p.ph) * p.ax + Math.sin(t * 0.7) * 0.3
    const y = p.cy + Math.sin(t * p.fy + p.ph * 1.3) * p.ay
    const z = p.cz + p.az * (1 - climb) * 0.4 - climb * (p.cz - SKY_Z) // toward SKY_Z at climb peak
    outer.current.position.set(x, y, z)

    // face the direction of travel, tilt with a little banking roll
    const cur = outer.current.position
    const vel = cur.clone().sub(prev.current)
    prev.current.copy(cur)
    if (vel.lengthSq() > 1e-6) {
      const yaw = Math.atan2(vel.x, vel.z)
      outer.current.rotation.set(-0.9 + vel.y * 2.0, yaw, Math.sin(t * 1.3 + p.ph) * p.roll)
    }

    // wing flap: squash the wingspan quickly (looks like flapping from this
    // tilt) — keep a floor so it never fully closes to an invisible edge
    if (flap.current && !reduceMotion) {
      const f = 0.55 + 0.45 * Math.abs(Math.sin(t * p.flap))
      flap.current.scale.set(f, 1, 1)
    }

    // TAP the sky at the climb peak → write the screen-space hit + a pulse
    tapCooldown.current -= delta
    if (climb > 0.6 && tapCooldown.current <= 0 && hitRef) {
      tapCooldown.current = 0.5 // TEMP dense for testing (final: ~2.5)
      proj.current.copy(cur).project(camera)
      hitRef.current = {
        x: proj.current.x * 0.5 + 0.5,
        y: proj.current.y * 0.5 + 0.5,
        t: state.clock.elapsedTime,
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
