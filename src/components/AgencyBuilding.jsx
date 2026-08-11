import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Text } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useT } from '../i18n/LanguageContext'
import { AGENCY, BRAND } from '../data/content'
import './AgencyBuilding.css'

// THE BLUE PILL, take 2 (2026-07-26) — a cinematic, scroll-driven journey around
// a Brooklyn building against a warm "vanilla sky" (the 20th-Century-Fox dusk).
// The whole studio story is mapped onto the building: land on the ROOF (masthead)
// → left side / day / services per floor → right side / night / process in lit
// windows → dusk / neon case-study neighbours → the street phone booth (contact).
// Built in acts; this file is ACT 1 (the landing) — the rest lands incrementally.
// Opens on ?building while it's under construction (the live #agency is untouched).

const BUILDING = '/assets/models/building.glb'
const BUILDING_H = 11 // normalized world height of the building
const CITY_MODEL = '/assets/models/futuristic_city.glb'
const ROOF_HALF = 3.5 // approx half-footprint of the roof (tune vs the model)
const FONT = '/assets/fonts/Metropolis-Medium.otf'
// roof masthead: display headline face + a softer body face (user-picked)
const ROOF_HEAD_FONT = '/assets/fonts/Jogrunge.otf'
const ROOF_BODY_FONT = '/assets/fonts/Penna.otf'

// ---- Vanilla sky (warm golden dusk, soft clouds, low sun) ------------------
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform float uTime;
  uniform float uNight;   // 0 = golden day, 1 = night (used by later acts)
  uniform vec3 uSunDir;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p),f=fract(p); float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
  float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+3.1; a*=.5;} return s; }

  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);   // 0 nadir → 1 zenith

    // dusk gradient — RICH, not vanilla: hot orange horizon → saturated
    // violet-purple mid field → deep indigo-purple zenith
    vec3 gHor = vec3(1.02, 0.48, 0.20);
    vec3 gMid = vec3(0.40, 0.22, 0.60);
    vec3 gZen = vec3(0.06, 0.04, 0.20);
    vec3 day = mix(gHor, gMid, smoothstep(0.20, 0.48, h));
    day = mix(day, gZen, smoothstep(0.48, 0.80, h));
    // a magenta breath where the orange meets the violet
    day += vec3(0.22, 0.02, 0.12) * smoothstep(0.16, 0.30, h) * (1.0 - smoothstep(0.34, 0.5, h));
    // below the horizon the void darkens to a deep plum, so the sunlit
    // cloud-sea tops read against it during the helicopter descent
    day = mix(vec3(0.36, 0.20, 0.32), day, smoothstep(0.10, 0.32, h));

    // NIGHT gradient: deep blue → near-black zenith
    vec3 nHor = vec3(0.045, 0.055, 0.14);
    vec3 nZen = vec3(0.012, 0.016, 0.05);
    vec3 night = mix(nHor, nZen, smoothstep(0.35, 0.9, h));
    night = mix(vec3(0.028, 0.032, 0.075), night, smoothstep(0.10, 0.32, h));

    vec3 sky = mix(day, night, uNight);

    // sun: a broad warm glow low behind the clouds (no hard disc — the
    // reference's light is a diffused hot spot buried in the cloud bank)
    float sun = max(dot(d, normalize(uSunDir)), 0.0);
    vec3 sunCol = mix(vec3(1.0, 0.74, 0.38), vec3(0.7, 0.75, 1.0), uNight);
    sky += sunCol * pow(sun, 12.0) * (1.0 - 0.7 * uNight) * 0.22;
    sky += sunCol * pow(sun, 140.0) * 0.3 * (1.0 - uNight);

    // distant cloud bank hugging the low sky (salmon/orange, lit golden toward
    // the sun) — thinner than before: the 3D CloudField billboards carry the
    // volume now, the dome only paints the far backdrop
    vec2 cuv = d.xz / max(abs(d.y) + 0.3, 0.3) * 1.6 + vec2(uTime * 0.005, 0.0);
    float cl = fbm(cuv);
    float band = smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.40, 0.58, h));
    float cover = smoothstep(0.40, 0.80, cl);
    vec3 salmon = vec3(1.00, 0.52, 0.30);
    vec3 goldLit = vec3(1.00, 0.72, 0.36);
    vec3 cloudDay = mix(salmon, goldLit, pow(sun, 2.0));
    // shaded cloud bellies dip toward deep violet
    cloudDay = mix(cloudDay, vec3(0.40, 0.20, 0.44), smoothstep(0.75, 0.95, cl) * 0.6);
    vec3 cloudCol = mix(cloudDay, vec3(0.10, 0.12, 0.22), uNight);
    sky = mix(sky, cloudCol, cover * band * (0.92 - 0.45 * uNight));

    // faint dark-violet wisps drifting across the upper sky
    float cl2 = fbm(cuv * 0.55 + 7.0);
    float upper = smoothstep(0.52, 0.72, h) * (1.0 - smoothstep(0.88, 1.0, h));
    sky = mix(sky, vec3(0.20, 0.15, 0.38), smoothstep(0.55, 0.85, cl2) * upper * 0.35 * (1.0 - uNight));

    // stars — small round pricks (gnomonic projection so the cells don't
    // stretch); a few already show at dusk (as in the reference), the full
    // field arrives with the night
    vec2 su = d.xz / max(d.y, 0.15) * 24.0;
    vec2 si = floor(su);
    vec2 sf = fract(su) - 0.5;
    float star = step(0.93, hash(si)) * smoothstep(0.16, 0.04, length(sf));
    sky += vec3(star) * smoothstep(0.55, 0.8, h) * (0.3 + 0.7 * uNight);

    gl_FragColor = vec4(sky, 1.0);
  }
`

function VanillaSky({ skyRef }) {
  const matRef = useRef()
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.16, -0.8) },
  }), [])
  useFrame((state) => {
    if (!matRef.current) return
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime
    matRef.current.uniforms.uNight.value = skyRef?.current?.night ?? 0
  })
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[400, 32, 16]} />
      <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={SKY_VERT} fragmentShader={SKY_FRAG} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  )
}

// ---- 3D cloud billboards — the "you are IN the sky" layer ------------------
// The dome shader only paints the far backdrop; these soft billboards float at
// real depths around the building, so the descending/orbiting camera gets true
// parallax and flies right past (even through) a few of them.
function makeCloudTexture(seed) {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  let s = seed
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  // a heap of soft blobs, wider than tall, denser toward the bottom (cumulus)
  for (let i = 0; i < 26; i++) {
    const bx = S * (0.16 + 0.68 * rnd())
    const by = S * (0.40 + 0.32 * rnd())
    const r = S * (0.07 + 0.13 * rnd())
    const a = 0.10 + 0.16 * rnd()
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r)
    g.addColorStop(0, `rgba(255,255,255,${a})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// soft radial glow sprite (used by the lit-window halos)
