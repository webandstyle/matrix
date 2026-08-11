import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { singularityState, CODE_DISSOLVE_PARS, CODE_DISSOLVE_FRAG } from './Singularity'

// 3D garden set dressing on the 2D ground plate: grass tufts, flowers, reeds
// and the blossom tree, hand-arranged by the user in the GardenLab editor
// (?garden). Instances live as plain objects; the lab writes localStorage and
// the final arrangement gets baked into DEFAULT_ITEMS. Every instance with a
// wind profile bends per-vertex from its own planted base (see the BEND_*
// shader chunks and GardenModel below) — a real cantilever curve, not a
// whole-object pivot rotation.

export const GARDEN_MODELS = [
  { key: 'grass01', name: 'Fű 1', url: '/assets/models/garden/grass01.glb', wind: 'grass' },
  { key: 'grass02', name: 'Fű 2', url: '/assets/models/garden/grass02.glb', wind: 'grass' },
  { key: 'grass03', name: 'Fű 3', url: '/assets/models/garden/grass03.glb', wind: 'grass' },
  { key: 'grass_dry01', name: 'Száraz fű 1', url: '/assets/models/garden/grass_dry01.glb', wind: 'grass' },
  { key: 'grass_dry02', name: 'Száraz fű 2', url: '/assets/models/garden/grass_dry02.glb', wind: 'grass' },
  { key: 'grass_flowers01', name: 'Virágos fű 1', url: '/assets/models/garden/grass_flowers01.glb', wind: 'grass' },
  { key: 'grass_flowers02', name: 'Virágos fű 2', url: '/assets/models/garden/grass_flowers02.glb', wind: 'grass' },
  { key: 'grass_flowers03', name: 'Virágos fű 3', url: '/assets/models/garden/grass_flowers03.glb', wind: 'grass' },
  { key: 'grass_reeds01', name: 'Nádas', url: '/assets/models/garden/grass_reeds01.glb', wind: 'reeds' },
  { key: 'grasspack', name: 'Fű-csomag', url: '/assets/models/garden/grasspack.glb', wind: 'grass' },
  { key: 'blossoms', name: 'Virágfa', url: '/assets/models/garden/blossoms.glb', wind: 'tree' },
  { key: 'vegflower', name: 'Kerti virág', url: '/assets/models/garden/vegflower.glb', wind: 'flower' },
  { key: 'trawa', name: 'Fűszál-csomó', url: '/assets/models/garden/trawa.glb', wind: 'reeds' },
  { key: 'rhodo', name: 'Rododendron', url: '/assets/models/garden/rhodo.glb', wind: 'shrub' },
  { key: 'lavender', name: 'Levendula', url: '/assets/models/garden/lavender.glb', wind: 'flower' },
  // the photogrammetry marble reads dark; lift = emissive self-glow from its own
  // texture so the stone brightens (keeps the light response, just a lighter base)
  { key: 'statue', name: 'Szobor', url: '/assets/models/garden/statue.glb', lift: 0.35 },
]
const MODEL_BY_KEY = Object.fromEntries(GARDEN_MODELS.map((m) => [m.key, m]))

// Bend-angle profiles in radians — the angle the TIP of each species reaches
// at full sway (see BEND_COMMON: the shader ramps 0 at the planted base up to
// this angle at the top). Flexible blades travel furthest; dense shrubs and
// trees barely yield. A spatially delayed gust is layered over the quiet,
// asynchronous air. Models without an entry here (the statue) never bend.
const WIND_PROFILES = {
  grass: { x: 0.018, z: 0.038, gust: 0.09, speed: 0.9 },
  reeds: { x: 0.024, z: 0.052, gust: 0.12, speed: 0.78 },
  flower: { x: 0.014, z: 0.03, gust: 0.065, speed: 0.66 },
  shrub: { x: 0.006, z: 0.012, gust: 0.028, speed: 0.46 },
  tree: { x: 0.004, z: 0.009, gust: 0.02, speed: 0.34 },
}
// ONE prevailing direction for the whole garden — real wind blows one way at a
// time. Converted per-instance into that instance's own LOCAL space (see
// localWindDir below) before reaching the shader, so this single world bias
// reads as the same real-world wind direction across every plant regardless
// of how each one is individually rotated. Z carries more weight (bends the
// top toward/away left-right on screen — the classic legible "grass in the
// wind" silhouette); X adds a smaller toward/away-camera lean.
const WIND_DIR = { x: 0.5, z: 1 }

