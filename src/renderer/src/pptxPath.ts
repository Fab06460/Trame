/**
 * Un tracé de Trame (chemin SVG dans un viewBox 100 × 100, étiré à la boîte de l'élément) en **forme libre** PowerPoint (`custGeom`) :
 * un objet modifiable, que l'on peut recolorer et dont on peut éditer les points, au lieu d'une image.
 */

import { lineEndPoints } from '@/openPath'
import type { TrameElement } from '@/types'

const IN_PER_PX = 1 / 96

/** Un point de la forme libre, tel que pptxgenjs l'attend (pouces, dans le repère de la boîte de la forme). */
export type PptxPoint =
  | { x: number; y: number; moveTo: true }
  | { x: number; y: number }
  | { x: number; y: number; curve: { type: 'cubic'; x1: number; y1: number; x2: number; y2: number } }
  | { close: true }

export interface PptxGeometry {
  points: PptxPoint[]
  /** nombre de sous-chemins (`M`) : plusieurs sous-chemins se percent ou se superposent selon la règle de remplissage */
  subpaths: number
}

/** Segment absolu, en unités du viewBox : `M x y`, `L x y`, `C x1 y1 x2 y2 x y` ou `Z`. */
interface Seg {
  c: 'M' | 'L' | 'C' | 'Z'
  p: number[]
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Arc elliptique SVG (écriture par extrémités) en courbes de Bézier cubiques, d'un quart de tour au plus chacune (SVG 1.1, annexe F.6). */
function arcToCubics(x1: number, y1: number, rxIn: number, ryIn: number, rotation: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] | null {
  if (x1 === x2 && y1 === y2) return []
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) return null // un arc sans rayon est un segment droit
  const phi = (rotation * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, den === 0 ? 0 : num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  else if (sweep && delta < 0) delta += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9))
  const step = delta / n
  const t = (4 / 3) * Math.tan(step / 4)
  const at = (a: number): [number, number] => [cx + cos * rx * Math.cos(a) - sin * ry * Math.sin(a), cy + sin * rx * Math.cos(a) + cos * ry * Math.sin(a)]
  const slope = (a: number): [number, number] => [-cos * rx * Math.sin(a) - sin * ry * Math.cos(a), -sin * rx * Math.sin(a) + cos * ry * Math.cos(a)]
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const a1 = theta1 + i * step
    const a2 = a1 + step
    const p1 = at(a1)
    const p2 = at(a2)
    const d1 = slope(a1)
    const d2 = slope(a2)
    out.push([p1[0] + t * d1[0], p1[1] + t * d1[1], p2[0] - t * d2[0], p2[1] - t * d2[1], i === n - 1 ? x2 : p2[0], i === n - 1 ? y2 : p2[1]])
  }
  return out
}

/**
 * Lit un chemin SVG (M L H V C S Q T A Z, en majuscules ou minuscules, plusieurs sous-chemins) et le rend en segments absolus : droites,
 * courbes cubiques (les quadratiques et les arcs sont convertis) et fermetures. `null` si le chemin est illisible ou vide.
 */
