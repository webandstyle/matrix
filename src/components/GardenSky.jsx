import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'

// The garden sky: the "seemingly beautiful surface" — a late-afternoon blue→warm
// gradient, drifting clouds and a soft rainbow — a fake LED-wall surface hiding
// the system underneath. It faults only where a butterfly physically hits it:
// the panel flexes, scan-lines slip and readable Matrix-green code glyphs leak
// through. Fullscreen ScreenQuad, drawn hindmost behind the
// ground plate (renderOrder -100), so the transparent-sky area of the ground
// image reveals it while the grass covers the lower half.

const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uHit;      // butterfly tap point (0..1 screen, y up)
  uniform float uHitAmp;  // decaying pulse strength of the latest tap
  uniform float uHitSeed;

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

  // the whole "pretty" sky (gradient + clouds + rainbow) at a uv
  vec3 skyColor(vec2 uv, float aspect){
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

    // soft rainbow arc, centred below the horizon so it bows across the sky
    vec2 c = vec2(0.42, -0.35);
    vec2 rv = vec2((uv.x - c.x) * aspect, uv.y - c.y);
    float r = length(rv);
    float t = (r - 0.72) / 0.14;                 // 0..1 across the band
    float ring = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));
    vec3 rainbow = 0.5 + 0.5 * cos(6.2831853 * (t * 0.85 + vec3(0.0, 0.33, 0.67)));
    float rainMask = ring * smoothstep(0.02, 0.2, h) * 0.28;
    sky = mix(sky, rainbow, rainMask);
    return sky;
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;

    // the fault lives WHERE the butterfly hit: a localized disc around uHit,
    // strongest at the tap, decaying with uHitAmp. No hit → a calm, pretty sky.
    vec2 dh = vec2((uv.x - uHit.x) * aspect, uv.y - uHit.y);
    float dist = length(dh);
    float local = smoothstep(0.34, 0.02, dist);   // 1 at the tap → 0 at the rim
    float gi = local * uHitAmp;
    float fl = floor(uTime * 22.0);                // fast flicker while faulting

    // The sky behaves like a struck LED wall: a pressure ripple travels out
    // from the exact butterfly contact, briefly exposing the pixel lattice.
    vec2 radial = dh / max(dist, 0.001);
    float ripple = sin(dist * 115.0 - (1.0 - uHitAmp) * 18.0)
                 * exp(-dist * 13.0) * uHitAmp;
    float panelGridX = smoothstep(0.465, 0.5, abs(fract(uv.x * uRes.x / 8.0) - 0.5));
    float panelGridY = smoothstep(0.465, 0.5, abs(fract(uv.y * uRes.y / 8.0) - 0.5));
    float panelGrid = max(panelGridX, panelGridY) * local * uHitAmp;

    // scan-line slip on rows crossing the impact
    float row = floor(uv.y * 130.0);
    float slip = (hash(vec2(row, fl)) - 0.5) * gi * 0.09
               * step(0.4, hash(vec2(row * 1.7, fl + 3.0)));
    vec2 suv = vec2(uv.x + slip, uv.y) + radial * ripple * 0.006;

    vec3 col = skyColor(suv, aspect);

    if (gi > 0.004){
      // Recognizable code characters in broken vertical clusters. Character
      // choice and visibility flicker, but glyph shapes remain readable.
      vec2 codeUv = vec2(uv.x * aspect, uv.y) * vec2(42.0, 32.0);
      vec2 cell = floor(codeUv);
      vec2 glyphUv = fract(codeUv) - 0.5;
      float charId = hash(cell + uHitSeed * 17.3);
      float glyph = codeGlyph(glyphUv, charId);
      float column = step(0.38, hash(vec2(cell.x * 0.73, uHitSeed * 9.1)));
      float alive = step(0.34, hash(cell + floor(fl * 0.22) + uHitSeed));
      float code = glyph * column * alive;
      vec3 codeGreen = mix(vec3(0.18, 0.9, 0.38), vec3(0.72, 1.0, 0.78), hash(cell + fl));
      col = mix(col, codeGreen, code * gi * 0.96);
      col += vec3(0.08, 0.5, 0.16) * panelGrid * 0.42;
      // posterize the disc → digital stair-stepping
      col = mix(col, floor(col * 7.0) / 7.0, gi * 0.45);
      // expanding contact ring: the point where the insect hit the panel
      float ringRadius = mix(0.025, 0.28, 1.0 - uHitAmp);
      float ring = 1.0 - smoothstep(0.008, 0.025, abs(dist - ringRadius));
      col += vec3(0.36, 1.0, 0.55) * ring * uHitAmp * 0.75;
      // a bright pixel-flash core right at the tap
      float core = smoothstep(0.09, 0.0, dist) * uHitAmp;
      col += vec3(0.65, 1.0, 0.72) * core * 0.82;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`

export default function GardenSky({ reduceMotion, hitRef }) {
  const size = useThree((s) => s.size)
  const matRef = useRef()
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uHit: { value: new THREE.Vector2(0.5, 0.7) },
      uHitAmp: { value: 0 },
      uHitSeed: { value: 1 },
    }),
    [],
  )
  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = reduceMotion ? 0 : state.clock.elapsedTime
    m.uniforms.uRes.value.set(size.width, size.height)
    // the sky faults only where/when a butterfly taps the LED-wall — a decaying
    // pulse from the latest hit, localized to that screen point
    const hit = hitRef?.current
    if (hit && !reduceMotion) {
      const age = state.clock.elapsedTime - hit.t
      m.uniforms.uHit.value.set(hit.x, hit.y)
      m.uniforms.uHitSeed.value = hit.seed || 1
      m.uniforms.uHitAmp.value = Math.max(0, 1 - age / 1.35) // code lingers long enough to read
    } else {
      m.uniforms.uHitAmp.value = 0
    }
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
