import { loadCached } from '@/imageRender'
import { applyZones, type RedactSettings, type RedactZone } from '@/redact'

/** Plus grand côté de l'image rendue (au-delà elle est réduite : la mémoire d'un canvas n'est pas illimitée). */
const MAX_SIDE = 4096

/**
 * Image d'origine (non recadrée, non retournée) dont les zones sont floutées ou pixellisées, en data URL. Un JPEG reste un JPEG (92 %),
 * tout le reste devient un PNG. Les zones sont des fractions de l'image : elles valent pour n'importe quelle définition.
 */
export async function redactSource(src: string, zones: RedactZone[], settings: RedactSettings): Promise<string> {
  const img = await loadCached(src)
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const k = Math.min(1, MAX_SIDE / Math.max(nw, nh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(nw * k))
  canvas.height = Math.max(1, Math.round(nh * k))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyZones(pixels, zones, settings)
  ctx.putImageData(pixels, 0, 0)
  return src.startsWith('data:image/jpeg') ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png')
}
