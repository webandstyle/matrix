import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

// The earthquake. When the storm fires, this shakes the fixed arrival camera
// IN PLACE — small, mostly-rotational jitter, never a dolly/travel. A travel
// would swing the camera enough to reveal the garden background's flat plane
// edge-on (see status.md's camera-architecture lesson), so the shake stays
// tiny and biased toward roll/pitch. Reads the shared stormRef (startedAt is
// stamped by GardenSky) so the quake stays in sync with the sky + code.
export default function StormShake({ stormRef, cfgRef, reduceMotion }) {
  const { camera } = useThree()
  const base = useRef(null)
  useFrame((state) => {
    // capture the untouched camera pose once — nothing else moves this camera,
    // so this stays a valid "rest" pose to jitter around and restore to
    if (!base.current) {
      base.current = {
        px: camera.position.x, py: camera.position.y, pz: camera.position.z,
        rx: camera.rotation.x, ry: camera.rotation.y, rz: camera.rotation.z,
      }
    }
    const b = base.current
    const storm = stormRef?.current
    const cfg = cfgRef?.current

    let amp = 0
    if (!reduceMotion && storm?.triggered && storm.startedAt != null) {
      const stAge = state.clock.elapsedTime - storm.startedAt
      const dur = Math.max(0.1, cfg?.stDur ?? 1.4)
      const ramp = Math.min(1, stAge / dur)
      const build = ramp * ramp * (3 - 2 * ramp)   // sustained tremor as the storm builds
      const onset = Math.exp(-stAge * 2.5) * 0.8    // an initial lurch on impact
      amp = (build + onset) * (cfg?.stShake ?? 1)
    }

    // inactive (or reduced motion) → hold the exact rest pose (idempotent)
    if (amp <= 0.0001) {
      camera.position.set(b.px, b.py, b.pz)
      camera.rotation.set(b.rx, b.ry, b.rz)
      return
    }

    const t = state.clock.elapsedTime
    // multi-frequency jitter → an organic quake instead of a single sine.
    // Rotation dominates; translation is kept very small to stay plane-safe.
    const rot = 0.014 * amp
    const pos = 0.022 * amp
    const rz = (Math.sin(t * 31.0) + 0.6 * Math.sin(t * 54.3)) * rot
    const rx = (Math.sin(t * 27.0 + 1.3) + 0.5 * Math.sin(t * 61.0)) * rot * 0.7
    const ry = Math.sin(t * 23.0 + 2.1) * rot * 0.4
    const dx = (Math.sin(t * 43.0) + 0.5 * Math.sin(t * 19.0)) * pos
    const dy = Math.sin(t * 37.0 + 0.7) * pos * 0.8
    camera.position.set(b.px + dx, b.py + dy, b.pz)
    camera.rotation.set(b.rx + rx, b.ry + ry, b.rz + rz)
  })
  return null
}