function makeGlowTexture() {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// a premium lens-flare-style burst: hot core + soft bloom + an 8-point
// starburst spike, instead of a flat blurry circle — used for the Build
// ignite/disintegrate flashes, which need to read as a hero moment
function makeBurstTexture() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  const cx = S / 2
  const cy = S / 2
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, S / 2)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.1, 'rgba(255,244,214,0.95)')
  glow.addColorStop(0.26, 'rgba(255,199,120,0.5)')
  glow.addColorStop(0.55, 'rgba(255,160,70,0.16)')
  glow.addColorStop(1, 'rgba(255,140,60,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, S, S)
  ctx.globalCompositeOperation = 'lighter'
  const spike = (len, width, alpha) => {
    const grad = ctx.createLinearGradient(-len, 0, len, 0)
    grad.addColorStop(0, 'rgba(255,200,120,0)')
    grad.addColorStop(0.46, `rgba(255,214,150,${alpha * 0.35})`)
    grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`)
    grad.addColorStop(0.54, `rgba(255,214,150,${alpha * 0.35})`)
    grad.addColorStop(1, 'rgba(255,200,120,0)')
    ctx.fillStyle = grad
    ctx.fillRect(-len, -width / 2, len * 2, width)
  }
  ctx.save()
  ctx.translate(cx, cy)
  spike(S * 0.47, 6, 0.9)
  ctx.rotate(Math.PI / 2)
  spike(S * 0.47, 6, 0.9)
  ctx.rotate(-Math.PI / 4)
  spike(S * 0.3, 3, 0.5)
  ctx.rotate(Math.PI / 2)
  spike(S * 0.3, 3, 0.5)
  ctx.restore()
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const CLOUD_SALMON = new THREE.Color('#f28a4e')
const CLOUD_GOLD = new THREE.Color('#ffc077')
const CLOUD_VIOLET = new THREE.Color('#8a5a8f')
const CLOUD_NIGHT = new THREE.Color('#0f1322')

function CloudField({ skyRef }) {
  const textures = useMemo(() => [makeCloudTexture(11), makeCloudTexture(47), makeCloudTexture(83)], [])
  const clouds = useMemo(() => {
    let s = 20260726
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    const sunAz = Math.atan2(-0.8, -0.6) // uSunDir.xz azimuth
    const arr = []
    for (let i = 0; i < 42; i++) {
      // tier 0: low distant bank · tier 1: mid ring · tier 2: high fly-past ·
      // tier 3: the CLOUD SEA — flat-lying planes BELOW the building, so the
      // helicopter descent looks down onto cloud tops (not empty sky)
      const tier = i < 12 ? 0 : i < 24 ? 1 : i < 30 ? 2 : 3
      const ang = rnd() * Math.PI * 2
      const rad = tier === 0 ? 90 + rnd() * 110 : tier === 1 ? 55 + rnd() * 80 : tier === 2 ? 45 + rnd() * 65 : 12 + rnd() * 60
      const y = tier === 0 ? 1 + rnd() * 7 : tier === 1 ? 9 + rnd() * 15 : tier === 2 ? 26 + rnd() * 22 : -3 - rnd() * 9
      const w = tier === 0 ? 60 + rnd() * 55 : tier === 1 ? 34 + rnd() * 36 : tier === 2 ? 26 + rnd() * 24 : 30 + rnd() * 50
      const toSun = Math.cos(ang - sunAz) * 0.5 + 0.5
      const day = CLOUD_SALMON.clone().lerp(CLOUD_GOLD, toSun * 0.7)
      if (tier === 2) day.lerp(CLOUD_VIOLET, 0.75)
      else if (tier === 1) day.lerp(CLOUD_VIOLET, 0.35 * rnd())
      arr.push({
        tex: textures[i % 3], tier, ang, rad, y, w,
        h: tier === 3 ? w * (0.7 + rnd() * 0.3) : w * (0.36 + rnd() * 0.2),
        day,
        op: tier === 2 ? 0.3 + rnd() * 0.2 : tier === 3 ? 0.65 + rnd() * 0.25 : 0.42 + rnd() * 0.25,
        drift: 0.003 + rnd() * 0.006,
        spin: rnd() * Math.PI * 2,
      })
    }
    return arr
  }, [textures])
  const meshRefs = useRef([])
  useFrame((state) => {
    const night = skyRef?.current?.night ?? 0
    const t = state.clock.elapsedTime
    for (let i = 0; i < clouds.length; i++) {
      const m = meshRefs.current[i]
      const c = clouds[i]
      if (!m) continue
      const a = c.ang + t * c.drift * 0.15
      m.position.set(Math.cos(a) * c.rad, c.y, Math.sin(a) * c.rad)
      if (c.tier === 3) {
        // the cloud sea lies FLAT under the building
        m.rotation.set(-Math.PI / 2, 0, c.spin)
      } else {
        // cylindrical billboard (Y-axis only): seen from above the planes go
        // edge-on and thin out into LAYERS instead of a screen-filling fog wall
        m.rotation.set(0, Math.atan2(state.camera.position.x - m.position.x, state.camera.position.z - m.position.z), 0)
      }
      m.material.color.lerpColors(c.day, CLOUD_NIGHT, night)
      m.material.opacity = c.op * (1 - 0.5 * night)
    }
  })
  return (
    <group>
      {clouds.map((c, i) => (
        <mesh key={i} ref={(m) => { meshRefs.current[i] = m }}>
          <planeGeometry args={[c.w, c.h]} />
          <meshBasicMaterial map={c.tex} transparent depthWrite={false} opacity={c.op} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

// ---- The building ----------------------------------------------------------
function Building() {
  const { scene } = useGLTF(BUILDING)
  const model = useMemo(() => scene.clone(true), [scene])
  useEffect(() => {
    // the GLTF export made the walls alphaMode:BLEND (you could see the fire
    // escapes THROUGH the brick) — force every surface fully opaque, EXCEPT
    // the "window" material: that stays real translucent glass, so the Act 3
    // interior lights shine through the actual window openings
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (/window/i.test(m.name)) {
          m.transparent = true
          m.opacity = 0.38
          m.depthWrite = false
          if ('transmission' in m) m.transmission = 0
          m.side = THREE.FrontSide
          m.needsUpdate = true
          continue
        }
        m.transparent = false
        m.depthWrite = true
        m.alphaTest = 0
        if (m.opacity !== undefined) m.opacity = 1
        if ('transmission' in m) m.transmission = 0
        m.side = THREE.FrontSide
        m.needsUpdate = true
      }
    })
  }, [model])
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const s = BUILDING_H / (size.y || 1)
    const c = box.getCenter(new THREE.Vector3())
    // centre X/Z, sit the base on y=0
    return { s, p: [-c.x * s, -box.min.y * s, -c.z * s] }
  }, [model])
  return (
    <>
      <group scale={norm.s} position={norm.p}>
        <primitive object={model} />
      </group>
      {/* dark interior shell: with translucent glass you'd otherwise see
          straight through the hollow building to the sky */}
      <mesh position={[0, BUILDING_H / 2, 0]}>
        <boxGeometry args={[6.1, BUILDING_H - 0.15, 6.1]} />
        <meshBasicMaterial color="#070406" side={THREE.BackSide} />
      </mesh>
    </>
  )
}

// the "WEB & STYLE / web experience studio" sign, standing on the roof's back
// edge, facing the camera (glows via bloom). During the Act 4 dolly-out the
// whole rig quietly swings 90° around the roof axis (the classic cheat), so
// the sign ends up on the far edge FACING the final head-on camera.
function RoofSign({ progressRef }) {
  const rig = useRef()
  useFrame(() => {
    if (!rig.current) return
    rig.current.rotation.y = sm(progressRef.current, 0.80, 0.94) * (Math.PI / 2)
  })
  return (
    <group ref={rig}>
      <RoofSignBoard />
    </group>
  )
}

function RoofSignBoard() {
  return (
    <group position={[0, BUILDING_H + 1.5, -ROOF_HALF + 0.3]}>
      {/* dark sign board so the glowing text reads against the bright sky */}
      <mesh position={[0, -0.28, -0.08]}>
        <planeGeometry args={[7.2, 1.7]} />
        <meshBasicMaterial color="#140d08" transparent opacity={0.82} side={THREE.DoubleSide} />
      </mesh>
      <Text fontSize={0.86} anchorX="center" anchorY="middle" font={ROOF_HEAD_FONT}>
        WEB & STYLE
        <meshStandardMaterial color="#fff4e6" emissive="#ffd39a" emissiveIntensity={1.4} toneMapped={false} />
      </Text>
      <Text position={[0, -0.66, 0]} fontSize={0.3} anchorX="center" anchorY="middle" letterSpacing={0.05} font={ROOF_BODY_FONT}>
        WEB EXPERIENCE STUDIO
        <meshStandardMaterial color="#ffe9cc" emissive="#d99a4a" emissiveIntensity={1.0} toneMapped={false} />
      </Text>
    </group>
  )
}

// the masthead — written ON the roof (per the user's mockup), flat, reading
// toward the descending camera. Fades in as we land.
function RoofMasthead({ progressRef }) {
  const t = useT()
  const m1 = useRef()
  const m2 = useRef()
  useFrame(() => {
    const p = progressRef.current
    // fade in while landing, fade back out as we leave the roof for the climb
    const op = sm(p, 0.022, 0.054) * (1 - sm(p, 0.092, 0.128))
    if (m1.current) m1.current.opacity = op
    if (m2.current) m2.current.opacity = op
  })
  return (
    <group position={[0, BUILDING_H + 0.06, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
      <Text position={[0, 1.15, 0]} fontSize={0.6} maxWidth={6.2} anchorX="center" anchorY="middle" textAlign="center" lineHeight={1.05} font={ROOF_HEAD_FONT}>
        {t(AGENCY.title).replace(/\n/g, ' ')}
        <meshBasicMaterial ref={m1} color="#ffffff" transparent opacity={0} toneMapped={false} />
      </Text>
      <Text position={[0, -1.05, 0]} fontSize={0.3} maxWidth={6.0} anchorX="center" anchorY="middle" textAlign="center" lineHeight={1.3} font={ROOF_BODY_FONT}>
        {t(AGENCY.intro)}
        <meshBasicMaterial ref={m2} color="#ffffff" transparent opacity={0} toneMapped={false} />
      </Text>
    </group>
  )
}

// "égőkörték" — a string of warm bulbs around the roof edge (glow via bloom)
function RoofBulbs() {
  const positions = useMemo(() => {
    const arr = []
    const n = 7
    const y = BUILDING_H + 0.18
    const h = ROOF_HALF - 0.05
    for (let i = 0; i <= n; i++) {
      const u = -h + (2 * h) * (i / n)
      arr.push([u, y, h], [u, y, -h], [h, y, u], [-h, y, u])
    }
    return arr
  }, [])
  return (
    <group>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.085, 10, 10]} />
          <meshBasicMaterial color="#ffd396" toneMapped={false} />
        </mesh>
      ))}
      {/* warm fill from the bulbs onto the roof */}
      <pointLight position={[0, BUILDING_H + 1.4, 0]} intensity={6} distance={12} color="#ffcf8a" />
    </group>
  )
}

// ---- Scroll-driven camera --------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z)
const sm = (t, a, b) => { const x = Math.min(Math.max((t - a) / (b - a), 0), 1); return x * x * (3 - 2 * x) }

// scroll map — the scroll space grew 1600vh → 2000vh when Act 4 landed, so the
// earlier p-values shrank (×0.8) to keep their absolute scroll length
const ROOF_AT = 0.064
const ROOF_HOLD = 0.10
const ACT2_IN = 0.136
const ACT2_OUT = 0.368
const NIGHT_IN = 0.376  // night falls during the fly-around to the right side
const NIGHT_OUT = 0.448
const ACT3_IN = 0.448
const ACT3_OUT = 0.776
const ACT4_IN = 0.78    // fact texts dissolve, the handwritten "Build" ignites
// the "Build" finale beats: wall-hold → (camera dollies to its FINAL, static
// frame) → fly to centre-frame → hold & glow → disintegrate into gold dust
// (see NeonBuildWord / GoldDustBurst). The fly only starts once the camera
// has already stopped moving, so its straight-line path never has to cross
// the camera's own transit (that was making it balloon to fill the screen
// mid-flight — a moving object sailing close past a moving camera).
const BUILD_FLY_START = 0.83   // camera is fully settled by here
const BUILD_FLY_END = 0.865    // arrives centre-frame (earlier than before)
const BUILD_HOLD_END = 0.925   // long, glowing hold centre-frame
const BUILD_BURST_END = 0.94   // fully dissolved into dust by here
const CLIMB_Y0 = 1.7   // camera height at the bottom of the climb
const CLIMB_Y1 = 9.6   // camera height at the top

// ---- ACT 3: the five process windows on the RIGHT wall ----------------------
// REAL window positions, extracted from the GLB's "window"-material geometry
// (playwright + GLTFLoader → right-wall vertex clusters): the wall face is at
// x=3.158, the grid is 9 floors × 8 columns, panes ~0.30 × 0.57. The five
// picks below are exact grid cells, ascending, alternating sides.
const WIN_X = 3.19
// s: which side the fact panel sits on (panel world z = z - s*offset).
// Consecutive stops are TWO floors apart so the 1.5-tall panels can never
// overlap; the top-floor finale (Build) breaks the rhythm — its text goes to
// the LEFT of the window (user call) on a narrower panel (pw/tw/po), which
// keeps it horizontally clear of the 04 panel one floor below.
const WINDOWS = [
  { y: 2.146, z: 1.178, s: 1 },
  { y: 4.435, z: -1.306, s: -1 },
  { y: 6.712, z: 0.364, s: 1 },
  { y: 8.992, z: -2.099, s: -1 },
  { y: 10.135, z: 1.178, s: -1, pw: 2.6, tw: 2.3, po: 1.95 },
]
const ACT3_STEP = (ACT3_OUT - ACT3_IN) / WINDOWS.length
// progress at which the camera settles on window i (it lights up just before)
const winArrive = (i) => ACT3_IN + ACT3_STEP * (i + 0.55)
const winSide = (w) => w.s

const WINDOW_KEYS = WINDOWS.flatMap((w, i) => {
  const s = winSide(w)
  const pos = V(WIN_X + 6.4, w.y + 0.25, w.z - s * 1.1)
  const tgt = V(WIN_X, w.y + 0.05, w.z - s * 1.2)
  const keys = [{ p: winArrive(i), pos, tgt }]
  // hold on this window until the next slice begins
  if (i < WINDOWS.length - 1) keys.push({ p: ACT3_IN + ACT3_STEP * (i + 1), pos, tgt })
  return keys
})

// keyframed track: bird's-eye → roof settle → swing down to the left side →
// climb the left wall floor by floor → night fly-around to the right side →
// window-to-window dolly. Later acts append more keys.
const CAM_KEYS = [
  { p: 0.00, pos: V(10, 42, 30), tgt: V(0, BUILDING_H * 0.5, 0) },
  { p: ROOF_AT, pos: V(0, BUILDING_H + 10, 11.5), tgt: V(0, BUILDING_H - 0.6, 0.3) }, // the roof read
  { p: ROOF_HOLD, pos: V(0, BUILDING_H + 10, 11.5), tgt: V(0, BUILDING_H - 0.6, 0.3) }, // hold to read
  // near head-on to the LEFT wall (slight angle for depth) so the floor fact
  // panels read face-on while the camera climbs
  { p: ACT2_IN, pos: V(-12.5, CLIMB_Y0, 3.2), tgt: V(-3.4, 2.8, 0.4) },
  { p: ACT2_OUT, pos: V(-12.5, CLIMB_Y1, 3.2), tgt: V(-3.4, 10.2, 0.4) },
  // ACT 3: pull away over the FRONT of the building while night falls…
  { p: 0.408, pos: V(3, 13, 16), tgt: V(0, 6.5, 0) },
  // …and swing onto the RIGHT side, dropping toward the first window
  { p: ACT3_IN, pos: V(11.5, WINDOWS[0].y + 2.2, 6.5), tgt: V(WIN_X, WINDOWS[0].y + 0.6, 0) },
  ...WINDOW_KEYS,
  // ACT 4: hold on Build through the handwritten morph AND the wall-hold,
  // then ONE straight dolly-back off the wall into the final wide framing —
  // per the user's Blender mock: HEAD-ON at the hero's right wall, neighbours
  // flanking behind. The camera is fully static by BUILD_FLY_START, so the
  // whole centre-frame hold + dust finale plays out in a locked-off shot.
  {
    p: 0.80,
    pos: V(WIN_X + 6.4, WINDOWS[4].y + 0.25, WINDOWS[4].z - winSide(WINDOWS[4]) * 1.1),
    tgt: V(WIN_X, WINDOWS[4].y + 0.05, WINDOWS[4].z - winSide(WINDOWS[4]) * 1.2),
  },
  { p: BUILD_FLY_START, pos: V(27.3, 9.6, -0.4), tgt: V(0, 6.7, 0), fov: 34 }, // settled before the fly
  { p: 1.00, pos: V(27.3, 9.6, -0.4), tgt: V(0, 6.7, 0), fov: 34 },
]

// ---- camera editor (opens with ?building + &cam) ---------------------------
// freezes the scene at the final Act 4 wide shot and lets the position/target/
// fov be dialed in live with sliders; copy the JSON into the last CAM_KEYS.
const CAM_EDIT = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('cam')
const CAM_DEFAULT = { pos: [27.3, 9.6, -0.4], tgt: [0, 6.7, 0], fov: 34 }
function loadCamCfg() {
  try {
    const raw = localStorage.getItem('ws-building-cam')
    if (raw) return { ...CAM_DEFAULT, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { pos: [...CAM_DEFAULT.pos], tgt: [...CAM_DEFAULT.tgt], fov: CAM_DEFAULT.fov }
}

function CameraRig({ progressRef, editRef }) {
  const { camera } = useThree()
  const pos = useMemo(() => new THREE.Vector3(), [])
  const tgt = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (editRef) {
      const e = editRef.current
      camera.position.set(e.pos[0], e.pos[1], e.pos[2])
      camera.up.set(0, 1, 0)
      camera.lookAt(e.tgt[0], e.tgt[1], e.tgt[2])
      if (camera.fov !== e.fov) { camera.fov = e.fov; camera.updateProjectionMatrix() }
      return
    }
    const p = progressRef.current
    let a = CAM_KEYS[0]
    let b = CAM_KEYS[CAM_KEYS.length - 1]
    for (let i = 0; i < CAM_KEYS.length - 1; i++) {
      if (p >= CAM_KEYS[i].p && p <= CAM_KEYS[i + 1].p) { a = CAM_KEYS[i]; b = CAM_KEYS[i + 1]; break }
    }
    const t = a === b ? 1 : sm(p, a.p, b.p)
    pos.lerpVectors(a.pos, b.pos, t)
    tgt.lerpVectors(a.tgt, b.tgt, t)
    camera.position.copy(pos)
    camera.up.set(0, 1, 0)
    camera.lookAt(tgt)
    // fov: 45 everywhere unless a keyframe overrides it (Act 4 zooms to 34)
    const fov = (a.fov ?? 45) + ((b.fov ?? 45) - (a.fov ?? 45)) * t
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix() }
  })
  return null
}

function CameraEditor({ editRef }) {
  const [cfg, setCfg] = useState(() => editRef.current)
  const apply = (next) => {
    editRef.current = next
    setCfg(next)
    try { localStorage.setItem('ws-building-cam', JSON.stringify(next)) } catch { /* ignore */ }
  }
  const setAxis = (key, i, v) => {
    const next = { ...cfg, [key]: cfg[key].map((x, j) => (j === i ? v : x)) }
    apply(next)
  }
  const row = (label, key, i, min, max) => {
    const val = cfg[key][i]
    return (
      <label className="abx__ce-row" key={`${key}${i}`}>
        <span>{label}</span>
        <input type="range" min={min} max={max} step={0.1} value={val}
          onChange={(e) => setAxis(key, i, parseFloat(e.target.value))} />
        <b>{val.toFixed(1)}</b>
      </label>
    )
  }
  const json = `{ p: 1.00, pos: V(${cfg.pos.map((n) => n.toFixed(2)).join(', ')}), tgt: V(${cfg.tgt.map((n) => n.toFixed(2)).join(', ')}) },  // fov ${cfg.fov}`
  return (
    <div className="abx__ce">
      <h4>Act 4 — záró kamera</h4>
      {row('pos X', 'pos', 0, -15, 45)}
      {row('pos Y', 'pos', 1, 0, 30)}
      {row('pos Z', 'pos', 2, -25, 25)}
      <div className="abx__ce-sep" />
      {row('néz X', 'tgt', 0, -12, 12)}
      {row('néz Y', 'tgt', 1, 0, 16)}
      {row('néz Z', 'tgt', 2, -12, 12)}
      <div className="abx__ce-sep" />
      <label className="abx__ce-row">
        <span>FOV</span>
        <input type="range" min={25} max={70} step={1} value={cfg.fov}
          onChange={(e) => apply({ ...cfg, fov: parseFloat(e.target.value) })} />
        <b>{cfg.fov.toFixed(0)}</b>
      </label>
      <textarea className="abx__ce-json" readOnly value={json} rows={2} />
      <div className="abx__ce-btns">
        <button type="button" onClick={() => navigator.clipboard?.writeText(json)}>JSON másolása</button>
        <button type="button" onClick={() => apply(loadCamCfg())}>Mentett</button>
        <button type="button" onClick={() => { localStorage.removeItem('ws-building-cam'); apply({ pos: [...CAM_DEFAULT.pos], tgt: [...CAM_DEFAULT.tgt], fov: CAM_DEFAULT.fov }) }}>Reset</button>
      </div>
    </div>
  )
}

// ---- the futuristic-city backdrop (opens with ?building + &city) -----------
// A free Sketchfab city kit dropped around the hero for the opening roof
// descent, so it doesn't land in an empty void. Visible only through the
// roof-landing beat (fades out before the ACT2 climb starts, well clear of
// the left-wall facts). The model is enormous (raw units in the hundreds of
// thousands) and pre-normalized nowhere near our scale, so position/rotation/
// scale are ALL exposed live — see CityEditor, same pattern as CameraEditor.
const CITY_EDIT = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('city')
const CITY_DEFAULT = { pos: [6, 0, -17], scale: 0.0009, rotY: 0 } // user-tuned
function loadCityCfg() {
  try {
    const raw = localStorage.getItem('ws-building-city')
    if (raw) return { ...CITY_DEFAULT, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...CITY_DEFAULT }
}
// road-surface material names in the kit (see tools/ inspection) — these get
// their beige asphalt-kit texture stripped and swapped for a flat dark-asphalt
// tint; the sidewalks and buildings are left exactly as authored
const CITY_ROAD_MATS = /^(wax_02|default1)$/i
// multiplies onto each material's own baked (day) colour at full night — cool
// and dark, same family as the building's own night lighting rig
const CITY_NIGHT_TINT = new THREE.Color('#232a45')

function CityBackdrop({ progressRef, skyRef, editRef }) {
  const { scene } = useGLTF(CITY_MODEL)
  const model = useMemo(() => scene.clone(true), [scene])
  const matRefs = useRef([])
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    return [-c.x, -box.min.y, -c.z]
  }, [model])
  useEffect(() => {
    matRefs.current = []
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (CITY_ROAD_MATS.test(m.name)) {
          m.map = null
          m.color.set('#15161a') // dark asphalt, not the kit's beige concrete
          m.needsUpdate = true
        }
        m.transparent = true
        m.userData.dayColor = m.color.clone()
        matRefs.current.push(m)
      }
    })
  }, [model])
  const groupRef = useRef()
  useFrame(() => {
    const p = editRef ? 1 : progressRef.current
    // visible from the very first frame (the bird's-eye descent starts already
    // over the city) through to Act 4, where the case-study neighbours (with
    // their own signs) take over as the "city" the scene shows
    const op = editRef ? 1 : 1 - sm(p, ACT4_IN - 0.03, ACT4_IN)
    const night = editRef ? 0 : (skyRef?.current?.night ?? 0)
    for (const m of matRefs.current) {
      m.opacity = op
      m.color.lerpColors(m.userData.dayColor, CITY_NIGHT_TINT, night)
    }
    if (groupRef.current) groupRef.current.visible = op > 0.001
    const cfg = editRef ? editRef.current : CITY_DEFAULT
    if (groupRef.current) {
      groupRef.current.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2])
      groupRef.current.rotation.y = cfg.rotY
      groupRef.current.scale.setScalar(cfg.scale)
    }
  })
  return (
    <group ref={groupRef}>
      <group position={norm}>
        <primitive object={model} />
      </group>
    </group>
  )
}

