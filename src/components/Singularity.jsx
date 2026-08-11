import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'

// THE INFORMATION SINGULARITY (2026-07-25) — the payoff AFTER the storm.
//
// Dramaturgy (all anchored to the shared stormRef.startedAt, so it stays in
// sync with GardenSky/StormShake/Butterflies): the red pill fires the storm
// (earthquake + the sky breaking into green code). Once the storm has built and
// held, everything the visitor sees — the pill-hands, the statue, the plants,
// the whole garden — RESOLVES INTO PURPLE CODE IN PLACE (as if code had formed
// it all along, see the code-dissolve chunks below, patched into each object's
// material). Then it SHATTERS, and the frame is pulled into a spinning spiral
// VORTEX (a shader reproduction of the "information-singularity" spiral — the
// raw asset was 2.36M tris + a watermarked stock texture, so we rebuild its look
// as a fullscreen shader: zero asset weight, no licensing issue, mobile-safe).
// The vortex collapses to a BLACK HOLE that grows to fill the screen, holds
// black, then hands off with a hard navigation to the mind-jungle
// (RED_PILL_URL). The black screen masks the page load.
//
// The whole sequence is one master clock (stAge = elapsed - startedAt) split
// into named phases by the cfg timing fields (sg*). singularityState() is the
// single source of truth every reader shares.

// derive every phase's 0..1 progress from the storm-age (seconds since the
// storm was triggered) + the cfg timing. Returns null before the storm fires.
//   code   — objects resolving into purple code (in place, silhouettes intact)
//   burst  — the code shattering / eroding away
//   reveal — the vortex fading in and pulling inward
//   black  — the black-hole disc growing to fill the screen
//   done   — the whole sequence has finished → time to navigate away
export function singularityState(stAge, cfg, editorPreview, sgAt) {
  const stDur = Math.max(0.1, cfg?.stDur ?? 1.4)
  const stHold = Math.max(0, cfg?.stHold ?? 1.0)
  const sgCode = Math.max(0.1, cfg?.sgCode ?? 1.6)
  const sgBurst = Math.max(0.1, cfg?.sgBurst ?? 1.3)
  const sgCollapse = Math.max(0.1, cfg?.sgCollapse ?? 1.1)
  const sgBlack = Math.max(0, cfg?.sgBlack ?? 0.7)

  const seq = sgCode + sgBurst + sgCollapse + sgBlack

  // editor preview: scrub the whole post-storm sequence with one 0..1 slider
  let local
  if (editorPreview) {
    local = (sgAt ?? 0) * seq
  } else {
    if (stAge == null) return null
    local = stAge - (stDur + stHold) // seconds into the singularity sequence
    if (local <= 0) return { code: 0, burst: 0, reveal: 0, black: 0, done: false }
  }

  const sm = (x, a, b) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
    return t * t * (3 - 2 * t)
  }

  const code = sm(local, 0, sgCode)
  // the shatter starts while the code overlay is still finishing (overlap reads
  // as "it became code AND then broke", not two separate beats)
  const burst = sm(local, sgCode * 0.62, sgCode + sgBurst)
  const reveal = sm(local, sgCode * 0.72, sgCode + sgBurst)
  const black = sm(local, sgCode + sgBurst, sgCode + sgBurst + sgCollapse)
  const done = local >= seq
  return { code, burst, reveal, black, done }
}

// ---- The vortex + black-hole shader ---------------------------------------
// A fullscreen spiral vortex matched to the singularity asset's reference: a
// multi-arm spiral of dotted strokes coiling into the centre, tinted cyan→
// magenta (the asset's own lightin gradient), spinning and pulling inward, with
// a growing black-hole disc at the core. Drawn hindmost-on-top of everything.

const VORTEX_VERT = /* glsl */ `
  // dpr-independent screen uv so the hole stays dead-centre at any pixel ratio
  varying vec2 vScreen;
  void main() { vScreen = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`