// ---- Per-vertex wind bend --------------------------------------------
// Every instance with a WIND_PROFILES entry bends per-vertex in its own
// shader instead of rotating as one rigid whole: the angle ramps from 0 at
// the planted base to the full sway angle at the tip (see BEND_COMMON), so
// the plant visibly curves instead of tipping over like a stiff plank. The
// deformation is injected via onBeforeCompile into GardenModel's own,
// already-cloned material (see GardenModel) — never the shared cached GLTF
// material, so it can never leak into other instances of the same model.

// bottom fraction of the plant's height that stays essentially still (the
// "planted" base) before the bend weight starts ramping up
const BEND_LOCK_FRAC = 0.2

// world WIND_DIR converted into one item's LOCAL space by undoing its own
// yaw/tilt (rx/ry/rz) — the per-vertex bend operates on raw (pre-rotation)
// mesh-local vertices, so without this every instance would appear to bend
// toward a different apparent direction depending on how it's individually
// rotated in the garden
function localWindDir(rx, ry, rz) {
  const q = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(rx || 0),
      THREE.MathUtils.degToRad(ry || 0),
      THREE.MathUtils.degToRad(rz || 0),
      'XYZ',
    ))
    .invert()
  const v = new THREE.Vector3(WIND_DIR.x, 0, WIND_DIR.z).applyQuaternion(q)
  return { x: v.x, z: v.z }
}

// A mesh's transform relative to `root` (its own model, e.g. a GardenModel
// instance), built by multiplying each ancestor's OWN local `.matrix` on the
// way up — deliberately NOT `.matrixWorld`. matrixWorld reflects the object's
// place in the LIVE scene graph, which is only as fresh as the last time the
// renderer walked the whole tree; reading it inside a mount effect races that
// walk (some instances' effects ran before their ancestors' world matrices
// were ever computed, others after) and the outcome differed silently across
// instances — bend uniforms baked from a stale/identity ancestor matrix on
// one item, correct ones on the next, with no visible reason why one instance
// looked bent and the neighbour looked rigid. Walking only `model`'s own
// subtree sidesteps that timing entirely.
function meshLocalToModel(root, node) {
  const chain = []
  for (let n = node; n && n !== root; n = n.parent) chain.unshift(n)
  const m = new THREE.Matrix4()
  for (const c of chain) {
    c.updateMatrix()
    m.multiply(c.matrix)
  }
  return m
}

// uYMin/uYMax come from the WHOLE model's bounding box (mapped into each
// mesh's own local space — see the onBeforeCompile setup in GardenModel),
// never a submesh's own box, so a multi-mesh plant bends as one coherent
// organism instead of each part re-measuring its own 0..1 height.
const BEND_COMMON = /* glsl */ `
  uniform float uBendX;
  uniform float uBendZ;
  uniform float uYMin;
  uniform float uYMax;

  // 0 across the rooted base, then a smoothed (Hermite, cubic) ease up to 1
  // at the tip, squared for an even stronger top-load — deep into the blade
  // barely anything moves, the tip does most of the work.
  float wsBendWeight(float y) {
    float h = clamp((y - uYMin) / max(uYMax - uYMin, 1e-5), 0.0, 1.0);
    float w = smoothstep(${BEND_LOCK_FRAC.toFixed(2)}, 1.0, h);
    return w * w;
  }

  // small-angle rotation only, no translation (safe for both positions,
  // relative to the pivot, and normals) — Z then X, matching the composition
  // order three.js's default XYZ Euler gives the old rotation.x/rotation.z
  vec3 wsBendRotate(vec3 v, float ax, float az) {
    float cz = cos(az), sz = sin(az);
    vec3 q = vec3(v.x * cz - v.y * sz, v.x * sz + v.y * cz, v.z);
    float cx = cos(ax), sx = sin(ax);
    return vec3(q.x, q.y * cx - q.z * sx, q.y * sx + q.z * cx);
  }
`
const BEND_NORMAL = /* glsl */ `
  {
    float w = wsBendWeight(position.y);
    objectNormal = wsBendRotate(objectNormal, uBendX * w, uBendZ * w);
  }
`
const BEND_POSITION = /* glsl */ `
  {
    float w = wsBendWeight(transformed.y);
    vec3 rel = transformed - vec3(0.0, uYMin, 0.0);
    transformed = wsBendRotate(rel, uBendX * w, uBendZ * w) + vec3(0.0, uYMin, 0.0);
  }
`