function CityEditor({ editRef }) {
  const [cfg, setCfg] = useState(() => editRef.current)
  const apply = (next) => {
    editRef.current = next
    setCfg(next)
    try { localStorage.setItem('ws-building-city', JSON.stringify(next)) } catch { /* ignore */ }
  }
  const setPos = (i, v) => apply({ ...cfg, pos: cfg.pos.map((x, j) => (j === i ? v : x)) })
  const json = `{ pos: [${cfg.pos.map((n) => n.toFixed(2)).join(', ')}], scale: ${cfg.scale.toFixed(5)}, rotY: ${cfg.rotY.toFixed(2)} }`
  return (
    <div className="abx__ce">
      <h4>Város-háttér (roof landing)</h4>
      <label className="abx__ce-row"><span>pos X</span><input type="range" min={-300} max={300} step={1} value={cfg.pos[0]} onChange={(e) => setPos(0, parseFloat(e.target.value))} /><b>{cfg.pos[0].toFixed(0)}</b></label>
      <label className="abx__ce-row"><span>pos Y</span><input type="range" min={-30} max={30} step={0.5} value={cfg.pos[1]} onChange={(e) => setPos(1, parseFloat(e.target.value))} /><b>{cfg.pos[1].toFixed(1)}</b></label>
      <label className="abx__ce-row"><span>pos Z</span><input type="range" min={-300} max={300} step={1} value={cfg.pos[2]} onChange={(e) => setPos(2, parseFloat(e.target.value))} /><b>{cfg.pos[2].toFixed(0)}</b></label>
      <div className="abx__ce-sep" />
      <label className="abx__ce-row"><span>méret</span><input type="range" min={0.0001} max={0.003} step={0.0001} value={cfg.scale} onChange={(e) => apply({ ...cfg, scale: parseFloat(e.target.value) })} /><b>{cfg.scale.toFixed(4)}</b></label>
      <label className="abx__ce-row"><span>forgás</span><input type="range" min={-3.15} max={3.15} step={0.05} value={cfg.rotY} onChange={(e) => apply({ ...cfg, rotY: parseFloat(e.target.value) })} /><b>{cfg.rotY.toFixed(2)}</b></label>
      <textarea className="abx__ce-json" readOnly value={json} rows={2} />
      <div className="abx__ce-btns">
        <button type="button" onClick={() => navigator.clipboard?.writeText(json)}>JSON másolása</button>
        <button type="button" onClick={() => apply(loadCityCfg())}>Mentett</button>
        <button type="button" onClick={() => { localStorage.removeItem('ws-building-city'); apply({ ...CITY_DEFAULT }) }}>Reset</button>
      </div>
    </div>
  )
}

