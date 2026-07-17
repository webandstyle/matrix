import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HERO } from '../data/content'
import { useT } from '../i18n/LanguageContext'

// the final headline lives INSIDE the 3D scene: it fades in on the black
// universe after the burn, then on further scroll it pixelates apart — every
// sampled glyph pixel becomes a particle that scatters into space until the
// text annihilates and leaves pure black for the terminal to boot on.

// global progress windows
const APPEAR_START = 0.48
const APPEAR_END = 0.53
const BURST_START = 0.55
const BURST_END = 0.62

export const TEX_W = 1600
export const TEX_H = 300
export const PLANE_W = 8.4
export const PLANE_H = PLANE_W * (TEX_H / TEX_W)
const SAMPLE_STEP = 3

function smoothstep(x, a, b) {
  return THREE.MathUtils.smoothstep(x, a, b)
}

export function drawHeadline(canvas, text) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#f6efe2'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = 130
  ctx.font = `500 ${size}px "Space Grotesk", Inter, sans-serif`
  while (ctx.measureText(text).width > canvas.width * 0.94 && size > 40) {
    size -= 6
    ctx.font = `500 ${size}px "Space Grotesk", Inter, sans-serif`
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)
}

export default function HeadlineBurst({ progressRef }) {
  const t = useT()
  const text = t(HERO.headline)
  const planeMatRef = useRef()
  const pointsRef = useRef()
  const planeRef = useRef()

  const { texture, geometry, pointsMaterial, canvas } = useMemo(() => {
    const cnv = document.createElement('canvas')
    cnv.width = TEX_W
    cnv.height = TEX_H
    drawHeadline(cnv, text)

    const tex = new THREE.CanvasTexture(cnv)
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 4

    // sample glyph pixels → particle start positions
    const ctx = cnv.getContext('2d')
    const data = ctx.getImageData(0, 0, TEX_W, TEX_H).data
    const starts = []
    const dirs = []
    const rands = []
    for (let y = 0; y < TEX_H; y += SAMPLE_STEP) {
      for (let x = 0; x < TEX_W; x += SAMPLE_STEP) {
        if (data[(y * TEX_W + x) * 4 + 3] < 130) continue
        const wx = (x / TEX_W - 0.5) * PLANE_W
        const wy = (0.5 - y / TEX_H) * PLANE_H
        starts.push(wx, wy, 0)
        const a = Math.random() * Math.PI * 2
        const up = Math.random() * 1.4 - 0.2
        const spd = 0.6 + Math.random() * 2.6
        dirs.push(Math.cos(a) * spd, Math.sin(a) * spd * 0.7 + up, (Math.random() - 0.3) * 2.2)
        rands.push(Math.random())
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(starts, 3))
    geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 3))
    geo.setAttribute('aRand', new THREE.Float32BufferAttribute(rands, 1))

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
        uPixel: { value: 6.0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aDir;
        attribute float aRand;
        uniform float uProgress;
        uniform float uPixel;
        varying float vRand;
        void main() {
          vRand = aRand;
          // each particle departs at a slightly different moment — the text
          // erodes rather than exploding all at once
          float local = clamp((uProgress - aRand * 0.35) / 0.65, 0.0, 1.0);
          float e = local * local * (3.0 - 2.0 * local);
          vec3 p = position + aDir * e * 3.4;
          p.y -= e * e * 1.1; // slight gravity at the end of the flight
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPixel * (300.0 / -mv.z) * (1.0 - e * 0.55) / 100.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProgress;
        uniform float uOpacity;
        varying float vRand;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          if (dot(c, c) > 0.25) discard;
          float local = clamp((uProgress - vRand * 0.35) / 0.65, 0.0, 1.0);
          float a = uOpacity * (1.0 - local * local * local);
          gl_FragColor = vec4(0.965, 0.937, 0.886, a);
        }
      `,
    })

    return { texture: tex, geometry: geo, pointsMaterial: mat, canvas: cnv }
  }, [text])

  // redraw once the display font is actually loaded (canvas may have rendered
  // with the serif fallback on first paint)
  useEffect(() => {
    let alive = true
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!alive) return
        drawHeadline(canvas, text)
        texture.needsUpdate = true
      })
    }
    return () => {
      alive = false
    }
  }, [canvas, texture, text])

  useFrame(() => {
    const p = progressRef.current
    const appear = smoothstep(p, APPEAR_START, APPEAR_END)
    const burst = smoothstep(p, BURST_START, BURST_END)

    if (planeRef.current && planeMatRef.current) {
      planeRef.current.visible = burst < 0.001 && appear > 0.001
      planeMatRef.current.opacity = appear
    }
    if (pointsRef.current) {
      pointsRef.current.visible = burst > 0.001
      pointsMaterial.uniforms.uProgress.value = burst
      pointsMaterial.uniforms.uOpacity.value = appear
    }
  })

  return (
    <group position={[0, 0, 1.5]}>
      <mesh ref={planeRef} visible={false}>
        <planeGeometry args={[PLANE_W, PLANE_H]} />
        <meshBasicMaterial
          ref={planeMatRef}
          map={texture}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <points ref={pointsRef} geometry={geometry} material={pointsMaterial} visible={false} />
    </group>
  )
}
