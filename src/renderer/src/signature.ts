/** Un point du tracé, dans le repère de la zone de dessin (pixels). */
export type SigPoint = readonly [number, number]
export type SigStroke = SigPoint[]

/** Une signature dessinée : les traits tels que tracés, l'épaisseur du trait (mêmes unités) et la couleur de l'encre. */
export interface Ink {
  strokes: SigStroke[]
  width: number
  color: string
}

/** Zone de dessin (pixels logiques) : large et peu haute, comme une ligne de signature. */
export const PAD_WIDTH = 600
export const PAD_HEIGHT = 220

export const SIG_COLORS = ['#1e1f24', '#1f3a93', '#8b1a1a'] as const
export const SIG_WIDTHS = { fine: 2, medium: 3.5, bold: 6 } as const
export type SigWidth = keyof typeof SIG_WIDTHS

export const MAX_STROKES = 40
export const MAX_POINTS = 2000
export const MIN_INK_WIDTH = 0.5
export const MAX_INK_WIDTH = 30
/** Nombre de signatures gardées, et taille maximale d'une image enregistrée (data URL). */
export const MAX_SAVED = 10
export const MAX_IMAGE_CHARS = 700_000

/** Largeur d'une signature insérée, en part de la largeur de la page. */
export const SIGNATURE_PAGE_SHARE = 0.28

const HEX = /^#[0-9a-f]{6}$/i
const SIDES = 12

/** Deux relevés plus proches que cela (en pixels) ne font qu'un. */
const MIN_STEP = 1.2

/** Ajoute un point à un trait (ignoré s'il est trop proche du précédent ou si le trait est plein). Ne modifie pas le trait reçu. */
export function extendStroke(stroke: SigStroke, p: SigPoint): SigStroke {
  const last = stroke[stroke.length - 1]
  if (stroke.length >= MAX_POINTS) return stroke
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP) return stroke
  return [...stroke, p]
}

/** Ajoute un trait fini à ceux d'une signature ; au-delà du plafond, le trait est refusé (la signature reste intacte). */
export const addStroke = (strokes: readonly SigStroke[], s: SigStroke): SigStroke[] => (s.length && strokes.length < MAX_STROKES ? [...strokes, s] : [...strokes])