// ---- ACT 2: the "What I build" facts, one per floor on the LEFT wall --------
// 8 panels stacked up the left facade; each one fades in just before the rising
// camera reaches its floor and stays (the menu lives on this side afterwards).
const FLOOR_X = -3.62          // just off the left wall
const FLOOR_Y0 = 1.5
const FLOOR_DY = 1.06          // one floor per fact
const factReveal = (i, p) => {
  const y = FLOOR_Y0 + FLOOR_DY * i
  // progress at which the camera's eye passes this floor
  const pi = ACT2_IN + (ACT2_OUT - ACT2_IN) * Math.max(0, (y - CLIMB_Y0 - 0.4)) / (CLIMB_Y1 - CLIMB_Y0)
  return sm(p, pi, pi + 0.035)
}

function FloorFacts({ progressRef }) {
  const t = useT()
  const items = AGENCY.services
  const matRefs = useRef(items.map(() => []))
  useFrame(() => {
    const p = progressRef.current
    for (let i = 0; i < items.length; i++) {
      const op = factReveal(i, p)
      for (const m of matRefs.current[i]) {
        if (!m) continue
        m.opacity = m.userData.k * op
      }
    }
  })
  const reg = (i, k) => (m) => { if (m) { m.userData.k = k; matRefs.current[i].push(m) } }
  return (
    <>
      {items.map((s, i) => (
        <group
          key={s.n}
          position={[FLOOR_X, FLOOR_Y0 + FLOOR_DY * i, i % 2 ? -1.75 : 1.75]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          {/* soft dark backing so the text reads on the bright facade */}
          <mesh position={[0, -0.18, -0.02]}>
            <planeGeometry args={[3.3, 1.55]} />
            <meshBasicMaterial ref={reg(i, 0.72)} color="#12091c" transparent opacity={0} />
          </mesh>
          <Text position={[-1.5, 0.38, 0]} fontSize={0.12} anchorX="left" anchorY="middle" font={FONT}>
            {s.n}
            <meshBasicMaterial ref={reg(i, 1)} color="#ffd39a" transparent opacity={0} toneMapped={false} />
          </Text>
          <Text position={[-1.5, 0.24, 0]} fontSize={0.24} anchorX="left" anchorY="top" font={ROOF_HEAD_FONT} maxWidth={3.0} lineHeight={1.05}>
            {t(s.title)}
            <meshBasicMaterial ref={reg(i, 1)} color="#ffffff" transparent opacity={0} toneMapped={false} />
          </Text>
          <Text position={[-1.5, -0.32, 0]} fontSize={0.145} anchorX="left" anchorY="top" font={ROOF_BODY_FONT} maxWidth={3.0} lineHeight={1.3}>
            {t(s.text)}
            <meshBasicMaterial ref={reg(i, 0.9)} color="#ffffff" transparent opacity={0} toneMapped={false} />
          </Text>
        </group>
      ))}
    </>
  )
}

// ---- ACT 3: lit windows + the five process facts on the RIGHT wall ----------
// Each stop is a warm window glow (halo + pane + dark mullion cross) with the
// process fact on a dark panel beside it. The window snaps on just before the
// camera settles, the fact fades in right after — and both STAY lit (the menu
// lives on this side afterwards).
function ProcessWindows({ progressRef }) {
  const t = useT()
  const items = AGENCY.process
  const glowTex = useMemo(() => makeGlowTexture(), [])
  const winMats = useRef(items.map(() => []))
  const factMats = useRef(items.map(() => []))
  useFrame(() => {
    const p = progressRef.current
    // at Act 4 every fact text burns away inside the flash (the windows STAY
    // lit) — only the handwritten "Build" is left standing in its place
    const factOut = 1 - sm(p, ACT4_IN, ACT4_IN + 0.018)
    for (let i = 0; i < items.length; i++) {
      const lit = sm(p, winArrive(i) - 0.035, winArrive(i) - 0.008)
      const fact = sm(p, winArrive(i) - 0.008, winArrive(i) + 0.02) * factOut
      for (const m of winMats.current[i]) { if (m) m.opacity = m.userData.k * lit }
      for (const m of factMats.current[i]) { if (m) m.opacity = m.userData.k * fact }
    }
  })
  const regWin = (i, k) => (m) => { if (m) { m.userData.k = k; winMats.current[i].push(m) } }
  const regFact = (i, k) => (m) => { if (m) { m.userData.k = k; factMats.current[i].push(m) } }
  return (
    <>
      {items.map((s, i) => {
        const w = WINDOWS[i]
        const side = winSide(w)
        // the group is rotated +90° around Y (plane normal = +x, facing the
        // camera), so local +x maps to world -z: panel offset side*po puts
        // the fact toward the panel's side of the window
        const po = w.po ?? 2.2
        const pw = w.pw ?? 3.2
        const tw = w.tw ?? 3.0
        const px = side * po
        const tx = px - (pw / 2 - 0.15)
        return (
          <group key={s.n} position={[WIN_X, w.y, w.z]} rotation={[0, Math.PI / 2, 0]}>
            {/* the ROOM light: a warm plane INSIDE the building, behind the
                translucent glass — the real window opening and its real frame
                do the framing, so lit windows look exactly like the dark ones */}
            <mesh position={[0, 0, -0.4]}>
              <planeGeometry args={[0.72, 0.9]} />
              <meshBasicMaterial ref={regWin(i, 1)} color={[1.75, 1.32, 0.78]} transparent opacity={0} toneMapped={false} />
            </mesh>
            {/* faint spill onto the surrounding brick */}
            <mesh position={[0, 0, -0.015]}>
              <planeGeometry args={[1.1, 1.25]} />
              <meshBasicMaterial ref={regWin(i, 0.25)} map={glowTex} color="#ff9a3c" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>

            {/* the process fact beside the window — pushed OUT past the brick
                piers (they protrude ~0.4 beyond the recessed glass plane) */}
            <group position={[0, 0, 0.55]}>
              <mesh position={[px, -0.15, -0.02]}>
                <planeGeometry args={[pw, 1.7]} />
                <meshBasicMaterial ref={regFact(i, 0.72)} color="#12091c" transparent opacity={0} />
              </mesh>
              <Text position={[tx, 0.5, 0]} fontSize={0.12} anchorX="left" anchorY="middle" font={FONT}>
                {s.n}
                <meshBasicMaterial ref={regFact(i, 1)} color="#ffd39a" transparent opacity={0} toneMapped={false} />
              </Text>
              <Text position={[tx, 0.36, 0]} fontSize={0.24} anchorX="left" anchorY="top" font={ROOF_HEAD_FONT} maxWidth={tw} lineHeight={1.05}>
                {t(s.title)}
                <meshBasicMaterial ref={regFact(i, 1)} color="#ffffff" transparent opacity={0} toneMapped={false} />
              </Text>
              <Text position={[tx, -0.22, 0]} fontSize={0.145} anchorX="left" anchorY="top" font={ROOF_BODY_FONT} maxWidth={tw} lineHeight={1.3}>
                {t(s.text)}
                <meshBasicMaterial ref={regFact(i, 0.9)} color="#ffffff" transparent opacity={0} toneMapped={false} />
              </Text>
            </group>
          </group>
        )
      })}
    </>
  )
}

// ---- ACT 3 → 4 bridge: the handwritten "Build" -----------------------------
// A hot flash of light burns the Build fact away, and the handwritten neon
// script ignites IN ITS PLACE on the wall. Once lit, it holds, then peels off
// and drifts to hold large and glowing at the centre of the final wide frame
// — then disintegrates into gold dust that flies out to ignite the four
// case-study signs AND a scatter of extra windows across every building (see
// GoldDustBurst / ExtraWindowSparks below): the city visibly wakes up because
// of it — the buildings are what it built.
// ⚠️ Bastliga One: DEMO licenc — personal use only; éles indulás előtt
// kereskedelmi licencet kell venni (creativemarket.com/MadhalineStudio)
const SCRIPT_FONT = '/assets/fonts/BastligaOne.ttf'

const BUILD_WALL_POS = (() => {
  const w = WINDOWS[4]
  const cz = w.z - winSide(w) * (w.po ?? 2.2) // the Build panel's world z
  return V(WIN_X + 0.6, w.y, cz)
})()
// large and roughly centred against the FINAL wide frame (camera ends at
// V(27.3, 9.6, -0.4) looking at V(0, 6.7, 0)) — partway along that view ray,
// so it reads as a big foreground presence in front of the whole skyline
const BUILD_CENTER_POS = V(17.5, 8.7, -0.3)
const BUILD_HOLD_SCALE = 1.7

function NeonBuildWord({ progressRef }) {
  const t = useT()
  const burstTex = useMemo(() => makeBurstTexture(), [])
  const flashRef = useRef()
  const flashMeshRef = useRef()
  const matRef = useRef()
  const groupRef = useRef()
  const pos = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const p = progressRef.current
    // the flash that burns the old fact out…
    const wallFlash = sm(p, ACT4_IN, ACT4_IN + 0.012) * (1 - sm(p, ACT4_IN + 0.014, ACT4_IN + 0.045))
    // …and the second, bigger flash as it disintegrates into dust
    const burstFlash = sm(p, BUILD_HOLD_END, BUILD_HOLD_END + 0.006) * (1 - sm(p, BUILD_BURST_END - 0.006, BUILD_BURST_END + 0.025))
    if (flashRef.current) flashRef.current.opacity = Math.max(wallFlash, burstFlash)
    if (flashMeshRef.current) {
      flashMeshRef.current.rotation.z = p * 4
      const burstPulse = sm(p, BUILD_HOLD_END, BUILD_BURST_END)
      flashMeshRef.current.scale.setScalar(1 + burstPulse * 2.1)
    }
    // …and the handwritten word left standing where it was, flickering to life
    const ignite = sm(p, ACT4_IN + 0.012, ACT4_IN + 0.06)
    let op = ignite
    if (ignite > 0 && ignite < 1) {
      const n = Math.sin(p * 3200) * Math.sin(p * 7900 + 1.7)
      op = ignite * (0.3 + 0.7 * (n > -0.35 ? 1 : 0.2))
    }
    // once lit, it holds on the wall, then drifts off to hold centre-frame…
    const fly = sm(p, BUILD_FLY_START, BUILD_FLY_END)
    pos.lerpVectors(BUILD_WALL_POS, BUILD_CENTER_POS, fly)
    // …glows and grows through the extra hold beat…
    const holdGrow = sm(p, BUILD_FLY_END, BUILD_HOLD_END)
    // …then dissolves into the dust burst
    const dissolve = sm(p, BUILD_HOLD_END, BUILD_BURST_END)
    if (groupRef.current) {
      groupRef.current.position.copy(pos)
      const scale = 1 + (BUILD_HOLD_SCALE - 1) * fly + 0.3 * holdGrow
      groupRef.current.scale.setScalar(scale)
    }
    if (matRef.current) matRef.current.opacity = op * (1 - dissolve)
  })
  return (
    <group ref={groupRef} position={BUILD_WALL_POS} rotation={[0, Math.PI / 2, 0]}>
      <mesh ref={flashMeshRef} position={[0, 0, -0.02]}>
        <planeGeometry args={[5.4, 5.4]} />
        <meshBasicMaterial ref={flashRef} map={burstTex} color={[3, 2.3, 1.3]} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* high SDF resolution so the thin neon strokes stay crisp instead of
          fraying/"choppy" when the word is scaled up ~2× toward the camera */}
      <Text font={SCRIPT_FONT} fontSize={0.85} sdfGlyphSize={128} anchorX="center" anchorY="middle" rotation={[0, 0, -0.05]}>
        {t(AGENCY.process[4].title)}
        <meshBasicMaterial ref={matRef} color={[2.4, 1.85, 1.05]} transparent opacity={0} toneMapped={false} />
      </Text>
    </group>
  )
}

