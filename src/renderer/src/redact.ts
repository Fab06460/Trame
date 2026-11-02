/**
 * Flou et pixellisation de zones d'une image, pour masquer un visage, un nom, une plaque… Le calcul se fait sur les pixels eux-mêmes (le
 * résultat REMPLACE l'image) : ce qui est masqué ne peut plus être retrouvé en retirant un réglage, ni dans le fichier ni dans les exports.
 * Ce module ne touche pas au DOM : il travaille sur un tampon RGBA (`ImageData` ou équivalent) pour être testable.
 */

/** Zone en fractions (0 à 1) de l'image d'origine. */
export interface RedactZone {
  x: number
  y: number
  width: number
  height: number
}

export type RedactMode = 'blur' | 'pixelate'
export type RedactShape = 'rect' | 'ellipse'

export interface RedactSettings {
  mode: RedactMode
  shape: RedactShape
  /** intensité de 1 (léger) à 10 (fort) */
  level: number
}

export const REDACT_LEVELS = { min: 1, max: 10, default: 7 }
export const DEFAULT_REDACT: RedactSettings = { mode: 'pixelate', shape: 'rect', level: REDACT_LEVELS.default }
/** Une zone plus petite que cette part de l'image (sur un côté) est ignorée : c'est un clic, pas un tracé. */
export const MIN_ZONE = 0.01

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const clampLevel = (l: number): number => Math.min(REDACT_LEVELS.max, Math.max(REDACT_LEVELS.min, Math.round(l) || REDACT_LEVELS.default))

/** Zone tracée entre deux points (en fractions de l'image, dans n'importe quel sens), bornée à l'image ; null si trop petite. */
export function zoneFromDrag(a: { x: number; y: number }, b: { x: number; y: number }): RedactZone | null {
  const x0 = clamp01(Math.min(a.x, b.x))
  const y0 = clamp01(Math.min(a.y, b.y))
  const x1 = clamp01(Math.max(a.x, b.x))
  const y1 = clamp01(Math.max(a.y, b.y))
  if (x1 - x0 < MIN_ZONE || y1 - y0 < MIN_ZONE) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Cases en pixels de la zone (bornées à l'image) ; null si elle ne couvre aucun pixel. */
function box(z: RedactZone, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const x0 = Math.max(0, Math.floor(z.x * w))
  const y0 = Math.max(0, Math.floor(z.y * h))
  const x1 = Math.min(w, Math.ceil((z.x + z.width) * w))
  const y1 = Math.min(h, Math.ceil((z.y + z.height) * h))
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null
}

/** Nombre de grosses cases sur le petit côté d'une zone pixellisée : 16 (léger) à 3 (fort). */
export const pixelCells = (level: number): number => Math.round(16 - ((clampLevel(level) - 1) * 13) / 9)

/** Rayon (en pixels) de chacune des trois passes de flou, proportionnel au petit côté de la zone. */
export const blurRadius = (level: number, minSide: number): number => Math.max(1, Math.round(minSide * (0.02 + (clampLevel(level) - 1) * 0.012)))

/** Moyenne par case : chaque case de `cell` pixels prend la couleur moyenne de ce qu'elle recouvre. Travaille sur la zone seulement. */
function pixelate(src: Float32Array, w: number, h: number, cell: number): void {
  for (let by = 0; by < h; by += cell) {
    for (let bx = 0; bx < w; bx += cell) {
      const ex = Math.min(w, bx + cell)
      const ey = Math.min(h, by + cell)
      const sum = [0, 0, 0, 0]
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) for (let c = 0; c < 4; c++) sum[c] += src[(y * w + x) * 4 + c]
      const n = (ex - bx) * (ey - by)
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) for (let c = 0; c < 4; c++) src[(y * w + x) * 4 + c] = sum[c] / n
    }
  }
}

/** Flou par moyenne glissante, sur la ligne (`stride` 4) ou la colonne (`stride` 4 × largeur) ; les bords se prolongent (rien ne vient d'ailleurs que de la zone). */
function boxBlurLine(buf: Float32Array, start: number, step: number, n: number, r: number, tmp: Float32Array): void {
  for (let c = 0; c < 4; c++) {
    const at = (i: number): number => buf[start + Math.min(n - 1, Math.max(0, i)) * step + c]
    let sum = 0
    for (let i = -r; i <= r; i++) sum += at(i)
    const size = 2 * r + 1
    for (let i = 0; i < n; i++) {
      tmp[i] = sum / size
      sum += at(i + r + 1) - at(i - r)
    }
    for (let i = 0; i < n; i++) buf[start + i * step + c] = tmp[i]
  }
}

function blur(src: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(Math.max(w, h))
  // trois passes de flou « boîte » ≈ un flou gaussien, sans irrégularité visible
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) boxBlurLine(src, y * w * 4, 4, w, r, tmp)
    for (let x = 0; x < w; x++) boxBlurLine(src, x * 4, w * 4, h, r, tmp)
  }
}

/** Applique une zone à l'image (en place). Retourne false si la zone ne couvre aucun pixel. */
export function applyZone(img: Pixels, zone: RedactZone, settings: RedactSettings): boolean {
  const b = box(zone, img.width, img.height)
  if (!b) return false
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const region = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 4; x++) region[y * w * 4 + x] = img.data[((b.y0 + y) * img.width + b.x0) * 4 + x]
  const minSide = Math.min(w, h)
  if (settings.mode === 'pixelate') pixelate(region, w, h, Math.max(2, Math.ceil(minSide / pixelCells(settings.level))))
  else blur(region, w, h, blurRadius(settings.level, minSide))
  const rx = w / 2
  const ry = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // ellipse inscrite dans la zone : les pixels hors de l'ellipse restent ceux de l'image
      if (settings.shape === 'ellipse' && ((x + 0.5 - rx) / rx) ** 2 + ((y + 0.5 - ry) / ry) ** 2 > 1) continue
      const to = ((b.y0 + y) * img.width + b.x0 + x) * 4
      for (let c = 0; c < 4; c++) img.data[to + c] = region[(y * w + x) * 4 + c]
    }
  }
  return true
}

/** Applique toutes les zones, dans l'ordre. */
export function applyZones(img: Pixels, zones: RedactZone[], settings: RedactSettings): void {
  for (const z of zones) applyZone(img, z, settings)
}

/** Réglages lus d'un contenu non fiable : valeurs inconnues remplacées par celles par défaut. */
export function sanitizeRedact(raw: Partial<RedactSettings> | undefined): RedactSettings {
  return {
    mode: raw?.mode === 'blur' ? 'blur' : 'pixelate',
    shape: raw?.shape === 'ellipse' ? 'ellipse' : 'rect',
    level: clampLevel(raw?.level ?? DEFAULT_REDACT.level)
  }
}