export const ITEMS_KEY = 'ws-garden-items'
// the baked arrangement (the user sends the lab's JSON and we harden it here —
// user layout v5, 2026-07-15)
export const DEFAULT_ITEMS = [
  { m: 'grass_reeds01', x: 5.91, y: -2.71, z: -2.1, rx: -4, ry: 149, rz: 1, s: 3.75 },
  { m: 'grass_flowers03', x: 1.93, y: -2.86, z: -2.65, rx: 0, ry: 153, rz: 0, s: 2.65 },
  { m: 'grass_flowers02', x: -6.21, y: -2.9, z: -9, rx: 0, ry: -69, rz: 0, s: 3.7 },
  { m: 'grass_flowers03', x: -7.15, y: -3.05, z: -5.35, rx: 0, ry: 0, rz: 0, s: 6.4 },
  { m: 'grass_flowers02', x: -3.53, y: -3.12, z: -7.3, rx: 0, ry: -69, rz: 0, s: 3.7 },
  { m: 'grass_flowers02', x: 1.73, y: -3.63, z: -7.3, rx: 0, ry: -69, rz: 0, s: 3.7 },
  { m: 'grass_reeds01', x: 0.58, y: -3.15, z: -7.4, rx: 0, ry: 0, rz: 0, s: 3.25 },
  { m: 'rhodo', x: 3.5, y: -2.64, z: -2, rx: 0, ry: 0, rz: 0, s: 2.25 },
  { m: 'rhodo', x: 4.37, y: -2.57, z: -2, rx: 0, ry: 0, rz: 0, s: 1.65 },
  { m: 'rhodo', x: 4.77, y: -2.57, z: -2, rx: 0, ry: 0, rz: 0, s: 1.65 },
  { m: 'grass_flowers03', x: -1.86, y: -1.45, z: -2, rx: 0, ry: -61, rz: 0, s: 1.45 },
  { m: 'lavender', x: 2.8, y: -3.35, z: -3.8, rx: 0, ry: 0, rz: 0, s: 2.45 },
  // z pulled from -4.3 to -1.3 — in front of the title's z:-3 plane (see
  // ArrivalScene DEFAULT_CFG.sz) so the statue overlaps the letters too. It
  // needs to sit noticeably closer than the flowers (z≈-2) that already read
  // correctly in front of the text: the statue's own rx:-90/rz:-42 (needed to
  // stand the lying-down photogrammetry scan upright — the GLB's OWN node
  // already carries a baked-in -90° correction on top of that) means its `z`
  // field doesn't map 1:1 to visual depth the way it does for unrotated
  // items — confirmed empirically in the lab, occlusion itself works fine.
  { m: 'statue', x: -5.53, y: -1.6, z: -1.3, rx: -90, ry: 0, rz: -42, s: 3 },
  { m: 'vegflower', x: -4.6, y: -2.85, z: -2, rx: 20, ry: -95, rz: 19, s: 1.85 },
  { m: 'vegflower', x: -2.74, y: -2.85, z: -2, rx: -21, ry: -88, rz: -28, s: 2.05 },
  { m: 'grass_flowers02', x: -3.37, y: -4.03, z: -7.3, rx: 0, ry: -69, rz: 0, s: 3.7 },
  { m: 'vegflower', x: 4.17, y: -2.85, z: -6.75, rx: 0, ry: 0, rz: 14, s: 1.9 },
]

export const LIGHT_KEY = 'ws-garden-light'
// scene light for the garden items (lab-tunable — the models looked washed out
// next to the vividly graded ground plate at the old defaults)
export const DEFAULT_LIGHT = { amb: 1.4, dir: 1.7 }