/** Ramer-Douglas-Peucker : retire les points qui s'écartent de moins de `epsilon` de la droite qui les encadre. */
export function simplify(points: SigStroke, epsilon: number): SigStroke {
  if (points.length < 3) return [...points]
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number]
    let far = -1
    let farDist = epsilon
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i], points[a], points[b])
      if (d > farDist) {
        far = i
        farDist = d
      }
    }
    if (far >= 0) {
      keep[far] = true
      stack.push([a, far], [far, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

function distanceToSegment(p: SigPoint, a: SigPoint, b: SigPoint): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Arrondit les angles (Chaikin) en gardant les deux extrémités : un tracé à la main devient une courbe continue. */
export function smooth(points: SigStroke, rounds = 2): SigStroke {
  let pts: SigStroke = points
  for (let r = 0; r < rounds && pts.length > 2; r++) {
    const next: SigPoint[] = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

/** Le tracé tel qu'on le dessine : allégé puis arrondi. */
export const shapeStroke = (stroke: SigStroke): SigStroke => smooth(simplify(stroke, 0.8))

const strokesWithPoints = (strokes: readonly SigStroke[]): SigStroke[] => strokes.filter((s) => s.length > 0)

export interface InkBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Rectangle qui contient tous les points (sans l'épaisseur du trait) ; null si rien n'est dessiné. */
export function inkBounds(strokes: readonly SigStroke[]): InkBox | null {
  let box: InkBox | null = null
  for (const s of strokesWithPoints(strokes))
    for (const [x, y] of s) {
      if (!box) box = { minX: x, minY: y, maxX: x, maxY: y }
      else {
        box.minX = Math.min(box.minX, x)
        box.minY = Math.min(box.minY, y)
        box.maxX = Math.max(box.maxX, x)
        box.maxY = Math.max(box.maxY, y)
      }
    }
  return box
}

/** Proportions (largeur / hauteur) de la signature, épaisseur du trait comprise ; null si rien n'est dessiné. */
export function inkAspect(ink: Ink): number | null {
  const box = inkBounds(ink.strokes)
  if (!box) return null
  return (box.maxX - box.minX + ink.width) / (box.maxY - box.minY + ink.width)
}

/** Aire signée d'un polygone (formule des lacets) : le signe donne le sens de parcours. */
export function signedArea(poly: ReadonlyArray<SigPoint>): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

function disc(cx: number, cy: number, r: number): SigPoint[] {
  const out: SigPoint[] = []
  for (let i = 0; i < SIDES; i++) {
    const a = -(2 * Math.PI * i) / SIDES
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

/** Rectangle autour du segment ab, de demi-largeur r. Même sens de parcours que `disc`, pour que le remplissage fasse l'union. */
function quad(a: SigPoint, b: SigPoint, r: number): SigPoint[] | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  const nx = (-dy / len) * r
  const ny = (dx / len) * r
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny]
  ]
}

/** Angle de virage (degrés) au point b, entre ab et bc. */
function turn(a: SigPoint, b: SigPoint, c: SigPoint): number {
  const d1 = Math.atan2(b[1] - a[1], b[0] - a[0])
  const d2 = Math.atan2(c[1] - b[1], c[0] - b[0])
  let d = Math.abs(d2 - d1)
  if (d > Math.PI) d = 2 * Math.PI - d
  return (d * 180) / Math.PI
}

export interface InkShape {
  /** contour rempli, dans un viewBox 100 × 100 (comme les autres formes) */
  path: string
  /** dimensions réelles de l'élément, en pixels de la page */
  width: number
  height: number
}

/**
 * Transforme la signature en forme pleine, à la largeur voulue : chaque trait devient une suite de rectangles et de disques dont
 * l'union dessine le trait. Une forme pleine passe partout (PDF, SVG, PowerPoint) sans qu'il faille gérer de contour à part.
 * Retourne null s'il n'y a rien à dessiner.
 */
export function inkShape(ink: Ink, targetWidth: number): InkShape | null {
  const box = inkBounds(ink.strokes)
  if (!box || !(targetWidth > 0)) return null
  const w = Math.min(MAX_INK_WIDTH, Math.max(MIN_INK_WIDTH, ink.width))
  const k = targetWidth / (box.maxX - box.minX + w)
  const width = targetWidth
  const height = (box.maxY - box.minY + w) * k
  const r = (w * k) / 2
  const place = (p: SigPoint): SigPoint => [(p[0] - box.minX + w / 2) * k, (p[1] - box.minY + w / 2) * k]
  const polygons: SigPoint[][] = []
  for (const raw of strokesWithPoints(ink.strokes)) {
    const pts = shapeStroke(raw).map(place)
    if (pts.length === 1) polygons.push(disc(pts[0][0], pts[0][1], r))
    for (let i = 0; i < pts.length - 1; i++) {
      const q = quad(pts[i], pts[i + 1], r)
      if (q) polygons.push(q)
      // disque aux extrémités et aux virages marqués : ailleurs, le raccord des rectangles ne laisse aucun creux visible
      if (i === 0) polygons.push(disc(pts[0][0], pts[0][1], r))
      if (i === pts.length - 2) polygons.push(disc(pts[i + 1][0], pts[i + 1][1], r))
      if (i + 2 < pts.length && turn(pts[i], pts[i + 1], pts[i + 2]) > 12) polygons.push(disc(pts[i + 1][0], pts[i + 1][1], r))
    }
  }
  const fx = 100 / width
  const fy = 100 / height
  const num = (v: number): string => String(Math.round(v * 100) / 100)
  const path = polygons.map((poly) => `M${poly.map(([x, y]) => `${num(x * fx)} ${num(y * fy)}`).join('L')}Z`).join('')
  return { path, width, height }
}

// ———————————————————— signatures enregistrées ————————————————————

export type StoredSignature =
  | { id: string; kind: 'ink'; ink: Ink }
  | { id: string; kind: 'image'; src: string; aspect: number }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseInk(raw: unknown): Ink | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!finite(o.width) || o.width < MIN_INK_WIDTH || o.width > MAX_INK_WIDTH) return null
  if (typeof o.color !== 'string' || !HEX.test(o.color)) return null
  if (!Array.isArray(o.strokes)) return null
  const strokes: SigStroke[] = []
  for (const s of o.strokes.slice(0, MAX_STROKES)) {
    if (!Array.isArray(s)) continue
    const pts: SigPoint[] = []
    for (const p of s.slice(0, MAX_POINTS)) if (Array.isArray(p) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) < 1e5 && Math.abs(p[1]) < 1e5) pts.push([p[0], p[1]])
    if (pts.length) strokes.push(pts)
  }
  return strokes.length ? { strokes, width: o.width, color: o.color.toLowerCase() } : null
}

/** Lecture tolérante du fichier des signatures enregistrées : une entrée invalide est ignorée, les autres restent. */
export function parseSignatures(json: string | null): StoredSignature[] {
  if (!json) return []
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  const list = data && typeof data === 'object' ? (data as { signatures?: unknown }).signatures : null
  if (!Array.isArray(list)) return []
  const out: StoredSignature[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    if (typeof o.id !== 'string' || !/^[\w-]{1,32}$/.test(o.id) || seen.has(o.id)) continue
    if (o.kind === 'ink') {
      const ink = parseInk(o.ink)
      if (ink) out.push({ id: o.id, kind: 'ink', ink })
    } else if (o.kind === 'image') {
      if (typeof o.src === 'string' && o.src.startsWith('data:image/png;base64,') && o.src.length <= MAX_IMAGE_CHARS && finite(o.aspect) && o.aspect > 0.05 && o.aspect < 50)
        out.push({ id: o.id, kind: 'image', src: o.src, aspect: o.aspect })
    } else continue
    seen.add(o.id)
    if (out.length >= MAX_SAVED) break
  }
  return out
}

export const serializeSignatures = (signatures: readonly StoredSignature[]): string => JSON.stringify({ version: 1, signatures })

/** Ajoute une signature en tête de liste ; la plus ancienne part au-delà du plafond. */
export const withSignature = (list: readonly StoredSignature[], s: StoredSignature): StoredSignature[] => [s, ...list].slice(0, MAX_SAVED)

// ———————————————————— signature importée (photo, scan) ————————————————————

export interface PaperOptions {
  /** couleur imposée à l'encre (#rrggbb) ; null pour garder celle de l'image */
  recolor: string | null
  /** de 0 (fond strict : seul le plus foncé reste) à 1 (tolérant : le gris clair reste aussi) */
  tolerance: number
}

/** Niveau de clarté du papier : le 90e centile des clartés (le papier occupe l'essentiel d'une photo de signature). */
export function paperLevel(lum: Uint8Array | number[]): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of lum) hist[Math.max(0, Math.min(255, Math.round(v)))]++
  const target = lum.length * 0.9
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= target) return i
  }
  return 255
}