// ---- ACT 4: the neighbour blocks and their neon signs -----------------------
// Layout per the user's Blender mock (v2, the WEDGE): the hero stands FRONT
// and centre (the Build window — the last stop — is the anchor; the dolly-out
// starts from it), and two pairs of neighbours tuck in BEHIND it, partially
// hidden by its silhouette, each pair fanning outward: near-left (Vanity),
// far-left (CLIFF), near-right (Olive), far-right (MATRIX). The near pair is
// slightly lower than the hero, every facade angled out toward the camera.
// Premium skyline rhythm: every roofline sits at a DIFFERENT height, stepping
// down around the hero (hero 11 → CLIFF ~10.8 → Olive ~9.9 → Vanity ~9.0 →
// MATRIX ~7.3), the far pair sinks slightly into the cloud sea for depth, and
// the lateral gaps are deliberately uneven (no mirror symmetry)
// all four sit on the street at y=0 (depth now comes from distance + scale +
// the street's own perspective, not from sinking into cloud)
const NEIGHBORS = [
  { pos: [-4.8, 0, 6.4], scale: 0.82, ry: Math.PI / 2 + 0.38 },
  { pos: [-11.5, 0, 13.8], scale: 1.04, ry: Math.PI / 2 + 0.52 },
  { pos: [-5.4, 0, -8.0], scale: 0.9, ry: Math.PI / 2 - 0.42 }, // Olive: right of hero
  { pos: [-12.5, 0, -15.8], scale: 0.74, ry: Math.PI / 2 - 0.58 }, // MATRIX: far, clear of Olive
]
// per-sign display fonts (commercial-use OK): Mochesa (1001Fonts FFC) for
// Vanity, Astra Style (SIL OFL) for Olive
const VANITY_FONT = '/assets/fonts/Mochesa.ttf'
const OLIVE_FONT = '/assets/fonts/AstraStyle.ttf'
// each sign is anchored ON its building's roof: pos = building [x,z], y is the
// building's own roofline (11 × scale) + short poles + half the board height,
// so it stands on the roof no matter the building's height (they differ)
const NEON_SIGNS = [
  { pos: [-4.8, 11.0 * 0.82 + 0.55 + 0.72, 6.4], word: 'Vanity', color: [2.6, 0.75, 2.1], font: VANITY_FONT, size: 1.0, boardW: 4.4, poles: 0.55 },
  { pos: [-11.5, 11.0 * 1.04 + 0.55 + 0.76, 13.8], word: 'CLIFF', color: [0.55, 2.3, 2.6], font: FONT, size: 1.05, boardW: 3.4, poles: 0.55 },
  { pos: [-5.4, 11.0 * 0.9 + 0.55 + 0.69, -8.0], word: 'Olive', color: [2.6, 1.7, 0.5], font: OLIVE_FONT, size: 0.95, boardW: 4.0, poles: 0.55 },
  { pos: [-12.5, 11.0 * 0.74 + 0.55 + 0.62, -15.8], word: 'MATRIX', color: [0.5, 2.6, 0.9], font: '/assets/fonts/Jelvion.otf', size: 0.85, boardW: 3.6, poles: 0.55 },
]

