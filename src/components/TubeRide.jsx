import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Part 3 of the rabbit hole: the ROLLERCOASTER tube ride. Reuses the early
// path-based journey mechanism (a CatmullRom curve + Frenet-frame camera rig
// riding it) but the tube walls are a psychedelic inner shader instead of the
// old mockup cards. Driven by rabbitRef: the camera travels the curve over the
// tube sub-phase, and the ride ends on a dark exit CENTRED ahead — that's the
// mouth we fly out through into the arrival (Part 4).

const TUBE_LEN = 120 // world units along the axis (longer → depth/endlessness reads)
const TURNS = 0.85 // a gentle S-bank in the middle, NOT a full spiral loop (a loop
// lets you see the tube curl back on itself → the "snail-shell/horn" at the mouth)
const COIL_R = 1.8 // GENTLE off-axis sway — keeps the camera deep inside so the
// vanishing point stays ahead/centre (a big swing made it look like we were
// outside the tube, with the dark mouth thrown into a corner)
const TUBE_RADIUS = 4.4 // roomy wall radius so the camera sits well inside the pipe
const FRAMES = 500 // Frenet-frame samples

// where in the rabbit phase the tube ride owns the camera
export const TUBE_IN = 0.16
export const TUBE_OUT = 0.92
// the camera stops once it reaches the straight axial run, so there is always a
// long straight length of tube AHEAD receding to a dark circular mouth dead
// centre — that's the exit we fly out through into the arrival
const CAM_END = 0.8

function smoothstep(t, a, b) {
  const x = Math.min(Math.max((t - a) / (b - a), 0), 1)
  return x * x * (3 - 2 * x)
}

// the centreline has THREE zones: a STRAIGHT on-axis ENTRY (we plunge in from
// the portal down a clean deep tunnel — no coil visible = no "snail-shell/horn"
// at the mouth, and the far end is lost in fog so it feels endless), a banking
// rollercoaster MIDDLE (radius humps up then back down), and a STRAIGHT on-axis
// EXIT (the dark circular mouth dead centre). The radius envelope reaches 0 —
// with zero slope — at both ends, so both the entry and exit are clean straight
// pipe with no kink.
function buildCurve() {
  const pts = []
  const N = 400
  const angMax = TURNS * Math.PI * 2
  for (let i = 0; i <= N; i += 1) {
    const t = i / N
    const up = smoothstep(t, 0.22, 0.45) // radius ramps in after the straight entry
    const down = 1 - smoothstep(t, 0.58, 0.8) // ramps back to the straight exit
    const env = up * down // a smooth hump, 0 at both ends
    const r = COIL_R * env
    const ang = t * angMax
    const rise = Math.sin(t * Math.PI * 3.0) * 1.4 * env // rollercoaster undulation
    pts.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r + rise, -t * TUBE_LEN))
  }
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4)
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vView;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.z;                 // view-space depth → distance ahead
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uProgress;
  varying vec2 vUv;
  varying float vView;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.,0.)), c = hash(i + vec2(0.,1.)), d = hash(i + vec2(1.,1.));
    vec2 u = f * f * (3. - 2. * f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.02; a*=.5; } return s; }
  vec3 pal(float t){ return .5 + .5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }

  void main(){
    float around = vUv.y;          // 0..1 around the tube
    float along  = vUv.x;          // 0..1 along the length
    float flow = uTime * 0.35 + uProgress * 4.5;   // forward flow (speed)

    // base psychedelic hue, cycling down the length + slowly over time
    float h = fract(along * 0.9 + uTime * 0.03 + 0.1 * sin(around * 6.2831 * 2.0));
    vec3 base = pal(h);

    // LONGITUDINAL GROOVES: stripes running down the tube toward the vanishing
    // point. Because they all converge to the centre, they are the strongest
    // "I'm inside a pipe, moving forward" perspective cue.
    float grooves = pow(0.5 + 0.5 * sin(around * 6.2831 * 14.0), 1.4);

    // RINGS sweeping toward the camera → unmistakable forward motion
    float rings = pow(0.5 + 0.5 * sin(along * 6.2831 * 20.0 - flow * 6.0), 2.5);

    // organic variation (seam-safe: around fed through cos/sin), also flowing
    vec2 ringc = vec2(cos(around * 6.2831), sin(around * 6.2831)) * 2.5;
    float bands = fbm(ringc + vec2(along * 8.0 - flow * 2.0, along * 6.0));

    vec3 col = base * (0.35 + 0.65 * bands);
    col *= (0.55 + 0.6 * grooves);                       // grooves shade the walls
    col += 0.35 * vec3(1.0, 0.95, 0.85) * rings * grooves; // bright grid rushing past

    // the far end of the straight axial run fades to black → a dark circular
    // mouth dead ahead = the exit we fly out through
    col *= (1.0 - 0.95 * smoothstep(0.86, 1.0, along));
    // distance darkening deepens the receding vanishing point toward black
    float fogD = smoothstep(5.0, 40.0, vView);
    col *= (1.0 - 0.9 * fogD);

    gl_FragColor = vec4(col, 1.0);
  }
