import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'
import { singularityState } from './Singularity'

// The garden sky: the "seemingly beautiful surface" — a late-afternoon blue→warm
// gradient, drifting clouds and a soft rainbow — a fake LED-wall surface hiding
// the system underneath. It faults locally where a butterfly physically hits it
// (uHit/uHitAmp): the panel flexes, scan-lines slip and readable Matrix-green
// code glyphs leak through.
//
// THE STORM (2026-07-23, uStorm/uStormWave): clicking the red pill breaks the
// whole surface, not one panel. The sky tips into a dark violet storm, dark
// clouds crack with yellow lightning, and the green code sharpens across the
// ENTIRE wall in a wave expanding from screen centre. Same shader, driven by
// the shared stormRef (StormShake shakes the camera, Butterflies flee — see
// those files). Fullscreen ScreenQuad, drawn hindmost behind the ground plate
// (renderOrder -100), so the transparent-sky area of the ground image reveals
// it while the grass covers the lower half.

const VERT = /* glsl */ `
  // dpr-independent screen uv (0..1), so the singularity drain stays exactly
  // centred regardless of devicePixelRatio (gl_FragCoord/uRes drifts off-centre
  // whenever dpr != 1)
  varying vec2 vScreen;
  void main() { vScreen = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uHit;      // butterfly tap point (0..1 screen, y up)
  uniform float uHitAmp;  // decaying pulse strength of the latest tap
  uniform float uHitSeed;
  // legacy "whole-sky" channel (rabbit's leap) — dormant now, kept as an OR
  // input alongside uStorm so both drive the same tear/posterize logic
  uniform float uMegaAmp;
  // THE STORM: uStorm 0..1 master intensity (sky tint + tearing), uStormWave
  // the radius of the code-sharpening front expanding from screen centre,
  // uLightning frequency/brightness multiplier for the yellow lightning.
  uniform float uStorm;
  uniform float uStormWave;
  uniform float uLightning;
  // SINGULARITY DRAIN: 0..1 — how hard the whole matrix is being sucked into the
  // central drain (a whirlpool that pulls the code inward + spins it, like water
  // down a plughole). Ramps with the singularity's vortex reveal.
  uniform float uDrain;
  varying vec2 vScreen;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.,0.)), c = hash(i + vec2(0.,1.)), d = hash(i + vec2(1.,1.));
    vec2 u = f * f * (3. - 2. * f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){
    float s = 0., a = 0.5;
    for (int i = 0; i < 6; i++){ s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return s;
  }

  float segment(vec2 p, vec2 a, vec2 b, float width){
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return 1.0 - smoothstep(width, width + 0.035, length(pa - ba * h));
  }

  // Tiny vector glyphs: 0, 1, < and >. They stay readable even while the
  // surrounding image tears, so the fault clearly exposes code, not noise.
  float codeGlyph(vec2 p, float id){
    float g = 0.0;
    if (id < 0.25){
      g = max(g, segment(p, vec2(-.26,.32), vec2(.26,.32), .065));
      g = max(g, segment(p, vec2(-.26,-.32), vec2(.26,-.32), .065));
      g = max(g, segment(p, vec2(-.28,-.28), vec2(-.28,.28), .065));
      g = max(g, segment(p, vec2(.28,-.28), vec2(.28,.28), .065));
    } else if (id < 0.5){
      g = max(g, segment(p, vec2(0.0,-.34), vec2(0.0,.34), .07));
      g = max(g, segment(p, vec2(-.18,.18), vec2(0.0,.34), .07));
      g = max(g, segment(p, vec2(-.2,-.34), vec2(.2,-.34), .06));
    } else if (id < 0.75){
      g = max(g, segment(p, vec2(.24,.34), vec2(-.24,0.0), .07));
      g = max(g, segment(p, vec2(-.24,0.0), vec2(.24,-.34), .07));
    } else {
      g = max(g, segment(p, vec2(-.24,.34), vec2(.24,0.0), .07));
      g = max(g, segment(p, vec2(.24,0.0), vec2(-.24,-.34), .07));
    }
    return g;
  }

  // the whole "pretty" sky (gradient + clouds + rainbow) at a uv, then tipped
  // toward a dark violet storm by the storm param (0..1): dark billows,
  // bruised lit edges, and the rainbow fades away.
  vec3 skyColor(vec2 uv, float aspect, float storm){
    float h = clamp(uv.y, 0.0, 1.0);
    // late-afternoon gradient: warm horizon → soft blue → deep zenith
    vec3 horizon = vec3(1.00, 0.83, 0.62);
    vec3 mid     = vec3(0.53, 0.70, 0.90);
    vec3 zenith  = vec3(0.16, 0.36, 0.68);
    vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.45, h));
    sky = mix(sky, zenith, smoothstep(0.40, 1.0, h));

    // clouds: fbm, drifting slowly; lit tops, shaded bellies
    vec2 cuv = vec2(uv.x * aspect, uv.y) * 2.2 + vec2(uTime * 0.010, 0.0);
    float cl = fbm(cuv);
    float cover = smoothstep(0.50, 0.82, cl);
    float lit = smoothstep(0.45, 0.80, fbm(cuv + vec2(0.0, 0.10)));
    vec3 cloudCol = mix(vec3(0.70, 0.71, 0.80), vec3(1.0, 0.97, 0.92), lit);
    // fewer clouds hugging the very top, more mid-sky
    float band = smoothstep(0.12, 0.4, h) * (1.0 - 0.4 * smoothstep(0.8, 1.0, h));
    sky = mix(sky, cloudCol, cover * band * 0.9);

    // soft rainbow arc, centred below the horizon so it bows across the sky —
    // it fades out as the storm takes over (no rainbows in a storm)
    vec2 c = vec2(0.42, -0.35);
    vec2 rv = vec2((uv.x - c.x) * aspect, uv.y - c.y);
    float r = length(rv);
    float t = (r - 0.72) / 0.14;                 // 0..1 across the band
    float ring = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));
    vec3 rainbow = 0.5 + 0.5 * cos(6.2831853 * (t * 0.85 + vec3(0.0, 0.33, 0.67)));
    float rainMask = ring * smoothstep(0.02, 0.2, h) * 0.28 * (1.0 - storm);
    sky = mix(sky, rainbow, rainMask);

    // STORM overlay: a dark violet gradient with darkened, bruised-violet
    // billows reusing the cloud cover/lit already computed above
    if (storm > 0.001){
      vec3 sHor = vec3(0.17, 0.08, 0.17);
      vec3 sZen = vec3(0.05, 0.02, 0.11);
      vec3 stormSky = mix(sHor, sZen, smoothstep(0.0, 1.0, h));
      vec3 darkCloud = mix(vec3(0.02, 0.01, 0.05), vec3(0.30, 0.16, 0.34), lit);
      stormSky = mix(stormSky, darkCloud, cover * band * 0.95);
      sky = mix(sky, stormSky, storm);
    }
    return sky;
  }

  // stochastic lightning: epochs tick a few times/sec; only some fire (more at
  // higher intensity). Returns a fast attack + double-strike flicker envelope.
  float lightningFlash(float t, float intensity){
    float rate = 2.3;
    float epoch = floor(t * rate);
    float r = hash(vec2(epoch, 71.3));
    float fires = step(1.0 - clamp(0.26 + 0.34 * intensity, 0.0, 0.92), r);
    float local = fract(t * rate);
    float env = exp(-local * 9.0)
              + 0.55 * exp(-abs(local - 0.10) * 16.0)
              + 0.30 * exp(-abs(local - 0.20) * 20.0);
    return fires * clamp(env, 0.0, 1.0);
  }

  // full-spectrum rainbow for the singularity's chromatic drain
  vec3 hue(float t){ return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67))); }

  void main(){
    vec2 uv = vScreen;
    float aspect = uRes.x / uRes.y;

    // ---- SINGULARITY DRAIN --------------------------------------------------
    // Warp the coordinate we SAMPLE the sky+code from, so the whole matrix
    // whirlpools into the centre: near the drain we (a) rotate the sample angle
    // (a continuous, time-driven spin so the code keeps flowing round) and (b)
    // sample from FURTHER OUT (r increased) so outer code visibly streams inward
    // and vanishes into the throat — "the matrix pours into a plughole". Falls
    // off toward the screen edges so only the vortex region churns.
    vec2 uvW = uv;
    if (uDrain > 0.0001) {
      vec2 dc = uv - vec2(0.5);
      dc.x *= aspect;
      float dr = length(dc);
      float dang = atan(dc.y, dc.x);
      // strongest near the centre but NEVER zero at the edges — the WHOLE
      // screen (corners included) gets pulled into the drain, no static border
      float de = uDrain * mix(0.55, 1.0, smoothstep(1.3, 0.05, dr));
      dang += de * 2.8 + uTime * 1.6 * de;             // wind-up + continuous flow
      float drs = dr + de * 0.34;                      // sample from further out → inflow
      dc = vec2(cos(dang), sin(dang)) * drs;
      dc.x /= aspect;
      uvW = vec2(0.5) + dc;
    }

    // the local fault lives WHERE the butterfly hit: a disc around uHit,
    // strongest at the tap, decaying with uHitAmp. No hit → a calm sky.
    vec2 dh = vec2((uv.x - uHit.x) * aspect, uv.y - uHit.y);
    float dist = length(dh);

    // STORM code-reveal front: an expanding ring from screen centre. Code
    // sharpens BEHIND the front; a bright edge flares right AT the front.
    vec2 oc = vec2(0.5, 0.52);
    vec2 dO = vec2((uv.x - oc.x) * aspect, uv.y - oc.y);
    float distO = length(dO);
    float reveal = smoothstep(0.10, -0.02, distO - uStormWave);
    float stormCode = reveal * uStorm;
    float frontEdge = exp(-pow((distO - uStormWave) / 0.06, 2.0)) * uStorm;

    // whole-sky break drivers: the butterfly disc, the legacy mega channel, or
    // the storm — whichever is strongest tears/posterizes that pixel
    float breakAmp = max(uMegaAmp, uStorm);
    float local = mix(smoothstep(0.34, 0.02, dist), 1.0, breakAmp);
    float gi = max(max(local * uHitAmp, uMegaAmp), stormCode);
    float fl = floor(uTime * 22.0);                // fast flicker while faulting

    // Echoing wavefront for the LOCAL butterfly tap (same physics as the
    // &-landing splash in CodeUniverse): a wave packet expands outward from the
    // tap in real time and flares the code glyphs it sweeps past (codeWave
    // below), never drawing a ring on the sky itself.
    float front = mix(0.015, 0.42, 1.0 - uHitAmp);
    float g = dist - front;
    float sigma = 0.1;
    float env = exp(-(g * g) / (2.0 * sigma * sigma)) * uHitAmp;

    float panelGridX = smoothstep(0.465, 0.5, abs(fract(uv.x * uRes.x / 8.0) - 0.5));
    float panelGridY = smoothstep(0.465, 0.5, abs(fract(uv.y * uRes.y / 8.0) - 0.5));
    float panelGrid = max(panelGridX, panelGridY) * local * max(uHitAmp, breakAmp);

    // scan-line slip on rows crossing the fault — the storm pushes the slip
    // much further (panels visibly tearing apart, not just glitching in place)
    float row = floor(uv.y * 130.0);
    float slip = (hash(vec2(row, fl)) - 0.5) * gi * mix(0.09, 0.24, breakAmp)
               * step(0.4, hash(vec2(row * 1.7, fl + 3.0)));
    // sample the sky+clouds from the drained coordinate so the whole surface
    // pours toward the centre during the singularity
    vec2 suv = vec2(uvW.x + slip, uvW.y);

    vec3 col = skyColor(suv, aspect, uStorm);

    // LIGHTNING: cloud-flash illumination + jagged yellow bolts, gated by storm
    if (uStorm > 0.001){
      float flash = lightningFlash(uTime, uLightning) * uStorm;
      float epoch = floor(uTime * 2.3);
      // main bolt: a jagged vertical stroke at a random x, strong up high
      float boltX = 0.15 + 0.7 * hash(vec2(epoch, 12.7));
      float jag = (fbm(vec2(uv.y * 7.0, epoch * 3.0)) - 0.5) * 0.10;
      float bolt = (1.0 - smoothstep(0.0, 0.010, abs(uv.x - boltX - jag)))
                 * smoothstep(-0.05, 0.55, uv.y);
      // a shorter offshoot branch
      float bx2 = boltX + (hash(vec2(epoch, 5.1)) - 0.5) * 0.12;
      float jag2 = (fbm(vec2(uv.y * 9.0, epoch * 7.0)) - 0.5) * 0.08;
      float bolt2 = (1.0 - smoothstep(0.0, 0.008, abs(uv.x - bx2 - jag2)))
                  * smoothstep(0.35, 0.7, uv.y) * 0.7;
      float boltAll = max(bolt, bolt2) * flash;

      vec3 lightYellow = vec3(1.0, 0.92, 0.45);
      // cloud flash washes the upper sky yellow; the bolt core is near-white hot
      col += lightYellow * flash * 0.45 * smoothstep(0.0, 0.6, uv.y);
      col = mix(col, vec3(1.0, 0.97, 0.7), clamp(boltAll, 0.0, 1.0));
      col += lightYellow * boltAll * 0.6;
    }

    if (gi > 0.004){
      // Recognizable code characters in broken vertical clusters. The storm
      // lowers the column/alive thresholds so far more of the field lights up
      // (a dense wall of code) as the reveal front passes.
      vec2 codeUv = vec2(uvW.x * aspect, uvW.y) * vec2(42.0, 32.0);
      vec2 cell = floor(codeUv);
      vec2 glyphUv = fract(codeUv) - 0.5;
      float charId = hash(cell + uHitSeed * 17.3);
      float glyph = codeGlyph(glyphUv, charId);
      float column = step(0.38 - 0.5 * stormCode, hash(vec2(cell.x * 0.73, uHitSeed * 9.1)));
      float alive = step(0.34 - 0.5 * stormCode, hash(cell + floor(fl * 0.22) + uHitSeed));
      float code = glyph * column * alive;
      // visibility = the stronger of the local tap's echo wave and the storm's
      // expanding reveal (with a bright flare right at the travelling front)
      float hitWave = clamp(gi * (0.55 + 1.3 * env), 0.0, 1.0);
      float stormWave = clamp(stormCode * (0.7 + 1.4 * frontEdge), 0.0, 1.0);
      float codeWave = max(hitWave, stormWave);
      vec3 codeGreen = mix(vec3(0.18, 0.9, 0.38), vec3(0.72, 1.0, 0.78), hash(cell + fl));
      // during the singularity the whole code field goes FULL RGB — a chromatic
      // whirlpool draining in (a rainbow wheel around the drain centre the code
      // takes its colour from as it spirals through)
      if (uDrain > 0.0001) {
        vec2 rc = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
        vec3 rgb = hue(atan(rc.y, rc.x) / 6.2831853 + length(rc) * 1.1 + uTime * 0.1);
        codeGreen = mix(codeGreen, rgb, uDrain * 0.9);
      }
      col = mix(col, codeGreen, code * codeWave);
      col += vec3(0.08, 0.5, 0.16) * panelGrid * 0.42;
      // posterize → digital stair-stepping (storm: much harder edges)
      col = mix(col, floor(col * 7.0) / 7.0, gi * mix(0.45, 0.88, breakAmp));
      // a bright pixel-flash core right at a butterfly tap
      float core = smoothstep(0.09, 0.0, dist) * uHitAmp;
      col += vec3(0.65, 1.0, 0.72) * core * 0.82;
      // legacy world-ending flash (mega channel, dormant)
      float megaFlash = smoothstep(0.75, 1.0, uMegaAmp);
      col = mix(col, vec3(0.85, 1.0, 0.9), megaFlash * 0.85);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`