export function absoluteSegments(d: string): Seg[] | null {
  const segs: Seg[] = []
  let i = 0
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let prevCmd = ''
  let ctrlX = 0
  let ctrlY = 0
  const skip = (): void => {
    while (i < d.length && /[\s,]/.test(d[i])) i++
  }
  const num = (): number | null => {
    skip()
    NUMBER.lastIndex = i
    const m = NUMBER.exec(d)
    if (!m) return null
    i = NUMBER.lastIndex
    return Number(m[0])
  }
  const flag = (): boolean | null => {
    skip()
    const ch = d[i]
    if (ch !== '0' && ch !== '1') return null
    i++
    return ch === '1'
  }
  const line = (x: number, y: number): void => {
    segs.push({ c: 'L', p: [x, y] })
    cx = x
    cy = y
  }
  const cubic = (a: number, b: number, c: number, e: number, x: number, y: number): void => {
    segs.push({ c: 'C', p: [a, b, c, e, x, y] })
    ctrlX = c
    ctrlY = e
    cx = x
    cy = y
  }
  let cmd = ''
  for (;;) {
    skip()
    if (i >= d.length) break
    const ch = d[i]
    if (/[a-zA-Z]/.test(ch)) {
      if (!(ch.toUpperCase() in ARGS)) return null
      cmd = ch
      i++
      if (ch === 'Z' || ch === 'z') {
        segs.push({ c: 'Z', p: [] })
        cx = sx
        cy = sy
        prevCmd = 'Z'
        continue
      }
    } else if (!cmd || cmd === 'Z' || cmd === 'z') {
      return null // des nombres sans commande
    }
    const up = cmd.toUpperCase()
    const rel = cmd !== up
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    const need = ARGS[up]
    const v: number[] = []
    for (let k = 0; k < need; k++) {
      // les indicateurs d'un arc (3e et 4e valeurs) peuvent être collés aux valeurs suivantes : « a1 1 0 011 1 »
      const n = up === 'A' && (k === 3 || k === 4) ? flag() : num()
      if (n === null) return null
      v.push(Number(n))
    }
    if (segs.length === 0 && up !== 'M') return null
    // une commande qui suit une fermeture repart du début du sous-chemin
    if (prevCmd === 'Z' && up !== 'M') segs.push({ c: 'M', p: [cx, cy] })
    switch (up) {
      case 'M':
        segs.push({ c: 'M', p: [v[0] + ox, v[1] + oy] })
        cx = sx = v[0] + ox
        cy = sy = v[1] + oy
        cmd = rel ? 'l' : 'L' // les paires suivantes sont des segments droits
        break
      case 'L':
        line(v[0] + ox, v[1] + oy)
        break
      case 'H':
        line(v[0] + ox, cy)
        break
      case 'V':
        line(cx, v[0] + oy)
        break
      case 'C':
        cubic(v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy, v[4] + ox, v[5] + oy)
        break
      case 'S': {
        const smooth = prevCmd === 'C' || prevCmd === 'S'
        cubic(smooth ? 2 * cx - ctrlX : cx, smooth ? 2 * cy - ctrlY : cy, v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy)
        break
      }
      case 'Q':
      case 'T': {
        let qx: number
        let qy: number
        if (up === 'Q') {
          qx = v[0] + ox
          qy = v[1] + oy
        } else {
          const smooth = prevCmd === 'Q' || prevCmd === 'T'
          qx = smooth ? 2 * cx - ctrlX : cx
          qy = smooth ? 2 * cy - ctrlY : cy
        }
        const ex = (up === 'Q' ? v[2] : v[0]) + ox
        const ey = (up === 'Q' ? v[3] : v[1]) + oy
        const fromX = cx
        const fromY = cy
        cubic(fromX + (2 / 3) * (qx - fromX), fromY + (2 / 3) * (qy - fromY), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey)
        ctrlX = qx // la poignée mémorisée est celle de la quadratique
        ctrlY = qy
        break
      }
      case 'A': {
        const ex = v[5] + ox
        const ey = v[6] + oy
        const curves = arcToCubics(cx, cy, v[0], v[1], v[2], v[3] === 1, v[4] === 1, ex, ey)
        if (curves === null) line(ex, ey)
        else for (const c of curves) cubic(c[0], c[1], c[2], c[3], c[4], c[5])
        cx = ex
        cy = ey
        break
      }
    }
    prevCmd = up === 'A' ? 'A' : up
  }
  return segs.length > 1 && segs.some((s) => s.c !== 'M' && s.c !== 'Z') ? segs : null
}

/**
 * La forme libre PowerPoint d'un tracé : ses coordonnées (viewBox 100 × 100) sont étirées à la boîte de l'élément (`width` × `height` en
 * pixels de design, comme à l'écran : le trait garde la même épaisseur partout), puis écrites en pouces. `null` si le tracé est illisible.
 */
