import * as THREE from 'three'

// real screenshots of generic/templated small-business sites (Durable builds
// + user-collected template examples) — deliberately forgettable designs,
// matching the "sea of forgettable websites" narrative
export const SCREENSHOT_URLS = [
  '/assets/mockup-shots/naturepure.jpg',
  '/assets/mockup-shots/ferens.jpg',
  '/assets/mockup-shots/prolificpours.jpg',
  '/assets/mockup-shots/littlecooks.jpg',
  '/assets/mockup-shots/solecial.jpg',
  '/assets/mockup-shots/dnmnyc.jpg',
  '/assets/mockup-shots/colorwonder.jpg',
  '/assets/mockup-shots/onebigparty.jpg',
  '/assets/mockup-shots/agencytpl.jpg',
  '/assets/mockup-shots/aibuilder.jpg',
  '/assets/mockup-shots/beint.jpg',
  '/assets/mockup-shots/biznus.jpg',
  '/assets/mockup-shots/construction.jpg',
  '/assets/mockup-shots/corporate1.jpg',
  '/assets/mockup-shots/dealership.jpg',
  '/assets/mockup-shots/financity.jpg',
  '/assets/mockup-shots/misc0.jpg',
  '/assets/mockup-shots/misc1.jpg',
  '/assets/mockup-shots/misc2.jpg',
  '/assets/mockup-shots/misc3.jpg',
  '/assets/mockup-shots/nailart.jpg',
  '/assets/mockup-shots/restaurant.jpg',
  '/assets/mockup-shots/screenshot1.jpg',
  '/assets/mockup-shots/selling.jpg',
  '/assets/mockup-shots/techstartup.jpg',
  '/assets/mockup-shots/webpresence.jpg',
  '/assets/mockup-shots/wrapley.jpg',
  '/assets/mockup-shots/agencytpl2.jpg',
  '/assets/mockup-shots/blackelegant.jpg',
  '/assets/mockup-shots/corporate2.jpg',
  '/assets/mockup-shots/fashion.jpg',
  '/assets/mockup-shots/firstpage.jpg',
  '/assets/mockup-shots/generic1.jpg',
  '/assets/mockup-shots/generic2.jpg',
  '/assets/mockup-shots/gradientblog.jpg',
  '/assets/mockup-shots/medspa.jpg',
  '/assets/mockup-shots/misc4.jpg',
  '/assets/mockup-shots/misc5.jpg',
  '/assets/mockup-shots/misc6.jpg',
  '/assets/mockup-shots/misc7.jpg',
  '/assets/mockup-shots/misc8.jpg',
  '/assets/mockup-shots/misc9.jpg',
  '/assets/mockup-shots/misc10.jpg',
  '/assets/mockup-shots/onlineshop.jpg',
  '/assets/mockup-shots/presentation.jpg',
  '/assets/mockup-shots/videograph.jpg',
]

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function toRoundedCardTexture(image) {
  const w = 420
  const h = 420
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  roundedRectPath(ctx, 0, 0, w, h, 16)
  ctx.clip()

  // cover-fit crop, anchored toward the top (that's where the interesting
  // hero content is on most of these landing pages)
  const scale = Math.max(w / image.width, h / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.drawImage(image, (w - dw) / 2, Math.min(0, h - dh), dw, dh)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}
