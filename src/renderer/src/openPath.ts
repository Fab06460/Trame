import { scalePath } from '@/strokeStyle'
import type { LineEnd, LineEnds, TrameElement } from '@/types'

const ENDS: readonly LineEnd[] = ['arrow', 'dot']

/** Un tracé ouvert (trait à main levée, ligne, flèche) : peint seulement par son contour, jamais rempli. */
export const isOpenPath = (e: Pick<TrameElement, 'type' | 'open'>): boolean => e.type === 'path' && e.open === true

/** Le tracé est une ligne droite `M x y L x y` : ses deux extrémités (dans le viewBox 100 × 100), sinon `null`. */
export function lineEndPoints(path: string | undefined): [number, number, number, number] | null {
  const m = /^\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*$/.exec(path ?? '')
  if (!m) return null
  const v = m.slice(1).map(Number)
  return v.every(Number.isFinite) ? (v as [number, number, number, number]) : null
}

/** Les extrémités d'une ligne telles qu'elles s'appliquent : seulement pour une ligne droite, et rien si aucune n'est choisie. */
export function lineEndsOf(e: Pick<TrameElement, 'path' | 'open' | 'ends'>): LineEnds | null {
  if (!e.open || !e.ends || !lineEndPoints(e.path)) return null
  return e.ends.start || e.ends.end ? e.ends : null
}

/** Nettoyage à la lecture d'un fichier : `open` seulement sur un tracé, `ends` seulement sur un tracé ouvert, valeurs connues seulement. Modifie en place. */
export function sanitizeOpen(element: object): void {
  const e = element as Record<string, unknown>
  if (e.type !== 'path' || e.open !== true || typeof e.path !== 'string') {
    delete e.open
    delete e.ends
    return
  }
  const raw = e.ends as Record<string, unknown> | undefined
  const ends: LineEnds = {}
  if (raw && typeof raw === 'object') {
    if (ENDS.includes(raw.start as LineEnd)) ends.start = raw.start as LineEnd
    if (ENDS.includes(raw.end as LineEnd)) ends.end = raw.end as LineEnd
  }
  if (ends.start || ends.end) e.ends = ends
  else delete e.ends
  // un tracé ouvert n'a que son contour : sans contour il serait invisible
  if (typeof e.stroke !== 'string' || typeof e.strokeWidth !== 'number') {
    e.stroke = typeof e.fill === 'string' ? e.fill : '#000000'
    e.strokeWidth = 4
  }
}

/** Ce que l'on peint pour un tracé ouvert, en pixels de l'élément : le contour, et les remplissages des extrémités (pointes, ronds). */
export interface OpenGeometry {
  stroke: string
  marks: string[]
}

const K = 0.5523

function circle(cx: number, cy: number, r: number): string {
  const f = (v: number): string => String(Number(v.toFixed(3)))
  return `M${f(cx + r)} ${f(cy)} C${f(cx + r)} ${f(cy + K * r)} ${f(cx + K * r)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} C${f(cx - K * r)} ${f(cy + r)} ${f(cx - r)} ${f(cy + K * r)} ${f(cx - r)} ${f(cy)} C${f(cx - r)} ${f(cy - K * r)} ${f(cx - K * r)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} C${f(cx + K * r)} ${f(cy - r)} ${f(cx + r)} ${f(cy - K * r)} ${f(cx + r)} ${f(cy)} Z`
}

/**
 * Le tracé d'un tracé ouvert à la taille de son élément. Le chemin vit dans un viewBox 100 × 100 : ses coordonnées sont étirées (le trait
 * garde la même épaisseur partout). Une ligne droite avec des extrémités est raccourcie à la base de chaque pointe, et la pointe (ou le
 * rond) est calculée en pixels, pour qu'elle ne se déforme pas quand la ligne est oblique.
 */
export function openGeometry(e: Pick<TrameElement, 'path' | 'open' | 'ends' | 'width' | 'height' | 'strokeWidth'>): OpenGeometry {
  const path = e.path ?? ''
  const stretched = scalePath(path, e.width / 100, e.height / 100) ?? path
  const ends = lineEndsOf(e)
  const pts = lineEndPoints(path)
  if (!ends || !pts) return { stroke: stretched, marks: [] }
  const [x1, y1, x2, y2] = [pts[0] * (e.width / 100), pts[1] * (e.height / 100), pts[2] * (e.width / 100), pts[3] * (e.height / 100)]
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len < 1) return { stroke: stretched, marks: [] }
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const sw = Math.max(1, e.strokeWidth ?? 1)
  const head = Math.min(len * 0.45, Math.max(10, sw * 4))
  const half = head * 0.45
  const radius = Math.min(len / 4, Math.max(4, sw * 1.6))
  const marks: string[] = []
  const f = (v: number): string => String(Number(v.toFixed(3)))
  /** `dir` : vecteur unitaire qui sort de la ligne par cette extrémité ; rend le point où le trait doit s'arrêter. */
  const mark = (end: LineEnd | undefined, tx: number, ty: number, dir: [number, number]): [number, number] => {
    if (end === 'arrow') {
      const bx = tx - dir[0] * head
      const by = ty - dir[1] * head
      marks.push(`M${f(tx)} ${f(ty)} L${f(bx - dir[1] * half)} ${f(by + dir[0] * half)} L${f(bx + dir[1] * half)} ${f(by - dir[0] * half)} Z`)
      return [tx - dir[0] * head * 0.7, ty - dir[1] * head * 0.7]
    }
    if (end === 'dot') {
      marks.push(circle(tx, ty, radius))
      return [tx, ty]
    }
    return [tx, ty]
  }
  const a = mark(ends.start, x1, y1, [-ux, -uy])
  const b = mark(ends.end, x2, y2, [ux, uy])
  return { stroke: `M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}`, marks }
}
