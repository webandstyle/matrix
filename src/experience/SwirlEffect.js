import { Effect } from 'postprocessing'
import * as THREE from 'three'

// Full-screen swirl + angular motion blur, IVRESS "Spin a Tale" style.
// Every pixel is rotated around screen center by an angle that grows with
// distance from center (center stays sharp, edges wind up), then the input
// is sampled SWIRL_SAMPLES times along small angular offsets and averaged —
// that tangential smear is what reads as liquid motion blur.
const fragmentShader = /* glsl */ `
  uniform float uStrength;
  uniform float uAspect;

  vec2 swirlUv(vec2 uv, float angleOffset) {
    vec2 p = uv - 0.5;
    p.x *= uAspect;
    float r = length(p);
    float theta = atan(p.y, p.x);
    float wind = uStrength * smoothstep(0.04, 0.85, r);
    theta += wind + angleOffset * smoothstep(0.03, 0.45, r);
    vec2 q = vec2(cos(theta), sin(theta)) * r;
    q.x /= uAspect;
    return q + 0.5;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float blur = 0.28 * uStrength + 0.012;
    // per-pixel jitter breaks the concentric banding that a fixed sample
    // ladder produces at wide blur angles
    float dither = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
    vec4 acc = vec4(0.0);
    float total = 0.0;
    for (int i = 0; i < SWIRL_SAMPLES; i++) {
      float f = (float(i) + dither) / float(SWIRL_SAMPLES) - 0.5;
      float w = 1.0 - abs(f) * 1.4;
      acc += texture2D(inputBuffer, swirlUv(uv, f * blur)) * w;
      total += w;
    }
    outputColor = acc / total;
  }
`

export default class SwirlEffect extends Effect {
  constructor({ samples = 16 } = {}) {
    super('SwirlEffect', fragmentShader, {
      uniforms: new Map([
        ['uStrength', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(16 / 9)],
      ]),
      defines: new Map([['SWIRL_SAMPLES', String(samples)]]),
    })
  }
}