export default function GardenSky({ reduceMotion, hitRef, stormRef, cfgRef }) {
  const size = useThree((s) => s.size)
  const matRef = useRef()
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uHit: { value: new THREE.Vector2(0.5, 0.7) },
      uHitAmp: { value: 0 },
      uHitSeed: { value: 1 },
      uMegaAmp: { value: 0 },
      uStorm: { value: 0 },
      uStormWave: { value: 0 },
      uLightning: { value: 1 },
      uDrain: { value: 0 },
    }),
    [],
  )
  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    const cfg = cfgRef?.current
    m.uniforms.uTime.value = reduceMotion ? 0 : state.clock.elapsedTime
    m.uniforms.uRes.value.set(size.width, size.height)
    // butterfly taps (calm-state local glitch)
    const hit = hitRef?.current
    if (hit && !reduceMotion) {
      const age = state.clock.elapsedTime - hit.t
      m.uniforms.uHit.value.set(hit.x, hit.y)
      m.uniforms.uHitSeed.value = hit.seed || 1
      m.uniforms.uHitAmp.value = Math.max(0, 1 - age / 1.35) // code lingers long enough to read
      m.uniforms.uMegaAmp.value = hit.mega ? Math.max(0, 1 - age / 2.6) : 0
    } else {
      m.uniforms.uHitAmp.value = 0
      m.uniforms.uMegaAmp.value = 0
    }
    // THE STORM (red pill). GardenSky is the authoritative place that stamps
    // startedAt on the shared stormRef; StormShake + Butterflies read the same
    // startedAt for their own progress. A calm scene keeps uStorm at 0.
    const storm = stormRef?.current
    let uStorm = 0
    let uWave = 0
    if (storm?.triggered) {
      if (storm.startedAt == null) storm.startedAt = state.clock.elapsedTime
      const stAge = state.clock.elapsedTime - storm.startedAt
      const dur = Math.max(0.1, cfg?.stDur ?? 1.4)
      const wave = Math.max(0.1, cfg?.stWave ?? 2.6)
      const ramp = Math.min(1, stAge / dur)
      uStorm = ramp * ramp * (3 - 2 * ramp) // smoothstep the build-up
      // the reveal front sweeps past 1.0 so even the screen corners resolve
      // (radius in the shader can exceed 1 near the diagonal)
      uWave = Math.min(1.4, (stAge / wave) * 1.4)
    }
    m.uniforms.uStorm.value = uStorm
    m.uniforms.uStormWave.value = uWave
    m.uniforms.uLightning.value = reduceMotion ? 0 : (cfg?.stLight ?? 1)
    // singularity drain: the matrix whirlpools into the centre as the vortex
    // reveals. Shares the exact same clock as everyone else.
    let drain = 0
    const editorPrev = (cfg?.sgPreview === 1)
    if (editorPrev) {
      const st = singularityState(0, cfg, true, cfg?.sgAt ?? 0)
      drain = st ? Math.max(st.reveal, st.black) : 0
    } else if (storm?.triggered && storm.startedAt != null) {
      const st = singularityState(state.clock.elapsedTime - storm.startedAt, cfg, false)
      drain = st ? Math.max(st.reveal, st.black) : 0
    }
    m.uniforms.uDrain.value = reduceMotion ? Math.min(drain, 0.0) : drain
  })
  return (
    <ScreenQuad renderOrder={-100}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}
