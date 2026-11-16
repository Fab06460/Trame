/** Un point dans le repère de la page (pixels de design). */
export interface Pt {
  x: number
  y: number
}

/** Ce qu'il faut pour poser un tracé ouvert : la boîte qui l'entoure et son chemin dans un viewBox 100 × 100 étiré à cette boîte. */
export interface Drawn {
  x: number
  y: number
  width: number
  height: number
  path: string
}

const num = (v: number): string => String(Number(v.toFixed(2)))

/** Distance d'un point à un segment. */
function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Ramer–Douglas–Peucker : garde les points qui s'écartent de plus de `tolerance` de la droite qui joint leurs voisins retenus. */
export function simplify(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return [...points]
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [from, to] = stack.pop()!
    let far = -1
    let max = tolerance
    for (let i = from + 1; i < to; i++) {
      const d = distanceToSegment(points[i], points[from], points[to])
      if (d > max) {
        max = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = true
      stack.push([from, far], [far, to])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Courbe lisse qui passe par tous les points (Catmull–Rom convertie en courbes de Bézier cubiques) : `M x y C …`. Avec deux points,
 * un simple segment.
 */
export function smoothPath(points: readonly Pt[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  let d = `M${num(first.x)} ${num(first.y)}`
  if (points.length === 1) return d
  if (points.length === 2) return `${d} L${num(points[1].x)} ${num(points[1].y)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    d += ` C${num(p1.x + (p2.x - p0.x) / 6)} ${num(p1.y + (p2.y - p0.y) / 6)} ${num(p2.x - (p3.x - p1.x) / 6)} ${num(p2.y - (p3.y - p1.y) / 6)} ${num(p2.x)} ${num(p2.y)}`
  }
  return d
}

/** La boîte qui entoure les points (au moins 1 px de chaque côté, pour qu'un trait droit ait une zone à saisir) et leurs coordonnées dans le viewBox 100 × 100. */
function boxOf(points: readonly Pt[]): { x: number; y: number; width: number; height: number; norm: Pt[] } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const x = (minX + maxX) / 2 - width / 2
  const y = (minY + maxY) / 2 - height / 2
  return { x, y, width, height, norm: points.map((p) => ({ x: ((p.x - x) / width) * 100, y: ((p.y - y) / height) * 100 })) }
}

/**
 * Un trait à main levée : points réduits (`tolerance` en pixels) puis lissés en courbes. Un clic sans mouvement donne un point (rond).
 * Rend `null` s'il n'y a aucun point.
 */
export function strokeFromPoints(points: readonly Pt[], tolerance: number): Drawn | null {
  const clean = points.filter((p, i) => Number.isFinite(p.x) && Number.isFinite(p.y) && (i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y))
  if (!clean.length) return null
  // un point seul : un segment minuscule, que les bouts arrondis dessinent en rond
  const pts = clean.length === 1 ? [clean[0], { x: clean[0].x + 0.01, y: clean[0].y }] : simplify(clean, Math.max(0.1, tolerance))
  const { norm, ...box } = boxOf(pts)
  return { ...box, path: smoothPath(norm) }
}

/** Une ligne droite de `a` à `b`. */
export function lineFromPoints(a: Pt, b: Pt): Drawn {
  const { norm, ...box } = boxOf([a, b])
  // l'ordre des points est gardé : le début de la ligne reste le premier point posé (pour les extrémités)
  return { ...box, path: `M${num(norm[0].x)} ${num(norm[0].y)} L${num(norm[1].x)} ${num(norm[1].y)}` }
}

/** `b` ramené à l'angle le plus proche, parmi des multiples de `stepDegrees`, autour de `a` (Maj pendant le tracé d'une ligne). */
export function snapAngle(a: Pt, b: Pt, stepDegrees = 15): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return b
  const step = (stepDegrees * Math.PI) / 180
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len }
}