const VORTEX_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2  uRes;
  uniform float uReveal;   // 0..1 vortex opacity + inward pull
  uniform float uBlack;    // 0..1 black-hole disc radius (→1 fills screen)
  uniform float uSpin;     // accumulated rotation angle
  varying vec2 vScreen;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  void main(){
    vec2 uv = vScreen;
    vec2 p = uv - 0.5;
    p.x *= uRes.x / uRes.y;
    float r = length(p);
    float a = atan(p.y, p.x);

    // inward pull: as the vortex reveals, compress the sampled radius so the
    // arms visibly rush toward the centre
    float pull = mix(1.0, 0.4, uReveal);
    float R = r / max(pull, 0.05);

    // 6-arm archimedean spiral: bands where (angle + spin) wound against radius
    float arms = 6.0;
    float tw = 5.5;                                   // spiral tightness
    float phase = (a + uSpin) * (arms / 6.2831853) - R * tw;
    float band = abs(fract(phase) - 0.5) * 2.0;       // 0 at an arm's centreline
    float stroke = smoothstep(0.5, 0.12, band);

    // halftone dots riding the arms (the asset's dotted character) — break the
    // stroke into beads along its length
    float bead = fract(R * 26.0 - uSpin * 0.5 + a * 3.0);
    float dots = smoothstep(0.35, 0.62, bead) * smoothstep(0.95, 0.68, bead);
    stroke *= mix(0.55, 1.0, dots);

    // fade where the arms converge (very centre) and at the outer edge
    float radialMask = smoothstep(1.25, 0.18, R) * smoothstep(0.015, 0.14, R);

    // colour: magenta core → cyan rim (the lightin gradient), lifted by stroke
    vec3 cyan   = vec3(0.16, 0.86, 1.0);
    vec3 purple = vec3(0.72, 0.16, 0.95);
    vec3 col = mix(purple, cyan, smoothstep(0.12, 0.95, R));
    col *= (0.5 + 1.5 * stroke);

    // the actual matrix code now does the swirling (GardenSky's drain warp), so
    // the vortex's own dotted spiral is dialled back to faint inflow light —
    // just enough to add energy over the draining code, not a competing object
    float alpha = stroke * radialMask * uReveal * 0.32;

    // black-hole core: a growing dark disc that swallows the centre, with a hot
    // rainbow rim where matter falls in
    float holeR = uBlack * 1.25;
    float hole = smoothstep(holeR, holeR - 0.12, R);
    col = mix(col, vec3(0.0), hole);
    alpha = max(alpha, hole);
    float rim = smoothstep(0.07, 0.0, abs(R - holeR)) * uReveal;
    col += mix(cyan, purple, 0.5 + 0.5 * sin(uSpin + a * 4.0)) * rim * 2.2;
    alpha = max(alpha, rim * 0.9);

    // final wash: as the hole radius passes screen scale, force full black
    float full = smoothstep(0.78, 1.0, uBlack);
    col = mix(col, vec3(0.0), full);
    alpha = mix(alpha, 1.0, full);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`

export function SingularityVortex({ stormRef, cfgRef, editor, reduceMotion, onDone }) {
  const size = useThree((s) => s.size)
  const matRef = useRef()
  const meshRef = useRef()
  const spinRef = useRef(0)
  const doneRef = useRef(false)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uReveal: { value: 0 },
      uBlack: { value: 0 },
      uSpin: { value: 0 },
    }),
    [],
  )
  useFrame((state, delta) => {
    const m = matRef.current
    if (!m) return
    const cfg = cfgRef?.current
    const storm = stormRef?.current
    const preview = editor && cfg?.sgPreview === 1
    let st = null
    if (preview) {
      st = singularityState(0, cfg, true, cfg?.sgAt ?? 0)
    } else if (storm?.triggered && storm.startedAt != null) {
      st = singularityState(state.clock.elapsedTime - storm.startedAt, cfg, false)
    }
    const reveal = st ? st.reveal : 0
    const black = st ? st.black : 0
    // spin faster as the vortex intensifies; freeze under reduced motion
    if (!reduceMotion) spinRef.current += delta * (0.6 + 3.4 * reveal)
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uRes.value.set(size.width, size.height)
    m.uniforms.uReveal.value = reveal
    m.uniforms.uBlack.value = black
    m.uniforms.uSpin.value = spinRef.current
    // skip all raster work while fully idle
    if (meshRef.current) meshRef.current.visible = reveal > 0.001 || black > 0.001
    // the navigation handoff: once the real (non-preview) sequence completes,
    // fire onDone exactly once (the screen is fully black by now, so the page
    // load behind it is masked). Preview never navigates.
    if (!preview && st && st.done && !doneRef.current) {
      doneRef.current = true
      onDone?.()
    }
  })
  return (
    <ScreenQuad ref={meshRef} renderOrder={100} visible={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VORTEX_VERT}
        fragmentShader={VORTEX_FRAG}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}

// ---- Per-object "resolve into purple code, then shatter" -------------------
// Injected into each garden object's (already-cloned) material via
// onBeforeCompile. Two uniforms drive it: uCode (0..1, the surface turning into
// purple Matrix glyphs) and uBurst (0..1, a noise dissolve that erodes the
// surface away as it shatters). Screen-space glyph field masked by the object's
// own pixels, so the silhouette stays readable — "the hand/statue was code".
export const CODE_DISSOLVE_PARS = /* glsl */ `
  uniform float uCode;
  uniform float uBurst;
  uniform vec2  uCodeRes;
  uniform float uCodeTime;

  float wsHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  // tiny 5x7-ish vector-ish glyph in a cell (0/1/</>), returns 0..1 coverage
  float wsGlyph(vec2 g, float id){
    vec2 q = abs(g);
    float body = step(q.x, 0.34) * step(q.y, 0.42);
    // carve interior for a hollow, code-like look based on id
    float bar = step(abs(g.y), 0.10) * step(q.x, 0.30);
    float col = step(abs(g.x), 0.10) * step(q.y, 0.34);
    float diag = step(abs(g.x - g.y), 0.10) * step(q.x, 0.34);
    float shape = body * (id < 0.5 ? max(bar, col) : diag);
    return clamp(shape, 0.0, 1.0);
  }
`

// fragment tail: recolour toward purple code, then discard eroding pixels
export const CODE_DISSOLVE_FRAG = /* glsl */ `
  {
    // screen-space code cells
    vec2 sp = gl_FragCoord.xy / max(uCodeRes.y, 1.0);
    vec2 cellSize = vec2(0.020);
    vec2 cell = floor(sp / cellSize);
    vec2 g = (fract(sp / cellSize) - 0.5) * 2.0;
    float scroll = floor(uCodeTime * 9.0);
    float id = wsHash(cell + scroll * 0.017);
    float lit = step(0.35, wsHash(vec2(cell.x, floor(uCodeTime * 6.0) + cell.y * 0.3)));
    float glyph = wsGlyph(g, id) * lit;

    // purple matrix palette
    vec3 codeDark = vec3(0.10, 0.02, 0.20);
    vec3 codeLit  = vec3(0.66, 0.32, 1.0);
    vec3 codeCol = mix(codeDark, codeLit, glyph);

    gl_FragColor.rgb = mix(gl_FragColor.rgb, codeCol, uCode);

    // dissolve: erode pixels away as burst grows (noise threshold sweep)
    if (uBurst > 0.0001) {
      float n = wsHash(floor(gl_FragCoord.xy * 0.5) + 3.7);
      float edge = uBurst * 1.15;
      if (n < edge) discard;
      // bright violet flare on the eroding edge
      float rim = smoothstep(edge - 0.12, edge, n);
      gl_FragColor.rgb += vec3(0.5, 0.2, 0.9) * rim * uCode;
    }
  }
`

// Patch a material to carry the code-dissolve. Returns a uniforms object the
// caller updates per-frame; composes with any pre-existing onBeforeCompile
// (e.g. the wind bend) by chaining it.
export function patchCodeDissolve(material) {
  const u = {
    uCode: { value: 0 },
    uBurst: { value: 0 },
    uCodeRes: { value: new THREE.Vector2(1, 1) },
    uCodeTime: { value: 0 },
  }
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer)
    shader.uniforms.uCode = u.uCode
    shader.uniforms.uBurst = u.uBurst
    shader.uniforms.uCodeRes = u.uCodeRes
    shader.uniforms.uCodeTime = u.uCodeTime
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${CODE_DISSOLVE_PARS}\n#include <common>`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${CODE_DISSOLVE_FRAG}`)
  }
  material.transparent = true
  material.needsUpdate = true
  return u
}