export function loadLight() {
  try {
    const s = localStorage.getItem(LIGHT_KEY)
    if (s) return { ...DEFAULT_LIGHT, ...JSON.parse(s) }
  } catch {
    // corrupted store — defaults
  }
  return { ...DEFAULT_LIGHT }
}

export function loadItems() {
  try {
    const s = localStorage.getItem(ITEMS_KEY)
    if (s) {
      const arr = JSON.parse(s)
      if (Array.isArray(arr)) return arr.filter((i) => MODEL_BY_KEY[i.m])
    }
  } catch {
    // corrupted store — fall through to the baked set
  }
  return DEFAULT_ITEMS.map((i) => ({ ...i }))
}

let nextId = 1
export function makeItem(key) {
  return { id: nextId++, m: key, x: 0, y: -1.2, z: -2, rx: 0, ry: 0, rz: 0, s: 1 }
}

// ensure loaded/duplicated items always carry unique ids
export function withIds(items) {
  return items.map((i) => ({ ...i, id: i.id ?? nextId++ }))
}

// one model, normalized so its largest dimension is exactly 1 world unit and
// its BOTTOM sits at y=0 — the scale slider means the same for every model and
// items "stand" on their y position
const GardenModel = memo(function GardenModel({ url, lift = 0, bend, singularity }) {
  const { scene } = useGLTF(url)
  const size = useThree((s) => s.size)
  const model = useMemo(() => scene.clone(true), [scene])
  const bendShadersRef = useRef([])
  // every patched material's compiled shader (for the code-dissolve uniforms —
  // superset of bendShadersRef, which is only the bending ones)
  const patchShadersRef = useRef([])
  const bendAngleRef = useRef({ x: 0, z: 0 })
  useEffect(() => {
    // the black "smoke" fog belongs to the hands' entrance — on the garden
    // set dressing it just sinks the colors toward black (the "washed out"
    // complaint), so these materials opt out of it
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return
      // clone the (GLTF-cached, shared) material before touching it
      o.material = o.material.clone()
      o.material.fog = false
      if (lift > 0 && o.material.map) {
        // brighten a dark stone: add its own texture back as gentle self-glow
        o.material.emissiveMap = o.material.map
        o.material.emissive = new THREE.Color(0xffffff)
        o.material.emissiveIntensity = lift
        o.material.needsUpdate = true
      }
    })
  }, [model, lift])
  // Patches THIS instance's already-cloned materials (never the shared
  // cached GLTF ones) to bend per-vertex instead of rotating as one rigid
  // piece. Runs after the effect above so it sees the cloned materials.
  // Deps are the individual bend VALUES (not the `bend` object itself, which
  // is a fresh literal every GardenItems render) so an unrelated re-render
  // (e.g. selecting a different item in the lab) doesn't force a shader
  // recompile on every bending instance in the garden.
  useEffect(() => {
    // build the whole model's box purely from its own geometry + local
    // transforms (see meshLocalToModel) — no dependency on scene-graph
    // attachment/render timing. Only needed when bending.
    const box = new THREE.Box3()
    if (bend) {
      model.traverse((o) => {
        if (!o.isMesh || !o.geometry) return
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        box.union(o.geometry.boundingBox.clone().applyMatrix4(meshLocalToModel(model, o)))
      })
    }
    const bendShaders = []
    const patchShaders = []
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return
      // vertex-displaced geometry can exceed the loader's static bounds —
      // don't let it get frustum-culled while mid-bend at the screen edge
      o.frustumCulled = false
      // this mesh's own local Y range for the SHARED (whole-model) height
      // range above, so multiple submeshes at different heights still bend
      // against one common top/bottom instead of each their own 0..1 slice
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scl = new THREE.Vector3()
      meshLocalToModel(model, o).decompose(pos, quat, scl)
      const yMin = (box.min.y - pos.y) / (scl.y || 1)
      const yMax = (box.max.y - pos.y) / (scl.y || 1)
      o.material.onBeforeCompile = (shader) => {
        // the wind bend (vertex) — only for species with a wind profile
        if (bend) {
          shader.uniforms.uBendX = { value: 0 }
          shader.uniforms.uBendZ = { value: 0 }
          shader.uniforms.uYMin = { value: yMin }
          shader.uniforms.uYMax = { value: yMax }
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `${BEND_COMMON}\n#include <common>`)
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${BEND_NORMAL}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BEND_POSITION}`)
          bendShaders.push(shader)
        }
        // the singularity code-dissolve (fragment) — EVERY garden material, so
        // the plants AND the statue turn into purple code and shatter
        shader.uniforms.uCode = { value: 0 }
        shader.uniforms.uBurst = { value: 0 }
        shader.uniforms.uCodeRes = { value: new THREE.Vector2(1, 1) }
        shader.uniforms.uCodeTime = { value: 0 }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `${CODE_DISSOLVE_PARS}\n#include <common>`)
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${CODE_DISSOLVE_FRAG}`)
        patchShaders.push(shader)
      }
      o.material.needsUpdate = true
    })
    bendShadersRef.current = bendShaders
    patchShadersRef.current = patchShaders
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on primitive values, see comment above
  }, [model, bend?.profile, bend?.seed, bend?.dir?.x, bend?.dir?.z, bend?.gustX, bend?.gustZ])
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    // the singularity code-dissolve — EVERY patched material (plants + statue).
    // Computes the shared post-storm state and pushes uCode/uBurst so the
    // surface resolves into purple code, then erodes away.
    if (patchShadersRef.current.length > 0 && singularity) {
      const storm = singularity.stormRef?.current
      const cfg = singularity.cfgRef?.current
      const preview = singularity.editor && cfg?.sgPreview === 1
      let st = null
      if (preview) st = singularityState(0, cfg, true, cfg?.sgAt ?? 0)
      else if (storm?.triggered && storm.startedAt != null) {
        st = singularityState(t - storm.startedAt, cfg, false)
      }
      const code = st ? st.code : 0
      const burst = st ? st.burst : 0
      for (const sh of patchShadersRef.current) {
        if (!sh.uniforms.uCode) continue
        sh.uniforms.uCode.value = code
        sh.uniforms.uBurst.value = burst
        sh.uniforms.uCodeTime.value = singularity.reduceMotion ? 0 : t
        sh.uniforms.uCodeRes.value.set(size.width, size.height)
      }
    }
    if (!bend || bendShadersRef.current.length === 0) return
    if (bend.reduceMotion) {
      bendAngleRef.current.x = 0
      bendAngleRef.current.z = 0
    } else {
      // same sway/flutter/gust timing as the rigid wind loop below — only
      // WHERE it's applied (per-vertex here) changes, not the rhythm
      const sway = 0.5 + 0.5 * Math.sin(t * bend.profile.speed + bend.seed)
      const flutter = Math.sin(t * bend.profile.speed * 2.37 + bend.seed * 2.13)
      const gustCarrier = Math.max(
        0,
        Math.sin(t * 0.48 - bend.gustX * 0.1 + bend.gustZ * 0.035 + 0.4),
      )
      const gust = Math.pow(gustCarrier, 9) * (0.82 + 0.18 * Math.sin(t * 2.8 + bend.seed))
      const targetX = bend.dir.x * bend.profile.x * sway
        + flutter * bend.profile.x * 0.12
        + gust * bend.profile.gust * 0.28 * bend.dir.x
      const targetZ = bend.dir.z * bend.profile.z * sway
        + flutter * bend.profile.z * 0.12
        + gust * bend.profile.gust * bend.dir.z
      bendAngleRef.current.x = THREE.MathUtils.damp(bendAngleRef.current.x, targetX, 4.5, delta)
      bendAngleRef.current.z = THREE.MathUtils.damp(bendAngleRef.current.z, targetZ, 4.0, delta)
    }
    for (const shader of bendShadersRef.current) {
      shader.uniforms.uBendX.value = bendAngleRef.current.x
      shader.uniforms.uBendZ.value = bendAngleRef.current.z
    }
  })
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const s = 1 / maxDim
    const c = box.getCenter(new THREE.Vector3())
    return { s, p: [-c.x * s, -box.min.y * s, -c.z * s] }
  }, [model])
  return (
    <group scale={norm.s} position={norm.p}>
      <primitive object={model} />
    </group>
  )
})

// the in-canvas layer: renders every instance; in lab mode it also runs the
// select + drag interaction with its own raycaster (same pattern as the pills)
export function GardenItems({ items, selectedId, editorLab, onSelect, onMove, reduceMotion, stormRef, cfgRef, editor }) {
  const { gl, camera } = useThree()
  // shared singularity inputs handed to every model's code-dissolve (stable so
  // the memoized GardenModel isn't churned by it)
  const sgProps = useMemo(
    () => ({ stormRef, cfgRef, editor, reduceMotion }),
    [stormRef, cfgRef, editor, reduceMotion],
  )
  const groupRefs = useRef(new Map())
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selRef = useRef(selectedId)
  selRef.current = selectedId

  useEffect(() => {
    if (!editorLab) return undefined
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const drag = { id: null, dz: 0 }

    const toNdc = (e) => {
      const rect = el.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
    }
    // project the pointer onto the vertical plane z = depth (camera looks -z)
    const pointAtDepth = (depth) => {
      const { origin, direction } = raycaster.ray
      const t = (depth - origin.z) / direction.z
      return origin.clone().add(direction.clone().multiplyScalar(t))
    }
    const pickItem = (e) => {
      toNdc(e)
      raycaster.setFromCamera(ndc, camera)
      let best = null
      for (const [id, group] of groupRefs.current) {
        if (!group) continue
        const hits = raycaster.intersectObject(group, true)
        if (hits.length && (!best || hits[0].distance < best.dist)) {
          best = { id, dist: hits[0].distance }
        }
      }
      return best
    }
    const onDown = (e) => {
      const hit = pickItem(e)
      if (!hit) { onSelect(null); return }
      onSelect(hit.id)
      const item = itemsRef.current.find((i) => i.id === hit.id)
      if (item) drag.id = hit.id
    }
    const onMovePtr = (e) => {
      if (drag.id === null) {
        // hover feedback
        document.body.style.cursor = pickItem(e) ? 'grab' : ''
        return
      }
      const item = itemsRef.current.find((i) => i.id === drag.id)
      if (!item) { drag.id = null; return }
      toNdc(e)
      raycaster.setFromCamera(ndc, camera)
      const p = pointAtDepth(item.z)
      onMove(drag.id, { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })
      document.body.style.cursor = 'grabbing'
    }
    const onUp = () => { drag.id = null }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMovePtr)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMovePtr)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
    }
  }, [editorLab, gl, camera, onSelect, onMove])

  return (
    <>
      {items.map((i) => {
        const profile = WIND_PROFILES[MODEL_BY_KEY[i.m]?.wind]
        return (
          <group
            key={i.id}
            ref={(g) => { if (g) groupRefs.current.set(i.id, g); else groupRefs.current.delete(i.id) }}
            position={[i.x, i.y, i.z]}
          >
            <group
              rotation={[
                THREE.MathUtils.degToRad(i.rx || 0),
                THREE.MathUtils.degToRad(i.ry || 0),
                THREE.MathUtils.degToRad(i.rz || 0),
              ]}
              scale={i.s}
            >
              <GardenModel
                url={MODEL_BY_KEY[i.m].url}
                lift={MODEL_BY_KEY[i.m].lift || 0}
                singularity={sgProps}
                bend={profile ? {
                  profile,
                  seed: i.id * 1.61803398875,
                  dir: localWindDir(i.rx, i.ry, i.rz),
                  gustX: i.x,
                  gustZ: i.z,
                  reduceMotion,
                } : null}
              />
            </group>
            {editorLab && i.id === selectedId && (
              // selection ring at the item's feet
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[0.55, 0.62, 40]} />
                <meshBasicMaterial color="#b79aff" transparent opacity={0.9} depthTest={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

// preload the palette in lab mode so adding feels instant
export function preloadGardenModels() {
  for (const m of GARDEN_MODELS) useGLTF.preload(m.url)
}

function Field({ label, value, min, max, step, onChange }) {
  return (
    <label className="arrival-editor__row">
      <span>{label}: <b>{Math.round(value * 100) / 100}</b></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

// the DOM panel of the lab: palette + selected-item transform + save/copy
export function GardenLabPanel({ items, setItems, selectedId, setSelectedId, light, setLight }) {
  const [note, setNote] = useState('')
  const sel = items.find((i) => i.id === selectedId)
  const patch = (id, p) => {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...p } : i)))
    setNote('')
  }
  const add = (key) => {
    const item = makeItem(key)
    setItems((arr) => [...arr, item])
    setSelectedId(item.id)
    setNote('')
  }
  const duplicate = () => {
    if (!sel) return
    const copy = { ...sel, id: nextId++, x: sel.x + 0.4 }
    setItems((arr) => [...arr, copy])
    setSelectedId(copy.id)
  }
  const remove = () => {
    if (!sel) return
    setItems((arr) => arr.filter((i) => i.id !== sel.id))
    setSelectedId(null)
  }
  const strip = (arr) => arr.map(({ id, ...rest }) => rest)
  return (
    <div className="arrival-editor garden-lab">
      <p className="arrival-editor__title">KERT-LABOR</p>
      <p className="arrival-editor__hint">
        Kattints egy modellre a hozzáadáshoz, a színtérben kattints/húzd az elemeket.
        A mélységet (Z) és a forgatást a csúszkákkal állítod.
      </p>
      <p className="arrival-editor__group">Paletta ({items.length} elem kint)</p>
      <div className="garden-lab__palette">
        {GARDEN_MODELS.map((m) => (
          <button key={m.key} type="button" onClick={() => add(m.key)}>{m.name}</button>
        ))}
      </div>
      <p className="arrival-editor__group">Fény</p>
      <Field label="környezeti fény" value={light.amb} min={0} max={4} step={0.05}
        onChange={(v) => { setLight((l) => ({ ...l, amb: v })); setNote('') }} />
      <Field label="napfény" value={light.dir} min={0} max={5} step={0.05}
        onChange={(v) => { setLight((l) => ({ ...l, dir: v })); setNote('') }} />
      {sel ? (
        <>
          <p className="arrival-editor__group">Kijelölt: {MODEL_BY_KEY[sel.m].name} (#{sel.id})</p>
          <Field label="X (bal/jobb)" value={sel.x} min={-10} max={10} step={0.05} onChange={(v) => patch(sel.id, { x: v })} />
          <Field label="Y (le/fel)" value={sel.y} min={-5} max={4} step={0.05} onChange={(v) => patch(sel.id, { y: v })} />
          <Field label="Z (mélység)" value={sel.z} min={-9} max={4} step={0.05} onChange={(v) => patch(sel.id, { z: v })} />
          <Field label="forgatás Y" value={sel.ry} min={-180} max={180} step={1} onChange={(v) => patch(sel.id, { ry: v })} />
          <Field label="forgatás X" value={sel.rx} min={-90} max={90} step={1} onChange={(v) => patch(sel.id, { rx: v })} />
          <Field label="forgatás Z" value={sel.rz} min={-90} max={90} step={1} onChange={(v) => patch(sel.id, { rz: v })} />
          <Field label="méret" value={sel.s} min={0.05} max={10} step={0.05} onChange={(v) => patch(sel.id, { s: v })} />
          <div className="arrival-editor__actions">
            <button type="button" onClick={duplicate}>Duplikál</button>
            <button type="button" onClick={remove}>Töröl</button>
          </div>
        </>
      ) : (
        <p className="arrival-editor__hint">Nincs kijelölt elem — kattints egyre a színtérben.</p>
      )}
      <div className="arrival-editor__actions">
        <button type="button" onClick={() => {
          localStorage.setItem(ITEMS_KEY, JSON.stringify(strip(items)))
          localStorage.setItem(LIGHT_KEY, JSON.stringify(light))
          setNote('elmentve ✓')
        }}>Mentés</button>
        <button type="button" onClick={() => {
          navigator.clipboard?.writeText(JSON.stringify({ light, items: strip(items) }))
          setNote('vágólapon ✓')
        }}>Másolás</button>
        <button type="button" onClick={() => {
          localStorage.removeItem(ITEMS_KEY)
          localStorage.removeItem(LIGHT_KEY)
          setItems(withIds(DEFAULT_ITEMS.map((i) => ({ ...i }))))
          setLight({ ...DEFAULT_LIGHT })
          setSelectedId(null)
          setNote('alaphelyzet')
        }}>Reset</button>
      </div>
      {note && <p className="arrival-editor__note">{note}</p>}
    </div>
  )
}
