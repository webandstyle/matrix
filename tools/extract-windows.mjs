import { chromium } from 'playwright-core'
import path from 'node:path'

const executablePath = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe')
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()
page.on('console', (m) => console.log('[page]', m.text()))
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' })

const result = await page.evaluate(async () => {
  const THREE = await import('https://esm.sh/three@0.166.0')
  const { GLTFLoader } = await import('https://esm.sh/three@0.166.0/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new GLTFLoader().loadAsync('/assets/models/building.glb')
  const scene = gltf.scene
  scene.updateMatrixWorld(true)

  // same normalization as <Building/>: height → 11, centre X/Z, base on y=0
  const BUILDING_H = 11
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const s = BUILDING_H / (size.y || 1)
  const c = box.getCenter(new THREE.Vector3())
  const off = { x: -c.x * s, y: -box.min.y * s, z: -c.z * s }

  const mats = new Set()
  const pts = []
  const v = new THREE.Vector3()
  scene.traverse((o) => {
    if (!o.isMesh) return
    const list = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of list) mats.add(m.name)
    const winIdx = list.findIndex((m) => /window|glass|uveg/i.test(m.name))
    if (winIdx < 0) return
    const geo = o.geometry
    const pos = geo.attributes.position
    // limit to the group belonging to the window material (if grouped)
    const ranges = []
    if (geo.groups && geo.groups.length && Array.isArray(o.material)) {
      for (const g of geo.groups) if (g.materialIndex === winIdx) ranges.push([g.start, g.start + g.count])
    } else {
      ranges.push([0, geo.index ? geo.index.count : pos.count])
    }
    const idx = geo.index
    for (const [a, b] of ranges) {
      for (let i = a; i < b; i++) {
        const vi = idx ? idx.getX(i) : i
        v.fromBufferAttribute(pos, vi).applyMatrix4(o.matrixWorld)
        pts.push([v.x * s + off.x, v.y * s + off.y, v.z * s + off.z])
      }
    }
  })

  // right wall = max-x band
  let maxX = -Infinity
  for (const p of pts) maxX = Math.max(maxX, p[0])
  const wall = pts.filter((p) => p[0] > maxX - 0.25)

  // cluster on (y,z)
  const clusters = []
  for (const p of wall) {
    let best = null
    for (const cl of clusters) {
      if (Math.abs(cl.cy - p[1]) < 0.45 && Math.abs(cl.cz - p[2]) < 0.35) { best = cl; break }
    }
    if (!best) {
      best = { n: 0, cy: p[1], cz: p[2], minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9, maxX: -1e9 }
      clusters.push(best)
    }
    best.n++
    best.cy += (p[1] - best.cy) / best.n
    best.cz += (p[2] - best.cz) / best.n
    best.minY = Math.min(best.minY, p[1]); best.maxY = Math.max(best.maxY, p[1])
    best.minZ = Math.min(best.minZ, p[2]); best.maxZ = Math.max(best.maxZ, p[2])
    best.maxX = Math.max(best.maxX, p[0])
  }
  clusters.sort((a, b) => a.cy - b.cy || a.cz - b.cz)
  return {
    materials: [...mats],
    totalWindowPts: pts.length,
    wallMaxX: maxX,
    clusters: clusters.map((cl) => ({
      y: +cl.cy.toFixed(3), z: +cl.cz.toFixed(3),
      w: +(cl.maxZ - cl.minZ).toFixed(3), h: +(cl.maxY - cl.minY).toFixed(3),
      x: +cl.maxX.toFixed(3), n: cl.n,
    })),
  }
})

console.log(JSON.stringify(result, null, 1))
await browser.close()
