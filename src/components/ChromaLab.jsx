import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import * as THREE from 'three'
import { ChromaEnv, enhanceChromaMaterials } from './ChromaJourney'

// ?chroma — an ISOLATED preview lab for the "Chromatic Journey" GLB
// (Sketchfab, Tycho Magnetic Anomaly, CC-BY-4.0). Does NOT touch the live
// journey / TubeRide. Three modes:
//   • Inspect — OrbitControls, see the object, scrub its baked sway.
//   • Portál  — camera flies straight through the ring's hole (a "portal pass").
//   • Belső   — camera rides INSIDE the donut's tube, around the ring: a real
//               chromatic tunnel ride (this is the direction we're pursuing).
// The model is a compact chromatic torus/donut (~1.4u across, thin axis = X);
// its baked animation is only a gentle sway, so the travel is OUR camera path.

const URL = '/assets/models/chromatic_journey.glb'

function ChromaModel({ params, scrubRef, playingRef, speedRef, modeRef, rideBakedRef, onInfo }) {
  const { scene, animations } = useGLTF(URL)
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene])
  const dur = animations[0]?.duration || 1
  // centre the model at the origin so the wrapper rot/scale pivot on its middle
  const center = useMemo(() => {
    enhanceChromaMaterials(scene)
    const c = new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3())
    return [c.x, c.y, c.z]
  }, [scene])

  useEffect(() => {
    const s = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    onInfo?.({ size: [s.x, s.y, s.z].map((v) => +v.toFixed(2)), dur: +dur.toFixed(2), tris: '≈185k (opt)' })
  }, [scene, dur, onInfo])

  useEffect(() => {
    if (!animations[0]) return
    const action = mixer.clipAction(animations[0])
    action.play()
    return () => { mixer.stopAllAction() }
  }, [mixer, animations])

  useFrame((_, delta) => {
    // In the ride modes the DONUT stays still — only the camera moves (the
    // baked "sway" would make the model drift, which is disorienting). It only
    // animates in Inspect, or if the user opts into the sway during a ride.
    if (modeRef.current !== 'inspect' && !rideBakedRef.current) {
      mixer.setTime(0)
      return
    }
    if (playingRef.current || (modeRef.current !== 'inspect' && rideBakedRef.current)) {
      mixer.update(delta * speedRef.current)
      scrubRef.current = ((mixer.time % dur) / dur + 1) % 1
    } else {
      mixer.setTime(scrubRef.current * dur)
    }
  })

  const p = params
  return (
    <group rotation={[p.mrx, p.mry, p.mrz]} scale={p.mscale}>
      <group position={[-center[0], -center[1], -center[2]]}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

// PORTAL camera: straight dolly +Z → -Z through the ring's hole as t goes 0→1.
function PortalCamera({ activeRef, tRef, params, onCam }) {
  const { camera } = useThree()
  const last = useRef(0)
  useFrame(({ clock }) => {
    if (!activeRef.current) return
    camera.up.set(0, 1, 0)
    const z = THREE.MathUtils.lerp(params.zStart, params.zEnd, tRef.current)
    camera.position.set(params.camX, params.camY, z)
    camera.lookAt(params.camX, params.camY, z + params.lookDir)
    const now = clock.elapsedTime
    if (now - last.current > 0.15) { last.current = now; onCam?.([+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)]) }
  })
  return null
}

// INSIDE-RIDE camera: rides the donut's tube centreline (a circle in the model's
// YZ plane, symmetry axis = X) as t goes 0→1, looking along the tube (tangent).
// Everything is transformed by the SAME wrapper rotation+scale the model uses,
// so the path stays inside the tube no matter how the donut is oriented.
function InsideRideCamera({ activeRef, tRef, params, onCam }) {
  const { camera } = useThree()
  const last = useRef(0)
  const q = useMemo(() => new THREE.Quaternion(), [])
  const qRoll = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const tan = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    if (!activeRef.current) return
    const { mrx, mry, mrz, mscale, rideR, rideLoops, ridePhase, rollTurns } = params
    e.set(mrx, mry, mrz); q.setFromEuler(e)
    const theta = tRef.current * Math.PI * 2 * rideLoops + ridePhase
    const c = Math.cos(theta), s = Math.sin(theta)
    pos.set(0, rideR * c, rideR * s).multiplyScalar(mscale).applyQuaternion(q)  // tube centreline point
    tan.set(0, -s, c).applyQuaternion(q).normalize()                            // travel tangent
    up.set(1, 0, 0).applyQuaternion(q)                                          // torus axis = camera up
    // ROLL: spin the camera around its forward (travel) axis as we advance —
    // opposite the ring's apparent counter-clockwise flow, so it reads as a
    // vortex rush. rollTurns = full turns across the whole ride (sign = dir).
    if (rollTurns) {
      qRoll.setFromAxisAngle(tan, tRef.current * rollTurns * Math.PI * 2)
      up.applyQuaternion(qRoll)
    }
    camera.up.copy(up)
    camera.position.copy(pos)
    camera.lookAt(look.copy(pos).add(tan))
    const now = clock.elapsedTime
    if (now - last.current > 0.15) { last.current = now; onCam?.([+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)]) }
  })
  return null
}