// ---- the gold-dust ignition cascade ----------------------------------------
// where the Build-word's dust flies to: the four case-study signs above, plus
// a scatter of lit windows spread across the NEIGHBOUR buildings — so the
// whole skyline wakes up ("a city where some are still up at night"). The hero
// is deliberately left alone: its five Act 3 windows are enough.
//
// Each neighbour presents its LOCAL +z wall to the final camera (they're
// rotated ~90° around Y, so the +x wall the Act 3 grid was extracted from
// faces sideways). The +z wall's REAL window grid was extracted the same way
// (tools, max-z band): wall at z≈3.06, six clean interior columns and the
// floor rows below. We light these EXACTLY like the hero's Act 3 windows — a
// warm room-light plane recessed BEHIND the real opening (WIN_Z_RECESS). The
// glass is the same shared, translucent material as the hero's (scene.clone
// shares materials, and <Building/> makes "window" transparent), so the light
// shines through the actual window opening, not painted flat on the brick.
const WIN_Z_FACE = 3.06
const WIN_Z_RECESS = WIN_Z_FACE - 0.4
// the real +z grid this scatter is drawn from — rows (floors) 2.15..8.99,
// columns -1.97..2.09 (kept as a comment reference for future edits)
// per-neighbour scatter of lit windows [colX, rowY] from the real grid —
// hand-picked to look organic, different on each building. Order = Vanity,
// CLIFF, Olive, MATRIX. Six windows each.
const LIFE_CELLS = [
  [[-1.18, 3.29], [0.47, 5.57], [-0.37, 7.86], [1.3, 2.15], [-1.97, 6.71], [2.09, 4.43]],
  [[-1.97, 4.43], [0.47, 6.71], [1.3, 3.29], [-0.37, 8.99], [-1.18, 5.57], [2.09, 7.86]],
  [[1.3, 3.29], [-0.37, 5.57], [0.47, 7.86], [-1.97, 2.15], [2.09, 6.71], [-1.18, 4.43]],
  [[-1.18, 3.29], [1.3, 5.57], [-0.37, 7.86], [0.47, 2.15], [-1.97, 6.71], [2.09, 4.43]],
]
const LIFE_PER = 6
// world position of a normalized local point on a neighbour (its group applies
// pos + rotateY(ry) + scale, same as the normalized building inside it)
function nbWorld(n, lx, ly, lz) {
  const s = n.scale
  const cos = Math.cos(n.ry)
  const sin = Math.sin(n.ry)
  return V(n.pos[0] + s * (lx * cos + lz * sin), n.pos[1] + s * ly, n.pos[2] + s * (-lx * sin + lz * cos))
}
// dust targets = the four signs, then every neighbour window (at the glass)
const EXTRA_WINDOWS = NEIGHBORS.flatMap((n) => LIFE_CELLS[NEIGHBORS.indexOf(n)].map(([lx, ly]) => nbWorld(n, lx, ly, WIN_Z_FACE)))
// signs first, then windows — NeonSign's own idx (0-3) lines up with the
// first 4 entries here, so a sign and its own ignite time always match
const IGNITE_TARGETS = [...NEON_SIGNS.map((s) => V(...s.pos)), ...EXTRA_WINDOWS]
// spread the whole cascade across the dust-travel window right after Build
// disintegrates — a rapid, staggered "the city wakes up" sparkle
const igniteArrive = (idx) => 0.945 + (0.992 - 0.945) * (idx / (IGNITE_TARGETS.length - 1))

// street lamps at the neighbours' feet: bokeh sprites hugging the facades +
// one REAL point light per neighbour so the lamp light actually lands on the
// lower brick (the user called out the old floating fake dots)
const NEIGHBOR_LAMPS = [
  { s: [-1.4, 1.0, 4.9] },
  { s: [-1.7, 1.0, 8.1], L: [-0.6, 1.3, 6.6] },
  { s: [-7.0, 1.0, 12.2], L: [-6.4, 1.3, 13.9] },
  { s: [-7.4, 1.0, 15.6] },
  { s: [-1.7, 1.0, -6.3] },
  { s: [-2.0, 1.0, -9.7], L: [-0.9, 1.3, -8.1] },
  { s: [-9.1, 1.0, -14.3], L: [-8.5, 1.3, -15.9] },
  { s: [-9.4, 1.0, -17.4] },
]

// soft dark radial blob (used as a contact-shadow under each building, so the
// block reads as standing ON the street rather than floating over it)
function makeShadowTexture() {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.6)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.32)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  return tex
}

// footprints for the contact shadows: hero at origin + the four neighbours
// (their blackout box is 6.1×6.1 world units scaled by each neighbour's own
// `scale`, per NeighborCity below)
const CONTACT_SHADOWS = [
  { x: 0, z: 0, r: 5.0 },
  ...NEIGHBORS.map((n) => ({ x: n.pos[0], z: n.pos[2], r: 6.1 * n.scale * 0.78 })),
]

// ---- ACT 4: the dark street the block stands on -----------------------------
// A wide asphalt slab + a concrete sidewalk framing it, fading in with the
// neighbours (same p-gate) so the pull-back settles the whole block into a
// real street instead of floating over the cloud sea. Wet-look asphalt: a lit
// MeshStandardMaterial (low roughness) picks up specular from the street
// lamps + neon glow automatically.
const STREET_CX = -4.6
const STREET_CZ = 1.0
const STREET_W = 30
const STREET_D = 48
const SIDEWALK = 1.5

