import { useEffect, useRef } from 'react'
import { WAVE_FACTS } from '../data/content'
import { useT } from '../i18n/LanguageContext'

// the code universe: a terminal boots ("npm run dev" ...), then movie-style
// matrix rain fills the screen — real, readable code fragments running
// VERTICALLY down each column. One real '&' in the code ignites green,
// breaks out of its cell, and FALLS: it slams into the RIGHT edge of the
// screen, then the LEFT edge — each impact splashes water-rings across the
// code and sends the hero into a full spin. Near the end the matrix
// dissolves to transparency, so the hero keeps falling ABOVE the incoming
// Web&Style screen and never leaves sight until it lands exactly in the &
// slot of the wordmark — which ignites green, then settles gold.
//
// Hero picker: open the site with ?pick to see every '&' cell framed;
// click one to choose where the hero starts (saved to localStorage as a
// viewport-independent point; on every load the nearest real '&' is used).

// global progress windows
const TERMINAL_START = 0.63
const TERMINAL_END = 0.68
const FILL_START = 0.68
const FILL_END = 0.76
const IGNITE_START = 0.75
const IGNITE_END = 0.775
const POP_START = 0.775
const POP_END = 0.8
const FALL_START = 0.8
const FALL_END = 0.99

// edge impacts along the fall (fallP time, then x resolved per frame)
const HIT_1 = 0.3
const HIT_2 = 0.62

const FONT_SIZE = 15
const CELL_W = 16
const CELL_H = 17
const MONO = '"IBM Plex Mono", Consolas, "Courier New", monospace'
const TERMINAL_LINE = '$ npm run dev'
const HERO_STORE_KEY = 'ws-hero'

function smoothstep(x, a, b) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

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

const CODE_FRAGMENTS = [
  "const universe = await mount('#root')",
  'for (let i = 0; i < 1e6; i++) render(site[i])',
  "import { experience } from 'web&style'",
  'function forgettable(site) { return true }',
  "scroll.on('progress', p => swirl(p * 6.2))",
  'if (!memorable) dissolve(page)',
  "const hero = document.querySelector('&')",
  'requestAnimationFrame(driftForever)',
  'matrix.fill(0x00ff41).flicker(0.08)',
  "await burn({ from: 'center', flames: false })",
  'let noise = sites.filter(s => !s.remembered)',
  "camera.lookAt(new Vector3(0, 0, '&'))",
  'export default function WebAndStyle() {',
  '  return <Experience immersive />',
  '}',
  'const px = (col + 0.5) / COLS * 2 - 1',
  'gsap.to(reality, { opacity: 0, scrub: true })',
  'while (scrolling) universe.expand()',
  'npm WARN deprecated boring-websites@4.0.2',
]

function loadHeroPref() {
  try {
    const s = localStorage.getItem(HERO_STORE_KEY)
    if (s) {
      const v = JSON.parse(s)
      if (typeof v.nx === 'number' && typeof v.ny === 'number') return v
    }
  } catch {
    // corrupted store — fall back to center
  }
  return { nx: 0.5, ny: 0.5 }
}

