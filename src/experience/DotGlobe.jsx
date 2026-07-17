import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HERO } from '../data/content'
import { useT } from '../i18n/LanguageContext'
import { drawHeadline, TEX_W, TEX_H, PLANE_W, PLANE_H } from './HeadlineBurst'

// the heart of the scene: a "web" icon built from golden dots — meridians +
// parallels like a classic globe glyph. It hides behind the card wall, gets
// revealed by the burn, and as the scroll advances it BREAKS APART — the
// grains scatter outward and then settle into the letters of the headline
// ("From website to web experience."), exactly where the crisp text plane
// fades in to take over.

const R = 1.7
const MERIDIANS = 10
const MERIDIAN_DOTS = 70
const PARALLELS = 6
const PARALLEL_DOTS = 56

// the crisp headline plane lives at world z=1.5 (see HeadlineBurst); this
// group sits at z=-3, so the text targets are at local z = 4.5
const TEXT_LOCAL_Z = 4.5

// global progress windows
const APPEAR_START = 0.15
const APPEAR_END = 0.25
// the break-apart waits for the swirl to fully die (p ~0.42) so the grains
// fly crisp on the black universe, not smeared into the vortex
const MORPH_START = 0.36
const MORPH_END = 0.47
const FADE_START = 0.5
const FADE_END = 0.56

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

function sampleHeadlinePoints(text) {
  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  drawHeadline(canvas, text)
  const data = canvas.getContext('2d').getImageData(0, 0, TEX_W, TEX_H).data
  const pts = []
  for (let y = 0; y < TEX_H; y += 4) {
    for (let x = 0; x < TEX_W; x += 4) {
      if (data[(y * TEX_W + x) * 4 + 3] < 130) continue
      pts.push([
        (x / TEX_W - 0.5) * PLANE_W,
        (0.5 - y / TEX_H) * PLANE_H,
        TEXT_LOCAL_Z,
      ])
    }
  }
  return pts
}

export default function DotGlobe({ progressRef }) {
  const t = useT()
  const text = t(HERO.headline)
  const groupRef = useRef()
  const spin = useRef(0)

  const { geometry, material } = useMemo(() => {
    const rand = seededRandom(7)

    // sphere dots: meridians + parallels — the classic web glyph
    const sphere = []
    const pushDot = (theta, phi) => {
      sphere.push([
        R * Math.sin(theta) * Math.cos(phi),
        R * Math.cos(theta),
        R * Math.sin(theta) * Math.sin(phi),
      ])
    }
    for (let m = 0; m < MERIDIANS; m += 1) {
      const phi = (m / MERIDIANS) * Math.PI * 2
      for (let i = 0; i <= MERIDIAN_DOTS; i += 1) pushDot((i / MERIDIAN_DOTS) * Math.PI, phi)
    }
    for (let p = 1; p <= PARALLELS; p += 1) {
      const theta = (p / (PARALLELS + 1)) * Math.PI
      for (let i = 0; i < PARALLEL_DOTS; i += 1) pushDot(theta, (i / PARALLEL_DOTS) * Math.PI * 2)
    }

    // text targets: sampled glyph pixels, shuffled so neighbouring grains fly
    // to far-apart letters — the reassembly reads chaotic, then snaps legible
    const textPts = sampleHeadlinePoints(text)
    for (let i = textPts.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = textPts[i]
      textPts[i] = textPts[j]
      textPts[j] = tmp
    }

    const positions = []
    const targets = []
    const rands = []
    for (let i = 0; i < sphere.length; i += 1) {
      positions.push(...sphere[i])
      const tp = textPts.length ? textPts[i % textPts.length] : [0, 0, TEXT_LOCAL_Z]
      targets.push(...tp)
      rands.push(rand())
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('aText', new THREE.Float32BufferAttribute(targets, 3))
    geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rands, 1))

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMorph: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aText;
        attribute float aRand;
        uniform float uMorph;
        varying float vRand;
        void main() {
          vRand = aRand;
          // grains depart with a per-dot stagger, puff outward mid-flight
          // (the globe visibly shatters), then settle into the letters
          float local = clamp((uMorph - aRand * 0.3) / 0.7, 0.0, 1.0);
          float e = local * local * (3.0 - 2.0 * local);
          vec3 p = mix(position, aText, e);
          p += normalize(position) * sin(e * 3.14159) * (0.5 + aRand * 1.3);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (3.6 + aRand * 2.6) * (12.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vRand;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          float soft = 1.0 - smoothstep(0.05, 0.25, d);
          gl_FragColor = vec4(0.878, 0.761, 0.498, uOpacity * (0.55 + soft * 0.45));
        }
      `,
    })

    return { geometry: geo, material: mat }
  }, [text])

  useFrame((state, delta) => {
    const p = progressRef.current
    const morph = THREE.MathUtils.smoothstep(p, MORPH_START, MORPH_END)
    const appear = THREE.MathUtils.smoothstep(p, APPEAR_START, APPEAR_END)
    const fade = 1 - THREE.MathUtils.smoothstep(p, FADE_START, FADE_END)

    material.uniforms.uMorph.value = morph
    material.uniforms.uOpacity.value = appear * fade

    if (groupRef.current) {
      // the globe spins while whole; the rotation unwinds as it shatters so
      // the assembled sentence ends up facing the camera dead-on
      spin.current += delta * 0.4 * (1 - morph)
      groupRef.current.rotation.y = spin.current * (1 - morph)
      groupRef.current.visible = appear * fade > 0.001
    }
  })

  return (
    <group ref={groupRef} position={[0, 0, -3]}>
      <points geometry={geometry} material={material} />
    </group>
  )
}