export function pptxGeometry(d: string, width: number, height: number): PptxGeometry | null {
  const segs = absoluteSegments(d)
  if (!segs) return null
  const kx = (width / 100) * IN_PER_PX
  const ky = (height / 100) * IN_PER_PX
  // pptxgenjs prend un nombre de 100 ou plus pour des EMU, pas des pouces : un tracé aussi grand n'est pas exporté en forme libre
  const limit = 90
  const X = (x: number): number => Math.round(x * kx * 1e5) / 1e5
  const Y = (y: number): number => Math.round(y * ky * 1e5) / 1e5
  const points: PptxPoint[] = []
  let subpaths = 0
  for (const s of segs) {
    if (s.c === 'M') {
      points.push({ x: X(s.p[0]), y: Y(s.p[1]), moveTo: true })
      subpaths++
    } else if (s.c === 'L') points.push({ x: X(s.p[0]), y: Y(s.p[1]) })
    else if (s.c === 'C') points.push({ x: X(s.p[4]), y: Y(s.p[5]), curve: { type: 'cubic', x1: X(s.p[0]), y1: Y(s.p[1]), x2: X(s.p[2]), y2: Y(s.p[3]) } })
    else points.push({ close: true })
  }
  const coords = points.flatMap((p) => ('close' in p ? [] : 'curve' in p ? [p.x, p.y, p.curve.x1, p.curve.y1, p.curve.x2, p.curve.y2] : [p.x, p.y]))
  if (coords.some((v) => !Number.isFinite(v) || Math.abs(v) > limit)) return null
  return { points, subpaths }
}

/** Une ligne droite à poser comme **ligne PowerPoint** : boîte non pivotée (en pixels de design) qui l'enferme, et sens (`flipH` / `flipV`). */
export interface StraightLine {
  x: number
  y: number
  w: number
  h: number
  flipH: boolean
  flipV: boolean
}

/**
 * Une ligne droite (`M x y L x y`) comme ligne PowerPoint : une forme libre plate (sans épaisseur) est mal dessinée par certains lecteurs
 * (en diagonale), et seule une vraie ligne porte les pointes de flèche. Ses extrémités sont placées dans la page **en tenant compte de la
 * rotation de l'élément** (autour de son coin haut-gauche) : la ligne posée n'est jamais pivotée. `null` si le tracé n'est pas une ligne droite.
 */
export function straightLine(el: Pick<TrameElement, 'path' | 'x' | 'y' | 'rotation' | 'width' | 'height'>): StraightLine | null {
  const pts = lineEndPoints(el.path)
  if (!pts) return null
  const r = (el.rotation * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const at = (vx: number, vy: number): [number, number] => {
    const lx = (vx * el.width) / 100
    const ly = (vy * el.height) / 100
    return [el.x + lx * cos - ly * sin, el.y + lx * sin + ly * cos]
  }
  const [x1, y1] = at(pts[0], pts[1])
  const [x2, y2] = at(pts[2], pts[3])
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x1 > x2, flipV: y1 > y2 }
}

/** Nom de la forme libre d'un tracé ouvert : sert à lui retrouver son contour pour l'arrondir (`roundOpenLines`). */
export const OPEN_SHAPE_NAME = 'Trait'

/**
 * pptxgenjs n'écrit ni bouts ni angles arrondis : on les ajoute au contour des tracés ouverts (crayon, surligneur, ligne, flèche, plume),
 * qui sont arrondis à l'écran. Le XML d'une diapositive entre, le XML corrigé sort ; le reste n'est pas touché.
 */
export function roundOpenLines(slideXml: string): string {
  const shape = new RegExp(`<p:sp><p:nvSpPr><p:cNvPr id="\\d+" name="${OPEN_SHAPE_NAME}"[\\s\\S]*?</p:sp>`, 'g')
  return slideXml.replace(shape, (sp) =>
    sp.replace(/<a:ln w="(\d+)">([\s\S]*?)<\/a:ln>/, (_m, w: string, inner: string) => {
      // ordre du schéma : remplissage, tirets, angle, pointe de début, pointe de fin
      const at = inner.search(/<a:(?:headEnd|tailEnd)/)
      const body = at === -1 ? `${inner}<a:round/>` : `${inner.slice(0, at)}<a:round/>${inner.slice(at)}`
      return `<a:ln w="${w}" cap="rnd">${body}</a:ln>`
    })
  )
}