/**
 * Rend le papier transparent et garde l'encre : plus un pixel est sombre par rapport au papier, plus il est opaque. Les pixels déjà
 * transparents comptent comme du papier. Modifie `rgba` en place.
 */
export function removePaper(rgba: Uint8ClampedArray, options: PaperOptions): void {
  const n = rgba.length / 4
  const lum = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255
    const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
    lum[i] = 255 - (255 - l) * a
  }
  const paper = Math.max(60, paperLevel(lum))
  const tol = Math.max(0, Math.min(1, options.tolerance))
  const hi = paper * (0.72 + 0.23 * tol)
  const lo = paper * (0.3 + 0.2 * tol)
  const ink = options.recolor && HEX.test(options.recolor) ? [parseInt(options.recolor.slice(1, 3), 16), parseInt(options.recolor.slice(3, 5), 16), parseInt(options.recolor.slice(5, 7), 16)] : null
  for (let i = 0; i < n; i++) {
    const alpha = Math.max(0, Math.min(1, (hi - lum[i]) / Math.max(1, hi - lo)))
    if (ink) {
      rgba[i * 4] = ink[0]
      rgba[i * 4 + 1] = ink[1]
      rgba[i * 4 + 2] = ink[2]
    }
    rgba[i * 4 + 3] = Math.round(alpha * 255)
  }
}

export interface CropBox {
  x: number
  y: number
  width: number
  height: number
}

/** Rectangle qui contient tout ce qui est visible (opacité au moins `min`), avec une petite marge ; null si l'image est vide. */
export function visibleBounds(rgba: Uint8ClampedArray, width: number, height: number, min = 24, margin = 2): CropBox | null {
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (rgba[(y * width + x) * 4 + 3] >= min) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - margin)
  y0 = Math.max(0, y0 - margin)
  x1 = Math.min(width - 1, x1 + margin)
  y1 = Math.min(height - 1, y1 + margin)
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