function StreetBlock({ progressRef }) {
  const shadowTex = useMemo(() => makeShadowTexture(), [])
  const matRefs = useRef([])
  const reg = (m) => { if (m && !matRefs.current.includes(m)) matRefs.current.push(m) }
  useFrame(() => {
    // synced to the golden flash — same gate as NeighborCity, so no naked
    // street shows before the case-study buildings do
    const op = sm(progressRef.current, ACT4_IN, ACT4_IN + 0.08)
    for (const m of matRefs.current) m.opacity = op
  })
  const sx0 = STREET_CX - STREET_W / 2
  const sx1 = STREET_CX + STREET_W / 2
  const sz0 = STREET_CZ - STREET_D / 2
  const sz1 = STREET_CZ + STREET_D / 2
  return (
    <group>
      {/* huge dark ground fallback: at the final wide shot the camera sits
          far past the detailed sidewalk block (x≈27) — without this, its
          edge is visible against the starfield as an ugly floating wedge */}
      <mesh position={[STREET_CX, -0.03, STREET_CZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial ref={reg} color="#0a0b10" roughness={0.7} metalness={0} transparent opacity={0} />
      </mesh>
      {/* asphalt */}
      <mesh position={[STREET_CX, 0.01, STREET_CZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[STREET_W, STREET_D]} />
        <meshStandardMaterial ref={reg} color="#111319" roughness={0.38} metalness={0.06} transparent opacity={0} />
      </mesh>
      {/* concrete sidewalk framing the block, on all four sides */}
      <mesh position={[STREET_CX, 0.02, sz0 + SIDEWALK / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STREET_W, SIDEWALK]} />
        <meshStandardMaterial ref={reg} color="#4a4d57" roughness={0.95} metalness={0} transparent opacity={0} />
      </mesh>
      <mesh position={[STREET_CX, 0.02, sz1 - SIDEWALK / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STREET_W, SIDEWALK]} />
        <meshStandardMaterial ref={reg} color="#4a4d57" roughness={0.95} metalness={0} transparent opacity={0} />
      </mesh>
      <mesh position={[sx0 + SIDEWALK / 2, 0.02, STREET_CZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SIDEWALK, STREET_D - 2 * SIDEWALK]} />
        <meshStandardMaterial ref={reg} color="#4a4d57" roughness={0.95} metalness={0} transparent opacity={0} />
      </mesh>
      <mesh position={[sx1 - SIDEWALK / 2, 0.02, STREET_CZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SIDEWALK, STREET_D - 2 * SIDEWALK]} />
        <meshStandardMaterial ref={reg} color="#4a4d57" roughness={0.95} metalness={0} transparent opacity={0} />
      </mesh>
      {/* contact shadows: ground the buildings visually */}
      {CONTACT_SHADOWS.map((s, i) => (
        <mesh key={i} position={[s.x, 0.03, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[s.r * 2, s.r * 2]} />
          <meshBasicMaterial ref={reg} map={shadowTex} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function NeonSign({ progressRef, idx, pos, word, color, font, size, boardW, poles }) {
  const gRef = useRef()
  const boardRef = useRef()
  const textRef = useRef()
  useFrame(() => {
    const p = progressRef.current
    // ignites as the gold dust from the disintegrating "Build" lands on it
    const a = igniteArrive(idx)
    const ignite = sm(p, a, a + 0.01)
    let op = ignite
    if (ignite > 0 && ignite < 1) {
      const f = Math.sin(p * 4100 + idx * 13.7) * Math.sin(p * 9300 + idx * 5.1)
      op = ignite * (0.2 + 0.8 * (f > -0.3 ? 1 : 0.1))
    }
    if (gRef.current) gRef.current.visible = p > ACT4_IN
    if (boardRef.current) boardRef.current.opacity = 0.85 * ignite
    if (textRef.current) textRef.current.opacity = op
  })
  return (
    <group ref={gRef} position={pos} rotation={[0, Math.PI / 2, 0]} visible={false}>
      <mesh position={[0, 0, -0.06]}>
        <planeGeometry args={[boardW, size * 1.45]} />
        <meshBasicMaterial ref={boardRef} color="#0b0710" transparent opacity={0} />
      </mesh>
      {poles && [-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * boardW * 0.32, -(size * 0.725 + poles / 2), -0.06]}>
          <boxGeometry args={[0.07, poles, 0.07]} />
          <meshBasicMaterial color="#0d0a12" />
        </mesh>
      ))}
      <Text font={font} fontSize={size} anchorX="center" anchorY="middle">
        {word}
        <meshBasicMaterial ref={textRef} color={color} transparent opacity={0} toneMapped={false} />
      </Text>
    </group>
  )
}

function NeighborCity({ progressRef }) {
  const { scene } = useGLTF(BUILDING)
  const clones = useMemo(() => NEIGHBORS.map(() => scene.clone(true)), [scene])
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const s = BUILDING_H / (size.y || 1)
    const c = box.getCenter(new THREE.Vector3())
    return { s, p: [-c.x * s, -box.min.y * s, -c.z * s] }
  }, [scene])
  const groupRef = useRef()
  const glowTex = useMemo(() => makeGlowTexture(), [])
  const lampRefs = useRef([])
  useFrame((state) => {
    // pop in exactly at the golden flash (ACT4_IN) — the burst of light
    // masks the reveal, so the case-study city seems to appear FROM it
    if (groupRef.current) groupRef.current.visible = progressRef.current > ACT4_IN
    for (const s of lampRefs.current) {
      if (!s) continue
      s.quaternion.copy(state.camera.quaternion)
    }
  })
  return (
    <group ref={groupRef} visible={false}>
      {NEIGHBORS.map((n, i) => (
        <group key={i} position={n.pos} rotation={[0, n.ry, 0]} scale={n.scale}>
          <group scale={norm.s} position={norm.p}>
            <primitive object={clones[i]} />
          </group>
          <mesh position={[0, BUILDING_H / 2, 0]}>
            <boxGeometry args={[6.1, BUILDING_H - 0.15, 6.1]} />
            <meshBasicMaterial color="#070406" side={THREE.BackSide} />
          </mesh>
          {/* warm room lights behind the REAL +z window openings — the gold
              dust brings these to life, one by one, so the whole skyline
              looks awake (child of this group, so it inherits pos/ry/scale
              and lines up with the actual windows exactly like the hero) */}
          {LIFE_CELLS[i].map(([lx, ly], j) => (
            <LifeWindow key={j} progressRef={progressRef} arriveIdx={NEON_SIGNS.length + i * LIFE_PER + j} position={[lx, ly, WIN_Z_RECESS]} />
          ))}
        </group>
      ))}
      {NEON_SIGNS.map((s, i) => (
        <NeonSign key={s.word} progressRef={progressRef} idx={i} {...s} />
      ))}
      {NEIGHBOR_LAMPS.map((p, i) => (
        <group key={i}>
          <mesh ref={(m) => { lampRefs.current[i] = m }} position={p.s}>
            <planeGeometry args={[0.7, 0.7]} />
            <meshBasicMaterial map={glowTex} color="#ffb066" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          {p.L && <pointLight position={p.L} intensity={9} distance={9} decay={1.9} color="#ff9a4a" />}
        </group>
      ))}
    </group>
  )
}

// one warm room-light behind a real neighbour window, recessed behind the
// translucent glass so the actual opening frames it — flickers on as the gold
// dust reaches it (a child of the neighbour group: it inherits pos/ry/scale
// and the plane's +z normal already faces the camera-facing wall)
function LifeWindow({ progressRef, arriveIdx, position }) {
  const ref = useRef()
  useFrame(() => {
    const p = progressRef.current
    const a = igniteArrive(arriveIdx)
    const ignite = sm(p, a, a + 0.012)
    let op = ignite
    if (ignite > 0 && ignite < 1) {
      const f = Math.sin(p * 5200 + arriveIdx * 9.3) * Math.sin(p * 8700 + arriveIdx * 3.7)
      op = ignite * (0.3 + 0.7 * (f > -0.4 ? 1 : 0.25))
    }
    if (ref.current) ref.current.opacity = op
  })
  return (
    <mesh position={position}>
      <planeGeometry args={[0.72, 0.9]} />
      <meshBasicMaterial ref={ref} color={[1.75, 1.32, 0.78]} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// the gold dust itself: "Build" disintegrates at BUILD_CENTER_POS and a dense
// swarm of embers flies out along lofted, curved arcs to every ignition
// target (the 4 signs + every neighbour window), each landing in step with its
// target's ignite time — the burst IS what lights the city up. Plus an
// expanding shockwave ring at the instant of the burst for a premium punch.
const DUST_PER_TARGET = 7
const DUST_PARTICLES = IGNITE_TARGETS.flatMap((target, ti) => {
  const arrive = igniteArrive(ti)
  return Array.from({ length: DUST_PER_TARGET }, () => ({
    target,
    arrive: arrive - 0.008 + Math.random() * 0.014,
    // a lofted control point → a curved, organic arc rather than a straight line
    ctrl: new THREE.Vector3((Math.random() - 0.5) * 7, 1.6 + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 7),
  }))
})

function GoldDustBurst({ progressRef }) {
  const dustTex = useMemo(() => makeGlowTexture(), [])
  const pointsRef = useRef()
  const ringRef = useRef()
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_PARTICLES.length * 3), 3))
    return g
  }, [])
  const acc = useMemo(() => new THREE.Vector3(), [])
  const mid = useMemo(() => new THREE.Vector3(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const p = progressRef.current
    const posAttr = geo.attributes.position
    for (let i = 0; i < DUST_PARTICLES.length; i++) {
      const d = DUST_PARTICLES[i]
      const t = sm(p, BUILD_BURST_END, d.arrive)
      const u = 1 - t
      // quadratic bezier: center → (halfway + lofted ctrl) → target
      mid.copy(BUILD_CENTER_POS).lerp(d.target, 0.5).add(d.ctrl)
      acc.copy(BUILD_CENTER_POS).multiplyScalar(u * u)
      tmp.copy(mid).multiplyScalar(2 * u * t)
      acc.add(tmp)
      tmp.copy(d.target).multiplyScalar(t * t)
      acc.add(tmp)
      posAttr.setXYZ(i, acc.x, acc.y, acc.z)
    }
    posAttr.needsUpdate = true
    if (pointsRef.current) {
      const born = sm(p, BUILD_HOLD_END, BUILD_BURST_END)
      const fade = 1 - sm(p, 0.985, 1.0)
      pointsRef.current.material.opacity = born * fade
      pointsRef.current.visible = p > BUILD_HOLD_END - 0.005
    }
    if (ringRef.current) {
      const b = sm(p, BUILD_BURST_END - 0.005, BUILD_BURST_END + 0.03)
      const s = 0.4 + b * 10
      ringRef.current.scale.set(s, s, s)
      ringRef.current.material.opacity = b * (1 - b) * 3.4
      ringRef.current.visible = b > 0.001 && b < 0.999
      ringRef.current.lookAt(state.camera.position)
    }
  })
  return (
    <group>
      <points ref={pointsRef} geometry={geo} visible={false}>
        <pointsMaterial map={dustTex} color={[3, 2.15, 1.05]} size={0.4} sizeAttenuation transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      <mesh ref={ringRef} position={BUILD_CENTER_POS} visible={false}>
        <ringGeometry args={[0.74, 0.86, 56]} />
        <meshBasicMaterial color={[3, 2.4, 1.4]} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---- day → night lighting rig ----------------------------------------------
const KEY_DAY = new THREE.Color('#ffb37a')
const KEY_NIGHT = new THREE.Color('#6b7fc4')
const FILL_DAY = new THREE.Color('#8a7bd8')
const FILL_NIGHT = new THREE.Color('#5a68b4')
const HEMI_SKY_DAY = new THREE.Color('#8a76c8')
const HEMI_SKY_NIGHT = new THREE.Color('#39406b')
const HEMI_GND_DAY = new THREE.Color('#4a3226')
const HEMI_GND_NIGHT = new THREE.Color('#2b1a0c')

function NightLights({ skyRef }) {
  const key = useRef()
  const fill = useRef()
  const hemi = useRef()
  useFrame(() => {
    const n = skyRef?.current?.night ?? 0
    if (key.current) {
      // cool moonlight so the left/back faces don't go pitch black
      key.current.intensity = 2.0 * (1 - n) + 0.55 * n
      key.current.color.lerpColors(KEY_DAY, KEY_NIGHT, n)
    }
    if (fill.current) {
      // this is the light that reaches the RIGHT wall (the Act 3 side)
      fill.current.intensity = 0.45 * (1 - n) + 0.75 * n
      fill.current.color.lerpColors(FILL_DAY, FILL_NIGHT, n)
    }
    if (hemi.current) {
      // warm ground colour at night = the city's glow bouncing up
      hemi.current.intensity = 0.9 * (1 - n) + 0.7 * n
      hemi.current.color.lerpColors(HEMI_SKY_DAY, HEMI_SKY_NIGHT, n)
      hemi.current.groundColor.lerpColors(HEMI_GND_DAY, HEMI_GND_NIGHT, n)
    }
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#8a76c8', '#4a3226', 0.9]} />
      <directionalLight ref={key} position={[-24, 10, -32]} intensity={2.0} color="#ffb37a" />
      <directionalLight ref={fill} position={[20, 8, 18]} intensity={0.45} color="#8a7bd8" />
    </>
  )
}

// ---- street lights — warm sodium lamps waking up with the night -------------
// They live around the base (strongest on the right, where Act 3 plays):
// point lights splash warm pools up the lower brick + a soft glow sprite marks
// each lamp head. Act 5 (the street/phone booth) will grow real poles here.
const LAMPS = [
  [5.6, 1.1, 2.6],
  [5.6, 1.1, -1.8],
  [3.2, 1.1, 5.6],
  [-2.0, 1.1, 5.6],
  [-5.6, 1.1, 1.2],
]
function StreetLights({ skyRef }) {
  const glowTex = useMemo(() => makeGlowTexture(), [])
  const lights = useRef([])
  const sprites = useRef([])
  useFrame(({ camera }) => {
    const n = skyRef?.current?.night ?? 0
    for (const l of lights.current) { if (l) l.intensity = 7 * n }
    for (const s of sprites.current) {
      if (!s) continue
      s.material.opacity = 0.6 * n
      s.quaternion.copy(camera.quaternion)
    }
  })
  return (
    <group>
      {LAMPS.map((p, i) => (
        <group key={i} position={p}>
          <pointLight ref={(l) => { lights.current[i] = l }} intensity={0} distance={7.5} decay={2} color="#ff9a4a" />
          <mesh ref={(s) => { sprites.current[i] = s }}>
            <planeGeometry args={[0.85, 0.85]} />
            <meshBasicMaterial map={glowTex} color="#ffb066" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default function AgencyBuilding({ onClose }) {
  const t = useT()
  const scrollRef = useRef(null)
  const progressRef = useRef(CAM_EDIT ? 1 : CITY_EDIT ? ROOF_HOLD : 0)
  const skyRef = useRef({ night: CAM_EDIT ? 1 : 0 })
  const camEditRef = useRef(loadCamCfg())
  const cityEditRef = useRef(loadCityCfg())
  const [landed, setLanded] = useState(0)

  // scroll → progress (Act 1 spans the whole scroll for now; acts extend later).
  // In camera-edit mode the scene is frozen on the final wide shot instead; in
  // city-edit mode it's frozen on the roof-landing hold, where the backdrop
  // city is actually visible.
  useEffect(() => {
    if (CAM_EDIT) { progressRef.current = 1; skyRef.current.night = 1; return undefined }
    if (CITY_EDIT) { progressRef.current = ROOF_HOLD; skyRef.current.night = 0; return undefined }
    const el = scrollRef.current
    if (!el) return undefined
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const max = el.scrollHeight - el.clientHeight
      const p = max > 0 ? el.scrollTop / max : 0
      progressRef.current = p
      skyRef.current.night = sm(p, NIGHT_IN, NIGHT_OUT) // night falls on the fly-around
      setLanded(sm(p, 0.022, 0.058)) // scroll-hint brightens as we settle on the roof
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="abx">
      <div className="abx__canvas">
        <Canvas
          dpr={[1, 1.6]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [9, 40, 26], fov: 45, near: 0.1, far: 1000 }}
        >
          {/* softens the huge street-ground plane's horizon into the night sky
              instead of a hard line (the dome + clouds opt out via fog={false}) */}
          <fog attach="fog" args={['#0d0f1c', 55, 170]} />
          <NightLights skyRef={skyRef} />
          <StreetLights skyRef={skyRef} />
          <VanillaSky skyRef={skyRef} />
          <CloudField skyRef={skyRef} />
          <Suspense fallback={null}>
            <Building />
            <RoofSign progressRef={progressRef} />
            <RoofBulbs />
            <RoofMasthead progressRef={progressRef} />
            <CityBackdrop progressRef={progressRef} skyRef={skyRef} editRef={CITY_EDIT ? cityEditRef : null} />
            <FloorFacts progressRef={progressRef} />
            <ProcessWindows progressRef={progressRef} />
            <StreetBlock progressRef={progressRef} />
            <NeighborCity progressRef={progressRef} />
            <NeonBuildWord progressRef={progressRef} />
            <GoldDustBurst progressRef={progressRef} />
          </Suspense>
          <CameraRig progressRef={progressRef} editRef={CAM_EDIT ? camEditRef : null} />
          <EffectComposer>
            <Bloom intensity={0.7} luminanceThreshold={0.8} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
          </EffectComposer>
        </Canvas>
      </div>

      {!CAM_EDIT && !CITY_EDIT && <p className="abx__scrollhint" style={{ opacity: 0.5 + 0.5 * landed }}>↓</p>}
      <button type="button" className="abx__back" onClick={() => onClose?.()}>{t(AGENCY.back)}</button>
      <span className="abx__brand">{BRAND.name}</span>
      {CAM_EDIT && <CameraEditor editRef={camEditRef} />}
      {CITY_EDIT && <CityEditor editRef={cityEditRef} />}

      {/* the tall scroll space that drives the whole journey (off in cam/city-edit) */}
      {!CAM_EDIT && !CITY_EDIT && (
        <div className="abx__scroll" ref={scrollRef}>
          <div className="abx__scroll-inner" />
        </div>
      )}
    </div>
  )
}

useGLTF.preload(BUILDING)
useGLTF.preload(CITY_MODEL)
