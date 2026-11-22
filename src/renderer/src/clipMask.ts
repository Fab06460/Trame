import { ellipsePath, roundedRectPath, svgPathToSegments, type Segment } from '@/pdfMath'
import { scalePath } from '@/strokeStyle'
import type { TrameElement } from '@/types'

/**
 * Masque d'écrêtage : dans un groupe, un élément marqué `clip` n'est pas peint ; sa forme découpe tous les autres membres du groupe
 * (ce qui sort de la forme disparaît). Comme un masque de Figma : le groupe se déplace d'un bloc, et chaque membre reste déplaçable seul
 * (cadrer une image dans son masque). Les exports (PDF, SVG, images…) appliquent la découpe ; PowerPoint reçoit une image déjà découpée.
 */

/** Contour d'un élément dans le repère de sa boîte, en segments absolus (M, L, C, Z) ; `null` si l'élément n'a pas de surface lisible (trait, texte, image, chemin à arcs…). */
export function localSegments(el: TrameElement): Segment[] | null {
  if (el.width <= 0 || el.height <= 0) return null
  if (el.type === 'rect') return svgPathToSegments(roundedRectPath(el.width, el.height, el.cornerRadius ?? 0))
  if (el.type === 'ellipse') return svgPathToSegments(ellipsePath(el.width, el.height))
  if (el.type === 'path' && el.path && !el.open) {
    const scaled = scalePath(el.path, el.width / 100, el.height / 100)
    return scaled ? svgPathToSegments(scaled) : null
  }
  return null
}

/** Cet élément peut-il servir de masque ? (rectangle, ellipse ou tracé fermé lisible ; ni formule, QR code, graphique) */
export const canBeMask = (el: TrameElement): boolean => !el.formula && !el.qr && !el.chart && localSegments(el) !== null

/** Le contour d'un élément dans la page : tourné autour de son coin haut gauche (comme Konva) puis placé. */
export function pageSegments(el: TrameElement): Segment[] | null {
  const local = localSegments(el)
  if (!local) return null
  const r = ((el.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const at = (x: number, y: number): { x: number; y: number } => ({ x: el.x + x * cos - y * sin, y: el.y + x * sin + y * cos })
  return local.map((s): Segment => {
    if (s.op === 'Z') return s
    if (s.op === 'C') {
      const a = at(s.x1, s.y1)
      const b = at(s.x2, s.y2)
      const c = at(s.x, s.y)
      return { op: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: c.x, y: c.y }
    }
    const p = at(s.x, s.y)
    return { op: s.op, x: p.x, y: p.y }
  })
}

/** Un contour en données de chemin SVG (repère de la page). */
export function segmentsData(segments: readonly Segment[]): string {
  const n = (v: number): string => String(Math.round(v * 1000) / 1000)
  return segments.map((s) => (s.op === 'Z' ? 'Z' : s.op === 'C' ? `C${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}` : `${s.op}${n(s.x)} ${n(s.y)}`)).join('')
}

/** Boîte englobante d'un contour (points de contrôle compris : un peu plus large que la courbe, jamais plus étroite). */
export function segmentsBounds(segments: readonly Segment[]): { x: number; y: number; width: number; height: number } | null {
  const xs: number[] = []
  const ys: number[] = []
  for (const s of segments) {
    if (s.op === 'Z') continue
    xs.push(s.x)
    ys.push(s.y)
    if (s.op === 'C') xs.push(s.x1, s.x2), ys.push(s.y1, s.y2)
  }
  if (!xs.length) return null
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export interface ClipPlan {
  /** les masques : jamais peints dans les exports */
  masks: ReadonlySet<string>
  /** pour chaque élément découpé : le contour (repère de la page) et la règle de remplissage du masque */
  clips: ReadonlyMap<string, { maskId: string; segments: Segment[]; evenOdd: boolean }>
}

/** Un masque actif : marqué `clip`, dans un groupe qui a au moins un autre membre (seul, il se peint comme une forme ordinaire). */
const activeMask = (elements: readonly TrameElement[], el: TrameElement): boolean => el.clip === true && !!el.groupId && elements.some((o) => o.groupId === el.groupId && o.id !== el.id)

/** Les masques d'une page et ce qu'ils découpent. Un groupe a un seul masque (le premier). */
export function clipPlan(elements: readonly TrameElement[]): ClipPlan {
  const masks = new Set<string>()
  const clips = new Map<string, { maskId: string; segments: Segment[]; evenOdd: boolean }>()
  const byGroup = new Map<string, TrameElement>()
  for (const el of elements) {
    if (!activeMask(elements, el) || byGroup.has(el.groupId!)) continue
    if (!pageSegments(el)) continue // forme illisible : le groupe n'est pas masqué
    byGroup.set(el.groupId!, el)
    masks.add(el.id)
  }
  for (const el of elements) {
    const mask = el.groupId ? byGroup.get(el.groupId) : undefined
    if (!mask || el.id === mask.id) continue
    clips.set(el.id, { maskId: mask.id, segments: pageSegments(mask)!, evenOdd: mask.fillRule === 'evenodd' })
  }
  return { masks, clips }
}

/** Nettoyage à la lecture : `clip` n'a de sens que sur une forme d'un groupe. Modifie l'élément en place. */
export function sanitizeClip(element: object): void {
  const e = element as Record<string, unknown>
  if (e.clip !== true || typeof e.groupId !== 'string' || (e.type !== 'rect' && e.type !== 'ellipse' && e.type !== 'path') || e.open === true) delete e.clip
}