// two-pass build: 1) generate the character map, pick the hero from the REAL
// '&' glyphs the code produced; 2) draw everything. This guarantees the
// glyph the ignition rises from is truly an ampersand.
function buildOffscreen(w, h, dpr) {
  const cols = Math.ceil(w / CELL_W)
  const rows = Math.ceil(h / CELL_H) + 1

  const rand = seededRandom(4242)
  let frag = Math.floor(rand() * CODE_FRAGMENTS.length)
  let source = ''
  const nextChar = () => {
    while (source.length === 0) {
      source = `${CODE_FRAGMENTS[frag % CODE_FRAGMENTS.length]} `
      frag += 1
    }
    const ch = source[0]
    source = source.slice(1)
    return ch
  }

  // pass 1: characters + every real '&' position (column-major = vertical code)
  const chars = []
  const ampCells = []
  const stagger = []
  for (let col = 0; col < cols; col += 1) {
    stagger.push(rand())
    chars.push([])
    for (let row = 0; row < rows; row += 1) {
      const ch = nextChar()
      chars[col].push(ch)
      if (ch === '&' && row > 1 && row < rows - 2) ampCells.push([col, row])
    }
  }

  const pref = loadHeroPref()
  let heroCol = Math.floor(cols / 2)
  let heroRow = Math.floor(rows / 2)
  if (ampCells.length === 0) {
    chars[heroCol][heroRow] = '&' // extremely unlikely fallback
  } else {
    let best = Infinity
    for (const [c, r] of ampCells) {
      const d = ((c + 0.5) / cols - pref.nx) ** 2 + ((r + 0.5) / rows - pref.ny) ** 2
      if (d < best) {
        best = d
        heroCol = c
        heroRow = r
      }
    }
  }

  // pass 2: draw
  const off = document.createElement('canvas')
  off.width = Math.round(w * dpr)
  off.height = Math.round(h * dpr)
  const ctx = off.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#020402'
  ctx.fillRect(0, 0, w, h)
  ctx.font = `500 ${FONT_SIZE}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const ch = chars[col][row]
      if (ch === ' ') continue
      const v = rand()
      ctx.fillStyle =
        col === heroCol && row === heroRow
          ? '#4dff6a'
          : v > 0.96
            ? '#d2ffd8'
            : v > 0.8
              ? '#4dff6a'
              : v > 0.38
                ? '#25b93c'
                : '#0f7a26'
      ctx.fillText(ch, (col + 0.5) * CELL_W, (row + 0.5) * CELL_H)
    }
  }

  return { off, cols, rows, heroCol, heroRow, stagger, ampCells }
}

// the hero's horizontal journey: center → RIGHT edge (impact) → LEFT edge
// (impact) → back to center before locking onto the wordmark
function pathX(t, cx, w) {
  const keys = [
    [0, cx],
    [HIT_1, w * 0.94],
    [HIT_2, w * 0.06],
    [0.88, cx],
    [1, cx],
  ]
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (t <= keys[i + 1][0]) {
      const u = smoothstep(t, keys[i][0], keys[i + 1][0])
      return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * u
    }
  }
  return cx
}

function freeYAt(t, cy, h) {
  return cy + t * h * 0.22 + Math.sin(t * 12) * h * 0.015
}

export default function CodeUniverse({ progressRef }) {
  const t = useT()
  const canvasRef = useRef(null)
  const fact1Ref = useRef(null)
  const fact2Ref = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const pickMode = new URLSearchParams(window.location.search).has('pick')
    let grid = null
    let frame = null
    let fctx = null
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let ampHidden = false
    let landed = false
    let greenSince = null
    let melted = false
    // real-time splash waves: armed when fallP crosses an impact point,
    // then they roll across the wall on the clock (not the scrollbar)
    let hitTimes = [null, null]
    let prevFallP = 0

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      grid = buildOffscreen(w, h, dpr)
      // intermediate buffer: the scrolled rain is composed here first, then
      // blitted to screen in thin slices displaced by the splash wave
      frame = document.createElement('canvas')
      frame.width = Math.round(w * dpr)
      frame.height = Math.round(h * dpr)
      fctx = frame.getContext('2d')
    }
    resize()
    window.addEventListener('resize', resize)

    // ---- hero picker mode (?pick): click a framed & to choose the start ----
    const onPick = (e) => {
      if (!pickMode || !grid) return
      const rect = canvas.getBoundingClientRect()
      const col = Math.floor((e.clientX - rect.left) / CELL_W)
      const row = Math.floor((e.clientY - rect.top) / CELL_H)
      let best = Infinity
      let cell = null
      for (const [c, r] of grid.ampCells) {
        const d = (c - col) ** 2 + (r - row) ** 2
        if (d < best) {
          best = d
          cell = [c, r]
        }
      }
      if (cell && best <= 9) {
        localStorage.setItem(
          HERO_STORE_KEY,
          JSON.stringify({ nx: (cell[0] + 0.5) / grid.cols, ny: (cell[1] + 0.5) / grid.rows }),
        )
        grid = buildOffscreen(w, h, dpr) // re-pick with the new preference
      }
    }
    canvas.addEventListener('click', onPick)

    const setAmpHidden = (hide) => {
      if (hide === ampHidden) return
      ampHidden = hide
      const amp = document.querySelector('.choose__amp')
      if (amp) amp.style.opacity = hide ? '0' : ''
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const now = performance.now() / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!grid) return

      // ---------- picker mode: full rain + framed & cells ----------
      if (pickMode) {
        ctx.drawImage(grid.off, 0, 0, w * dpr, h * dpr, 0, 0, w, h)
        for (const [c, r] of grid.ampCells) {
          const isHero = c === grid.heroCol && r === grid.heroRow
          ctx.strokeStyle = isHero ? '#ffd75e' : 'rgba(120,255,160,0.9)'
          ctx.lineWidth = isHero ? 3 : 1.5
          ctx.strokeRect(c * CELL_W + 1, r * CELL_H + 1, CELL_W - 2, CELL_H - 2)
        }
        ctx.font = `500 13px ${MONO}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#eaffea'
        ctx.fillText('HERO PICKER — click an & to set the start (gold = current). Remove ?pick when done.', 12, 10)
        return
      }

      const p = progressRef.current
      if (p < TERMINAL_START - 0.03) {
        setAmpHidden(false)
        if (fact1Ref.current) fact1Ref.current.style.opacity = '0'
        if (fact2Ref.current) fact2Ref.current.style.opacity = '0'
        return
      }

      const { off, cols, rows, heroCol, heroRow, stagger } = grid
      const fillP = smoothstep(p, FILL_START, FILL_END)
      const ignite = smoothstep(p, IGNITE_START, IGNITE_END)
      const pop = smoothstep(p, POP_START, POP_END)
      const fallP = smoothstep(p, FALL_START, FALL_END)
      // near the landing the matrix dissolves to transparency so the hero can
      // keep falling above the incoming chooser screen
      const dissolve = smoothstep(fallP, 0.78, 0.98)

      ctx.fillStyle = `rgba(2, 4, 2, ${1 - dissolve})`
      ctx.fillRect(0, 0, w, h)

      // ---- terminal boot ----
      if (fillP < 0.14) {
        const tp = Math.min(Math.max((p - TERMINAL_START) / (TERMINAL_END - TERMINAL_START), 0), 1)
        const typed = Math.floor(Math.min(tp / 0.55, 1) * TERMINAL_LINE.length)
        let line = TERMINAL_LINE.slice(0, typed)
        if (tp > 0.65) line += ' .'
        if (tp > 0.8) line += '.'
        if (tp > 0.95) line += '.'
        ctx.font = `500 ${FONT_SIZE}px ${MONO}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.globalAlpha = 1 - fillP / 0.14
        ctx.fillStyle = '#e8ffe8'
        ctx.fillText(line, 12, 10)
        if (Math.floor(now * 2.4) % 2 === 0) {
          ctx.fillStyle = '#4dff6a'
          ctx.fillRect(12 + line.length * (FONT_SIZE * 0.6) + 4, 10, FONT_SIZE * 0.55, FONT_SIZE + 2)
        }
        ctx.globalAlpha = 1
      }

      // ---- the rain ----
      ctx.globalAlpha = 1 - dissolve
      if (fallP > 0) {
        // compose the endless upward-streaming rain into the frame buffer
        const yOff = (fallP * h * 2.2) % h
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        fctx.clearRect(0, 0, w, h)
        fctx.drawImage(off, 0, 0, w * dpr, h * dpr, 0, -yOff, w, h)
        fctx.drawImage(off, 0, 0, w * dpr, h * dpr, 0, h - yOff, w, h)
        // the hero's abandoned cell travels upward with the rain, empty
        fctx.fillStyle = '#020402'
        fctx.fillRect(heroCol * CELL_W, heroRow * CELL_H - yOff, CELL_W, CELL_H)
        fctx.fillRect(heroCol * CELL_W, heroRow * CELL_H - yOff + h, CELL_W, CELL_H)
        fctx.fillStyle = 'rgba(2, 4, 2, 0.42)'
        fctx.fillRect(0, 0, w, h)

        // splash = the WALL itself ripples: each edge impact launches a
        // traveling wave packet that rolls across the whole code wall in
        // REAL TIME (it keeps rolling even if the scroll stops), vertically
        // displacing thin slices as it passes, then echoes out
        const HITS = [HIT_1, HIT_2]
        for (let i = 0; i < HITS.length; i += 1) {
          if (prevFallP < HITS[i] && fallP >= HITS[i]) hitTimes[i] = now
          if (fallP < HITS[i]) hitTimes[i] = null
        }
        prevFallP = fallP

        const WAVE_SECONDS = 1.5
        const heroCy = (heroRow + 0.5) * CELL_H
        const waves = []
        for (let i = 0; i < HITS.length; i += 1) {
          if (hitTimes[i] === null) continue
          const age = now - hitTimes[i]
          if (age > WAVE_SECONDS) continue
          waves.push({
            hx: HITS[i] === HIT_1 ? w * 0.94 : w * 0.06,
            hy: freeYAt(HITS[i], heroCy, h),
            front: age * w * 1.1,
            decay: 1 - age / WAVE_SECONDS,
          })
        }
        // base pass: the calm wall fills every gap the ripple opens up
        ctx.drawImage(frame, 0, 0, w * dpr, h * dpr, 0, 0, w, h)
        if (waves.length > 0) {
          // ripple pass: the wall is cut into tiles, each displaced RADIALLY
          // away from the impact point — the wavefronts are concentric arcs
          // expanding like real water rings
          const TW = 48
          const TH = 34
          const sigma = w * 0.1
          for (let tyy = 0; tyy < h; tyy += TH) {
            for (let txx = 0; txx < w; txx += TW) {
              const tcx = txx + TW / 2
              const tcy = tyy + TH / 2
              let ox = 0
              let oy = 0
              for (const wv of waves) {
                const ddx = tcx - wv.hx
                const ddy = tcy - wv.hy
                const d = Math.hypot(ddx, ddy) || 1
                const g = d - wv.front
                const env = Math.exp(-(g * g) / (2 * sigma * sigma)) * wv.decay
                if (env < 0.015) continue
                const amount = Math.sin((g / 150) * Math.PI * 2) * 30 * env
                ox += (ddx / d) * amount
                oy += (ddy / d) * amount
              }
              if (ox * ox + oy * oy < 0.4) continue
              ctx.drawImage(frame, txx * dpr, tyy * dpr, TW * dpr, TH * dpr, txx + ox, tyy + oy, TW, TH)
            }
          }
        }
      } else if (fillP > 0) {
        for (let col = 0; col < cols; col += 1) {
          const cp = Math.min(Math.max((fillP * 1.55 - stagger[col] * 0.55) / 1.0, 0), 1)
          const visRows = Math.round(cp * rows)
          if (visRows <= 0) continue
          const sliceH = visRows * CELL_H
          ctx.drawImage(off, col * CELL_W * dpr, 0, CELL_W * dpr, sliceH * dpr, col * CELL_W, 0, CELL_W, sliceH)
          if (cp < 1) {
            ctx.font = `600 ${FONT_SIZE}px ${MONO}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.shadowColor = '#39ff5e'
            ctx.shadowBlur = 8
            ctx.fillStyle = '#eaffea'
            ctx.fillText('█', (col + 0.5) * CELL_W, (visRows + 0.5) * CELL_H)
            ctx.shadowBlur = 0
          }
        }
      }
      ctx.globalAlpha = 1

      // ---- wave facts: each impact surfaces one proof point ----
      // the text lights up only once the real-time wavefront has actually
      // rolled across the screen and reached its side; it then holds while
      // the scroll continues and fades before the hero (or the dissolve)
      // arrives at its spot
      const WAVE_REACH = 0.7 // seconds ≈ front travel time to the far side
      for (let i = 0; i < 2; i += 1) {
        const el = i === 0 ? fact1Ref.current : fact2Ref.current
        if (!el) continue
        let a = 0
        let slide = i === 0 ? 36 : -36
        if (fallP > 0 && hitTimes[i] !== null) {
          const ramp = smoothstep(now - hitTimes[i], WAVE_REACH, WAVE_REACH + 0.6)
          const hold =
            i === 0
              ? 1 - smoothstep(fallP, 0.5, 0.57)
              : 1 - smoothstep(fallP, 0.78, 0.85)
          a = ramp * hold
          slide *= 1 - ramp
        }
        el.style.opacity = String(a)
        el.style.transform = `translateX(${slide.toFixed(1)}px)`
      }

      // ---- hero geometry ----
      const cx = (heroCol + 0.5) * CELL_W
      const cy = (heroRow + 0.5) * CELL_H

      if (pop > 0 && fallP <= 0) {
        ctx.fillStyle = '#020402'
        ctx.fillRect(heroCol * CELL_W, heroRow * CELL_H, CELL_W, CELL_H)
      }

      // ---- the & hero ----
      // landing target: the actual & of the Web&Style wordmark below
      let tx = cx
      let realTy = h + 300
      let tSize = FONT_SIZE * 3.4
      const amp = document.querySelector('.choose__amp')
      if (amp) {
        const r = amp.getBoundingClientRect()
        tx = r.left + r.width / 2
        realTy = r.top + r.height / 2
        tSize = r.height * 0.72
      }
      // while the wordmark is below the fold the hero falls IN FRAME near the
      // bottom; it locks onto the real & once the wordmark scrolls into view
      const lock = smoothstep(realTy, h * 1.05, h * 0.72)
      const handoff = fallP >= 0.98 && lock >= 0.98

      if (ignite > 0 && !handoff) {
        const ty = h * 0.82 * (1 - lock) + realTy * lock
        const sizeTarget = FONT_SIZE * 3.4 * (1 - lock) + tSize * lock

        const spins =
          (smoothstep(fallP, HIT_1, HIT_1 + 0.22) + smoothstep(fallP, HIT_2, HIT_2 + 0.22)) *
          Math.PI *
          2

        const freeX = pathX(fallP, cx, w)
        const freeY = freeYAt(fallP, cy, h)
        const cnv = smoothstep(fallP, 0.72, 0.98)
        const x = freeX + (tx - freeX) * cnv
        const y = freeY + (ty - freeY) * cnv

        const size = (FONT_SIZE + (FONT_SIZE * 3.4 - FONT_SIZE) * pop) * (1 - cnv) + sizeTarget * cnv
        const wobble = Math.sin(now * 2.2) * 0.12 * fallP * (1 - cnv)

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(spins + wobble)
        ctx.font = `600 ${size}px ${MONO}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // green the whole journey — gold only comes when it merges with the
        // wordmark (handled by the DOM glyph after handoff)
        ctx.shadowColor = '#39ff5e'
        ctx.shadowBlur = 6 + ignite * 20 + pop * 14 + Math.sin(now * 3.4) * 6 * ignite
        const bright = 0.55 + ignite * 0.45
        ctx.fillStyle = `rgba(${Math.round(120 + 94 * bright)}, 255, ${Math.round(140 + 82 * bright)}, ${
          0.75 + ignite * 0.25
        })`
        ctx.fillText('&', 0, 0)
        ctx.restore()
      }

      // ---- handoff: the & stays hidden through the fall AND the logo's
      // descent (dataset.hold from ChooseSection) — a lone green & floating in
      // an empty palm looks silly. It only reveals green, then melts to gold,
      // in the final beat once the logo has actually landed around its slot,
      // so we SEE it become one with the logo's own & ----
      const ampEl = document.querySelector('.choose__amp')
      const ampHold = ampEl?.dataset.hold === '1'
      setAmpHidden((fallP > 0 && !handoff) || ampHold)
      if (handoff && !ampHold && !landed) {
        // ARRIVAL: the green & plunges into the slot (--green plays the drop-in)
        landed = true
        greenSince = null
        melted = false
        ampEl?.classList.remove('choose__amp--melt')
        ampEl?.classList.add('choose__amp--green')
      }
      if (landed && ampHold) {
        // scrolled back up before the melt finished — re-arm the reveal
        landed = false
        greenSince = null
        melted = false
        ampEl?.classList.remove('choose__amp--green', 'choose__amp--melt')
      }
      if (landed && !melted && ampEl && ampEl.getBoundingClientRect().top < h * 0.95) {
        // hold the arrived green a beat, then FLASH into gold (--melt)
        if (greenSince === null) greenSince = now
        else if (now - greenSince > 1.2) {
          melted = true
          ampEl.classList.remove('choose__amp--green')
          ampEl.classList.add('choose__amp--melt')
        }
      }
      if (fallP < 0.9 && landed) {
        landed = false
        greenSince = null
        melted = false
        ampEl?.classList.remove('choose__amp--green', 'choose__amp--melt')
      }
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', onPick)
      setAmpHidden(false)
    }
  }, [progressRef])

  return (
    <>
      <canvas ref={canvasRef} className="experience__code-canvas" />
      <div className="experience__fact experience__fact--left" ref={fact1Ref}>
        <span className="experience__fact-kicker">{t(WAVE_FACTS.fact1.kicker)}</span>
        <p>{t(WAVE_FACTS.fact1.text)}</p>
      </div>
      <div className="experience__fact experience__fact--right" ref={fact2Ref}>
        <span className="experience__fact-kicker">{t(WAVE_FACTS.fact2.kicker)}</span>
        <p>{t(WAVE_FACTS.fact2.text)}</p>
      </div>
    </>
  )
}