function InspectCamReadout({ onCam }) {
  const { camera } = useThree()
  const last = useRef(0)
  useFrame(({ clock }) => {
    camera.up.set(0, 1, 0)
    const t = clock.elapsedTime
    if (t - last.current < 0.15) return
    last.current = t
    onCam?.([+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)])
  })
  return null
}

const DEFAULT_PARAMS = {
  // model wrapper (self-similar for the inside ride, so mainly cosmetic there)
  mrx: 0, mry: 1.5708, mrz: 0, mscale: 6,
  // portal dolly
  zStart: 8, zEnd: -8, camX: 0, camY: 0, lookDir: -1,
  // inside ride — rideR is where in the tube cross-section we sit (the tube
  // centreline is ~0.5 in model-local units): smaller drifts toward the hole,
  // larger toward the outer wall
  // baked from live tuning (mirrors ChromaJourney.jsx production values)
  rideR: 0.39, rideLoops: 1, ridePhase: 0, rollTurns: 2.1,
}

export default function ChromaLab() {
  const scrubRef = useRef(0)
  const playingRef = useRef(true)
  const speedRef = useRef(1)
  const progressTRef = useRef(0)
  const modeRef = useRef('inspect')
  const rideBakedRef = useRef(false)

  const [mode, setMode] = useState('inspect') // inspect | portal | inside
  const [rideBaked, setRideBaked] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [scrub, setScrub] = useState(0)
  const [progressT, setProgressT] = useState(0)
  const [flying, setFlying] = useState(false)
  const [flyDur, setFlyDur] = useState(8)
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [cam, setCam] = useState([0, 0, 6])
  const [info, setInfo] = useState(null)
  const [fov] = useState(75)
  const [showGrid, setShowGrid] = useState(true)
  const [envIntensity, setEnvIntensity] = useState(0.2)
  const [exposure, setExposure] = useState(0.92)
  const [bloom, setBloom] = useState(0.3)
  const [bloomThreshold, setBloomThreshold] = useState(0.56)
  const [aberration, setAberration] = useState(0.0058)

  useEffect(() => { playingRef.current = playing }, [playing])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { rideBakedRef.current = rideBaked }, [rideBaked])
  useEffect(() => { progressTRef.current = progressT }, [progressT])

  useEffect(() => {
    let raf = 0
    const tick = () => { raf = requestAnimationFrame(tick); if (playingRef.current) setScrub(scrubRef.current) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // auto-fly: ramp progressT 0→1 over flyDur seconds (drives portal & inside)
  useEffect(() => {
    if (!flying) return
    let raf = 0
    let start = null
    const tick = (ts) => {
      if (start == null) start = ts
      const t = Math.min(1, (ts - start) / (flyDur * 1000))
      progressTRef.current = t
      setProgressT(t)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setFlying(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [flying, flyDur])

  const setP = (k, v) => setParams((p) => ({ ...p, [k]: v }))
  const portalActive = useRef(false)
  const insideActive = useRef(false)
  useEffect(() => { portalActive.current = mode === 'portal'; insideActive.current = mode === 'inside' }, [mode])

  const rowS = { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 9 }
  const label = { fontSize: 11, letterSpacing: '0.03em', color: '#9fb' }
  const btn = (on) => ({ padding: '6px 9px', background: on ? '#3a2a6a' : '#1a1030', color: '#e8e0ff', border: '1px solid #3a2a5a', borderRadius: 6, cursor: 'pointer', fontSize: 12 })
  const grp = { fontSize: 11, letterSpacing: '0.08em', color: '#c8a0ff', margin: '12px 0 6px', borderTop: '1px solid #2a1a4a', paddingTop: 8 }

  const isRide = mode === 'portal' || mode === 'inside'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05030a' }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 6], fov, near: 0.001, far: 1000 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <color attach="background" args={['#05030a']} />
        <ambientLight intensity={0.12} />
        <ChromaEnv intensity={envIntensity} exposure={exposure} />
        <Suspense fallback={null}>
          <ChromaModel params={params} scrubRef={scrubRef} playingRef={playingRef} speedRef={speedRef} modeRef={modeRef} rideBakedRef={rideBakedRef} onInfo={setInfo} />
        </Suspense>
        {showGrid && mode === 'inspect' && <gridHelper args={[20, 40, '#332255', '#160f28']} />}
        {showGrid && mode === 'inspect' && <axesHelper args={[3]} />}
        <PortalCamera activeRef={portalActive} tRef={progressTRef} params={params} onCam={setCam} />
        <InsideRideCamera activeRef={insideActive} tRef={progressTRef} params={params} onCam={setCam} />
        {mode === 'inspect' && <InspectCamReadout onCam={setCam} />}
        {mode === 'inspect' && <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />}
        <EffectComposer>
          <Bloom intensity={bloom} luminanceThreshold={bloomThreshold} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
          <ChromaticAberration offset={[aberration, aberration]} radialModulation={false} modulationOffset={0} />
        </EffectComposer>
      </Canvas>

      <div style={{ position: 'fixed', top: 16, right: 16, width: 272, padding: 16, background: 'rgba(10,6,20,0.94)', border: '1px solid #2a1a4a', borderRadius: 10, color: '#e8e0ff', fontFamily: 'monospace', maxHeight: '94vh', overflowY: 'auto' }}>
        <p style={{ fontSize: 13, letterSpacing: '0.08em', marginBottom: 4 }}>CHROMATIC JOURNEY — teszt</p>
        <p style={{ fontSize: 10, color: '#8a7aaa', marginBottom: 12 }}>Sketchfab / Tycho Magnetic Anomaly · CC-BY-4.0</p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button style={btn(mode === 'inspect')} onClick={() => setMode('inspect')}>Inspect</button>
          <button style={btn(mode === 'portal')} onClick={() => setMode('portal')}>Portál</button>
          <button style={btn(mode === 'inside')} onClick={() => setMode('inside')}>Belső utazás</button>
        </div>

        <p style={grp}>FÉNY / TEXTÚRA (Sketchfab-hoz igazítás)</p>
        <div style={rowS}>
          <span style={label}>environment intenzitás: {envIntensity.toFixed(2)}</span>
          <input id="envI" type="range" min={0} max={2} step={0.02} value={envIntensity} onChange={(e) => setEnvIntensity(Number(e.target.value))} />
          <span style={{ fontSize: 9, color: '#8a7aaa' }}>(kisebb = sötétebb fémfelület, mint Sketchfabon)</span>
        </div>
        <div style={rowS}>
          <span style={label}>expozíció: {exposure.toFixed(2)}</span>
          <input id="expo" type="range" min={0.2} max={2} step={0.02} value={exposure} onChange={(e) => setExposure(Number(e.target.value))} />
        </div>
        <div style={rowS}>
          <span style={label}>neon glow (bloom): {bloom.toFixed(2)}</span>
          <input type="range" min={0} max={3} step={0.05} value={bloom} onChange={(e) => setBloom(Number(e.target.value))} />
        </div>
        <div style={rowS}>
          <span style={label}>glow küszöb: {bloomThreshold.toFixed(2)}</span>
          <input type="range" min={0} max={1} step={0.01} value={bloomThreshold} onChange={(e) => setBloomThreshold(Number(e.target.value))} />
          <span style={{ fontSize: 9, color: '#8a7aaa' }}>(magasabb = csak a legfényesebb neon izzik)</span>
        </div>
        <div style={rowS}>
          <span style={label}>VHS szétcsúszás (chromatic aberration): {aberration.toFixed(4)}</span>
          <input type="range" min={0} max={0.01} step={0.0002} value={aberration} onChange={(e) => setAberration(Number(e.target.value))} />
          <span style={{ fontSize: 9, color: '#8a7aaa' }}>(RGB szétválás a neon szélein)</span>
        </div>

        {isRide && (
          <>
            <p style={grp}>{mode === 'inside' ? 'BELSŐ UTAZÁS' : 'PORTÁL — átrepülés'}</p>
            <div style={rowS}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn(flying)} onClick={() => { progressTRef.current = 0; setProgressT(0); setFlying(true) }}>▶ Utazás</button>
                <button style={btn(false)} onClick={() => { setFlying(false); progressTRef.current = 0; setProgressT(0) }}>⟲</button>
              </div>
            </div>
            <div style={rowS}>
              <span style={label}>pozíció: {progressT.toFixed(3)}</span>
              <input id="progressT" type="range" min={0} max={1} step={0.001} value={progressT}
                onChange={(e) => { const v = Number(e.target.value); progressTRef.current = v; setProgressT(v); setFlying(false) }} />
            </div>
            <div style={rowS}>
              <span style={label}>utazás hossza: {flyDur.toFixed(1)}s</span>
              <input type="range" min={2} max={20} step={0.5} value={flyDur} onChange={(e) => setFlyDur(Number(e.target.value))} />
            </div>

            {mode === 'inside' && (
              <>
                <p style={grp}>CSŐ pálya</p>
                <div style={rowS}>
                  <span style={label}>sugár a csőben: {params.rideR.toFixed(3)}</span>
                  <input id="rideR" type="range" min={0.05} max={0.95} step={0.005} value={params.rideR} onChange={(e) => setP('rideR', Number(e.target.value))} />
                  <span style={{ fontSize: 9, color: '#8a7aaa' }}>(kisebb = lyuk felé, nagyobb = külső fal felé)</span>
                </div>
                <div style={rowS}>
                  <span style={label}>körök száma: {params.rideLoops.toFixed(2)}</span>
                  <input type="range" min={0.25} max={3} step={0.05} value={params.rideLoops} onChange={(e) => setP('rideLoops', Number(e.target.value))} />
                </div>
                <div style={rowS}>
                  <span style={label}>kezdő szög: {params.ridePhase.toFixed(2)}</span>
                  <input type="range" min={0} max={6.2832} step={0.05} value={params.ridePhase} onChange={(e) => setP('ridePhase', Number(e.target.value))} />
                </div>
                <div style={rowS}>
                  <span style={label}>kamera pörgés: {params.rollTurns.toFixed(2)} fordulat</span>
                  <input id="rollTurns" type="range" min={-6} max={6} step={0.1} value={params.rollTurns} onChange={(e) => setP('rollTurns', Number(e.target.value))} />
                  <span style={{ fontSize: 9, color: '#8a7aaa' }}>(előjel = irány; 0 = nincs pörgés)</span>
                </div>
              </>
            )}

            {mode === 'portal' && (
              <>
                <p style={grp}>KAMERA pálya</p>
                <div style={rowS}>
                  <span style={label}>start Z: {params.zStart.toFixed(1)}</span>
                  <input type="range" min={1} max={20} step={0.5} value={params.zStart} onChange={(e) => setP('zStart', Number(e.target.value))} />
                </div>
                <div style={rowS}>
                  <span style={label}>end Z: {params.zEnd.toFixed(1)}</span>
                  <input type="range" min={-20} max={-1} step={0.5} value={params.zEnd} onChange={(e) => setP('zEnd', Number(e.target.value))} />
                </div>
              </>
            )}

            <p style={grp}>DONUT igazítás</p>
            <div style={rowS}>
              <span style={label}>forgatás X: {params.mrx.toFixed(2)}</span>
              <input type="range" min={-3.1416} max={3.1416} step={0.01} value={params.mrx} onChange={(e) => setP('mrx', Number(e.target.value))} />
            </div>
            <div style={rowS}>
              <span style={label}>forgatás Y: {params.mry.toFixed(2)}</span>
              <input type="range" min={-3.1416} max={3.1416} step={0.01} value={params.mry} onChange={(e) => setP('mry', Number(e.target.value))} />
            </div>
            <div style={rowS}>
              <span style={label}>forgatás Z: {params.mrz.toFixed(2)}</span>
              <input type="range" min={-3.1416} max={3.1416} step={0.01} value={params.mrz} onChange={(e) => setP('mrz', Number(e.target.value))} />
            </div>
            <div style={rowS}>
              <span style={label}>méret: {params.mscale.toFixed(1)}×</span>
              <input type="range" min={1} max={20} step={0.5} value={params.mscale} onChange={(e) => setP('mscale', Number(e.target.value))} />
            </div>
            <label style={{ ...label, display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <input type="checkbox" checked={rideBaked} onChange={(e) => setRideBaked(e.target.checked)} /> modell ringása utazás közben
            </label>
          </>
        )}

        {mode === 'inspect' && (
          <>
            <p style={grp}>BAKED ringás</p>
            <div style={rowS}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn(playing)} onClick={() => setPlaying((v) => !v)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
                <button style={btn(false)} onClick={() => { scrubRef.current = 0; setScrub(0) }}>⟲ 0</button>
              </div>
            </div>
            <div style={rowS}>
              <span style={label}>scrub: {scrub.toFixed(3)}</span>
              <input type="range" min={0} max={1} step={0.001} value={scrub}
                onChange={(e) => { const v = Number(e.target.value); scrubRef.current = v; setScrub(v); setPlaying(false) }} />
            </div>
            <div style={rowS}>
              <span style={label}>sebesség: {speed.toFixed(2)}×</span>
              <input type="range" min={0.1} max={3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </div>
            <label style={{ ...label, display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> rács + tengelyek
            </label>
          </>
        )}

        <div style={{ fontSize: 10, color: '#8a7aaa', lineHeight: 1.6, borderTop: '1px solid #2a1a4a', paddingTop: 10, marginTop: 12 }}>
          {info && <div>modell: {info.size?.join(' × ')} · {info.dur}s · {info.tris}</div>}
          <div style={{ color: '#9fb' }}>kamera: [{cam.join(', ')}]</div>
        </div>
      </div>
    </div>
  )
}

useGLTF.preload(URL)