`

function Ride({ rabbitRef, reduceMotion }) {
  const { curve, frames, geom } = useMemo(() => {
    const c = buildCurve()
    // three's computeFrenetFrames uses stable parallel transport (no twist flips)
    const f = c.computeFrenetFrames(FRAMES, false)
    const g = new THREE.TubeGeometry(c, 420, TUBE_RADIUS, 26, false)
    return { curve: c, frames: f, geom: g }
  }, [])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uProgress: { value: 0 } }), [])
  const matRef = useRef()
  const pos = useRef(new THREE.Vector3())
  const ahead = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const upv = useRef(new THREE.Vector3())
  // the drained tip is exactly on-axis (x,y→0): looking here at the end pulls
  // the dark exit mouth to dead centre of the screen
  const tip = useMemo(() => curve.getPointAt(0.999), [curve])
  const WORLD_UP = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useFrame((state) => {
    const rr = rabbitRef.current
    // ride 0→CAM_END of the curve (never the drained tip), holding at the end
    const ride = Math.min(Math.max((rr - TUBE_IN) / (TUBE_OUT - TUBE_IN), 0), 1)
    const p = ride * CAM_END
    curve.getPointAt(p, pos.current)
    state.camera.position.copy(pos.current)
    // Look at a point FURTHER DOWN the curve (not the instantaneous tangent):
    // the rider sees where the track is heading, so the deep tunnel stays
    // roughly centred and you watch the tube bend ahead of you — instead of the
    // tangent throwing the vanishing point off into a corner. Near the very end
    // we settle onto the on-axis tip so the dark exit lands dead centre.
    const idx = Math.min(Math.max(Math.round(p * FRAMES), 0), FRAMES)
    curve.getPointAt(Math.min(p + 0.13, 0.999), ahead.current)
    const c = smoothstep(ride, 0.72, 1.0) // 0 = free ride, 1 = look at the exit
    target.current.copy(ahead.current).lerp(tip, c)
    // damp the roll: keep the horizon mostly world-up (a fully parallel-
    // transported normal tumbles the grooves and adds to the disorientation),
    // easing to pure world-up by the exit
    upv.current.copy(frames.normals[idx]).lerp(WORLD_UP, 0.6 + 0.4 * c)
    state.camera.up.copy(upv.current)
    state.camera.lookAt(target.current)
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = reduceMotion ? 0 : state.clock.elapsedTime
      matRef.current.uniforms.uProgress.value = p
    }
  })

  return (
    <>
      {/* opaque dark backdrop: fully hides the stage while we're inside the
          tube, and the tiny hole at the drained tip reads as a black exit */}
      <color attach="background" args={['#05030a']} />
      <mesh geometry={geom}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={VERT}
          fragmentShader={FRAG}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

export default function TubeRide({ rabbitRef, reduceMotion }) {
  return (
    <Canvas
      className="rabbit__canvas"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 72, near: 0.1, far: TUBE_LEN + 40, position: [0, 0, 0] }}
    >
      <Ride rabbitRef={rabbitRef} reduceMotion={reduceMotion} />
    </Canvas>
  )
}
