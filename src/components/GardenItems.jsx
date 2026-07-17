import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// 3D garden set dressing on the 2D ground plate: grass tufts, flowers, reeds
// and the blossom tree, hand-arranged by the user in the GardenLab editor
// (?garden). Instances live as plain objects; the lab writes localStorage and
// the final arrangement gets baked into DEFAULT_ITEMS. Wind motion comes later.

export const GARDEN_MODELS = [
  { key: 'grass01', name: 'Fű 1', url: '/assets/models/garden/grass01.glb' },
  { key: 'grass02', name: 'Fű 2', url: '/assets/models/garden/grass02.glb' },
  { key: 'grass03', name: 'Fű 3', url: '/assets/models/garden/grass03.glb' },
  { key: 'grass_dry01', name: 'Száraz fű 1', url: '/assets/models/garden/grass_dry01.glb' },
  { key: 'grass_dry02', name: 'Száraz fű 2', url: '/assets/models/garden/grass_dry02.glb' },
  { key: 'grass_flowers01', name: 'Virágos fű 1', url: '/assets/models/garden/grass_flowers01.glb' },
  { key: 'grass_flowers02', name: 'Virágos fű 2', url: '/assets/models/garden/grass_flowers02.glb' },
  { key: 'grass_flowers03', name: 'Virágos fű 3', url: '/assets/models/garden/grass_flowers03.glb' },
  { key: 'grass_reeds01', name: 'Nádas', url: '/assets/models/garden/grass_reeds01.glb' },
  { key: 'grasspack', name: 'Fű-csomag', url: '/assets/models/garden/grasspack.glb' },
  { key: 'blossoms', name: 'Virágfa', url: '/assets/models/garden/blossoms.glb' },
  { key: 'vegflower', name: 'Kerti virág', url: '/assets/models/garden/vegflower.glb' },
  { key: 'trawa', name: 'Fűszál-csomó', url: '/assets/models/garden/trawa.glb' },
  { key: 'rhodo', name: 'Rododendron', url: '/assets/models/garden/rhodo.glb' },
  { key: 'lavender', name: 'Levendula', url: '/assets/models/garden/lavender.glb' },
  // the photogrammetry marble reads dark; lift = emissive self-glow from its own
  // texture so the stone brightens (keeps the light response, just a lighter base)
  { key: 'statue', name: 'Szobor', url: '/assets/models/garden/statue.glb', lift: 0.35 },
]
const MODEL_BY_KEY = Object.fromEntries(GARDEN_MODELS.map((m) => [m.key, m]))

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
  { m: 'statue', x: -5.53, y: -1.6, z: -4.3, rx: -90, ry: 0, rz: -42, s: 3 },
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
const GardenModel = memo(function GardenModel({ url, lift = 0 }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => scene.clone(true), [scene])
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
export function GardenItems({ items, selectedId, editorLab, onSelect, onMove }) {
  const { gl, camera } = useThree()
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
      {items.map((i) => (
        <group
          key={i.id}
          ref={(g) => { if (g) groupRefs.current.set(i.id, g); else groupRefs.current.delete(i.id) }}
          position={[i.x, i.y, i.z]}
          rotation={[
            THREE.MathUtils.degToRad(i.rx || 0),
            THREE.MathUtils.degToRad(i.ry || 0),
            THREE.MathUtils.degToRad(i.rz || 0),
          ]}
          scale={i.s}
        >
          <GardenModel url={MODEL_BY_KEY[i.m].url} lift={MODEL_BY_KEY[i.m].lift || 0} />
          {editorLab && i.id === selectedId && (
            // selection ring at the item's feet
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.55, 0.62, 40]} />
              <meshBasicMaterial color="#b79aff" transparent opacity={0.9} depthTest={false} />
            </mesh>
          )}
        </group>
      ))}
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
