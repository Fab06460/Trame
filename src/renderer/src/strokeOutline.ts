import { nanoid } from 'nanoid'
import { openGeometry } from '@/openPath'
import { localOutline, normalizedOutline, paperScope, type Combined } from '@/pathBoolean'
import { dashPattern, hasStroke } from '@/strokeStyle'
import type { TrameElement } from '@/types'

/**
 * Contour → forme : le trait d'un élément (sa couleur, son épaisseur, ses tirets, ses bouts) devient une surface pleine, un tracé fermé
 * modifiable point par point. Comme « Vectoriser le contour » d'un éditeur vectoriel : on peut ensuite remplir le trait d'un dégradé,
 * le combiner avec d'autres formes ou le découper.
 */

/** Éléments dont on sait convertir le contour : rectangle, ellipse et tracé (fermé ou ouvert) qui ont un contour visible. */
export const outlinable = (e: TrameElement): boolean =>
  (e.type === 'rect' || e.type === 'ellipse' || (e.type === 'path' && !!e.path)) && hasStroke(e) && e.width >= 0 && e.height >= 0 && !e.formula && !e.qr && !e.chart && !e.clip && !e.stack

interface Pt { x: number; y: number }
interface Run { pts: Pt[]; closed: boolean }

/** Limite des angles à pointe (celle du canvas) : au-delà, l'angle est coupé net. */
const MITER_LIMIT = 10

const f = (v: number): string => String(Math.round(v * 1000) / 1000)
const poly = (pts: Pt[]): string => `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`
const K = 0.5523
const circle = (c: Pt, r: number): string =>
  `M${f(c.x + r)} ${f(c.y)}C${f(c.x + r)} ${f(c.y + K * r)} ${f(c.x + K * r)} ${f(c.y + r)} ${f(c.x)} ${f(c.y + r)}C${f(c.x - K * r)} ${f(c.y + r)} ${f(c.x - r)} ${f(c.y + K * r)} ${f(c.x - r)} ${f(c.y)}C${f(c.x - r)} ${f(c.y - K * r)} ${f(c.x - K * r)} ${f(c.y - r)} ${f(c.x)} ${f(c.y - r)}C${f(c.x + K * r)} ${f(c.y - r)} ${f(c.x + r)} ${f(c.y - K * r)} ${f(c.x + r)} ${f(c.y)}Z`

/** Découpe une ligne brisée en tirets (`on` pixels peints, `off` pixels de vide, en commençant par un tiret) ; un tracé fermé est parcouru jusqu'à son point de départ. */
export function dashRuns(run: Run, on: number, off: number): Run[] {
  const pts = run.closed ? [...run.pts, run.pts[0]] : run.pts
  const out: Run[] = []
  let cur: Pt[] = [pts[0]]
  let painting = true
  let left = on
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i]
    const b = pts[i + 1]
    let len = Math.hypot(b.x - a.x, b.y - a.y)
    while (len > left + 1e-9) {
      const t = left / len
      const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (painting) {
        cur.push(cut)
        out.push({ pts: cur, closed: false })
      }
      painting = !painting
      cur = painting ? [cut] : []
      len -= left
      a = cut
      left = painting ? on : off
    }
    left -= len
    if (painting) cur.push(b)
  }
  if (painting && cur.length > 1) out.push({ pts: cur, closed: false })
  return out
}

/** Les points sans doublons consécutifs (un tracé fermé ne répète pas son premier point à la fin). */
function clean(pts: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = []
  for (const p of pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > 1e-6) out.push(p)
  if (closed && out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-6) out.pop()
  return out
}

/**
 * Les pièces dont la réunion est le trait d'une ligne brisée, chacune en données de chemin : un rectangle par segment, un raccord à chaque
 * sommet (rond : un disque, ou un petit biseau si l'angle est faible ; sinon : un angle à pointe ou coupé net selon la limite) et, pour un
 * trait à bouts ronds, un disque à chaque extrémité.
 */
export function strokePieces(run: Run, r: number, round: boolean): string[] {
  const pts = clean(run.pts, run.closed)
  const n = pts.length
  if (n === 0) return []
  if (n === 1) return round && !run.closed ? [circle(pts[0], r)] : []
  const segs = run.closed ? n : n - 1
  const dirs: Pt[] = []
  const out: string[] = []
  for (let i = 0; i < segs; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    dirs.push(d)
    const nx = -d.y * r
    const ny = d.x * r
    out.push(poly([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }]))
  }
  const from = run.closed ? 0 : 1
  const to = run.closed ? n : n - 1
  for (let v = from; v < to; v++) {
    const d1 = dirs[(v - 1 + segs) % segs]
    const d2 = dirs[v % segs]
    const cross = d1.x * d2.y - d1.y * d2.x
    const dot = d1.x * d2.x + d1.y * d2.y
    if (Math.abs(cross) < 1e-9 && dot > 0) continue
    const p = pts[v]
    if (dot < -0.9999) {
      if (round) out.push(circle(p, r))
      continue
    }
    // le côté extérieur du virage
    const side = cross > 0 ? -1 : 1
    const a = { x: p.x - d1.y * r * side, y: p.y + d1.x * r * side }
    const b = { x: p.x - d2.y * r * side, y: p.y + d2.x * r * side }
    if (round) {
      // un angle franc : un disque ; un angle faible (courbe aplatie) : le biseau suffit
      if (dot < 0.98) out.push(circle(p, r))
      else out.push(poly([p, a, b]))
    } else {
      const ratio = 1 / Math.sqrt(Math.max(1e-9, (1 + dot) / 2))
      if (ratio <= MITER_LIMIT) {
        const k = 1 / (1 + dot)
        out.push(poly([p, a, { x: p.x + (a.x - p.x + (b.x - p.x)) * k, y: p.y + (a.y - p.y + (b.y - p.y)) * k }, b]))
      } else out.push(poly([p, a, b]))
    }
  }
  if (round && !run.closed) out.push(circle(pts[0], r), circle(pts[n - 1], r))
  return out
}

export interface StrokeShape {
  /** le trait devenu surface, dans le repère de la page */
  outline: Combined
}

/**
 * Le trait d'un élément comme une surface (page entière, rotation appliquée). Un tracé ouvert a des bouts et des angles arrondis (comme à
 * l'écran) et ses pointes de flèche ou ronds de fin sont ajoutés ; un contour fermé garde des angles à pointe. `null` si rien n'est
 * peint. Les courbes sont aplaties à une précision bien inférieure au pixel.
 */
export async function strokeShape(el: TrameElement): Promise<StrokeShape | null> {
  if (!outlinable(el)) return null
  const s = await paperScope()
  const width = el.strokeWidth as number
  const r = width / 2
  const open = el.type === 'path' && el.open === true
  const marks: string[] = []
  let data: string
  let scaleX = 1
  let scaleY = 1
  if (open) {
    const g = openGeometry(el)
    data = g.stroke
    marks.push(...g.marks)
  } else {
    const o = localOutline(el)
    data = o.data
    scaleX = o.scaleX
    scaleY = o.scaleY
  }
  const source = new s.CompoundPath({ pathData: data, insert: false })
  if (scaleX !== 1 || scaleY !== 1) source.scale(scaleX, scaleY, new s.Point(0, 0))
  const tolerance = Math.min(0.5, Math.max(0.1, r * 0.05))
  const pieces: string[] = []
  const dash = el.strokeDashed ? dashPattern(width) : null
  for (const child of source.children as paper.Path[]) {
    const flat = child.clone({ insert: false }) as paper.Path
    flat.flatten(tolerance)
    const run: Run = { pts: flat.segments.map((sg) => ({ x: sg.point.x, y: sg.point.y })), closed: flat.closed }
    if (run.pts.length < 2) continue
    for (const part of dash ? dashRuns(run, dash[0], dash[1]) : [run]) pieces.push(...strokePieces(part, r, open))
  }
  pieces.push(...marks)
  if (!pieces.length) return null
  const children = pieces.map((d) => {
    const p = new s.Path({ pathData: d, insert: false })
    if (!p.clockwise) p.reverse() // tous dans le même sens : leur réunion se lit alors en « non nul »
    return p
  })
  const merged = new s.CompoundPath({ children, fillRule: 'nonzero', insert: false }).unite(new s.Path({ insert: false }), { insert: false })
  if (el.rotation) merged.rotate(el.rotation, new s.Point(0, 0))
  merged.translate(new s.Point(el.x, el.y))
  const outline = normalizedOutline(s, merged)
  return outline ? { outline } : null
}

/**
 * Les éléments qui remplacent `el` : le trait devient un tracé plein de la couleur du trait. Un tracé ouvert (ligne, flèche, crayon) est
 * remplacé par ce tracé ; une forme ou un tracé fermé reste en place sans contour, avec le trait en surface juste au-dessus.
 */
export function outlinedElements(el: TrameElement, c: Combined): TrameElement[] {
  const replaced = el.type === 'path' && el.open === true
  const { link, build, groupId, name, shadow, blend } = el
  const shape: TrameElement = {
    id: nanoid(8),
    type: 'path',
    ...(name ? { name } : {}),
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    rotation: 0,
    opacity: el.opacity,
    fill: el.stroke as string,
    ...(replaced && shadow ? { shadow } : {}),
    ...(blend ? { blend } : {}),
    ...(link && replaced ? { link } : {}),
    ...(build ? { build } : {}),
    ...(groupId ? { groupId } : {}),
    path: c.path,
    fillRule: 'evenodd'
  }
  if (replaced) return [shape]
  const { stroke: _s, strokeWidth: _w, strokeDashed: _d, ...base } = el
  void _s
  void _w
  void _d
  return [base as TrameElement, shape]
}
