import type { Drawn, Pt } from '@/freehand'
import type { TrameElement } from '@/types'

/**
 * Un point d'ancrage d'un tracé de la plume : sa position et, s'il y en a, les deux poignées de la courbe (positions absolues, dans le
 * même repère que le point). `inH` règle l'arrivée de la courbe sur le point, `outH` son départ.
 */
export interface PenNode {
  x: number
  y: number
  inH?: Pt
  outH?: Pt
}

export interface PenPath {
  nodes: PenNode[]
  closed: boolean
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
const same = (a: Pt, b: Pt, eps = 1e-6): boolean => dist(a, b) <= eps

const fmt = (v: number, digits: number): string => String(Number(v.toFixed(digits)))

/** Le chemin SVG des points : un segment droit (`L`) entre deux points sans poignée, une courbe de Bézier cubique (`C`) sinon. */
export function pathFromNodes(nodes: readonly PenNode[], closed: boolean, digits = 2): string {
  if (!nodes.length) return ''
  const f = (v: number): string => fmt(v, digits)
  let d = `M${f(nodes[0].x)} ${f(nodes[0].y)}`
  const count = closed ? nodes.length : nodes.length - 1
  for (let i = 0; i < count; i++) {
    const a = nodes[i]
    const b = nodes[(i + 1) % nodes.length]
    if (!a.outH && !b.inH) d += ` L${f(b.x)} ${f(b.y)}`
    else {
      const c1 = a.outH ?? a
      const c2 = b.inH ?? b
      d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`
    }
  }
  return closed && nodes.length > 1 ? `${d} Z` : d
}

/**
 * Relit un chemin fait de `M`, `L`, `C` et `Z` en coordonnées absolues, en un seul sous-chemin : c'est ce que sait modifier la plume.
 * Les autres commandes (arcs, courbes quadratiques, coordonnées relatives, plusieurs sous-chemins) rendent `null`.
 */
export function nodesFromPath(d: string | undefined): PenPath | null {
  if (!d) return null
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (!tokens) return null
  const nodes: PenNode[] = []
  let closed = false
  let cmd = ''
  let args: number[] = []
  let started = false
  let ended = false
  const need: Record<string, number> = { M: 2, L: 2, C: 6, Z: 0 }
  const flush = (): boolean => {
    if (!cmd) return true
    const n = need[cmd]
    if (n === undefined) return false
    if (cmd === 'Z') {
      if (!nodes.length) return false
      closed = true
      ended = true
      return true
    }
    if (ended || args.length === 0 || args.length % n !== 0 || args.some((v) => !Number.isFinite(v))) return false
    for (let i = 0; i < args.length; i += n) {
      const a = args.slice(i, i + n)
      if (cmd === 'M') {
        // un deuxième « M » ferait un deuxième sous-chemin ; les paires suivantes d'un « M » valent des « L »
        if (started && i === 0) return false
        started = true
        nodes.push({ x: a[0], y: a[1] })
      } else if (!nodes.length) return false
      else if (cmd === 'L') nodes.push({ x: a[0], y: a[1] })
      else {
        const prev = nodes[nodes.length - 1]
        const out = { x: a[0], y: a[1] }
        const inn = { x: a[2], y: a[3] }
        const node: PenNode = { x: a[4], y: a[5] }
        if (!same(out, prev)) prev.outH = out
        if (!same(inn, node)) node.inH = inn
        nodes.push(node)
      }
    }
    return true
  }
  for (const t of tokens) {
    if (/^[a-zA-Z]$/.test(t)) {
      if (!flush()) return null
      cmd = t
      args = []
      if (!(t in need)) return null
    } else {
      if (!cmd) return null
      args.push(Number(t))
    }
  }
  if (!flush() || nodes.length < 2) return null
  if (closed && nodes.length > 2 && same(nodes[0], nodes[nodes.length - 1], 0.01)) {
    // « … L x0 y0 Z » : le dernier point retombe sur le premier, qui devient celui d'arrivée
    const last = nodes.pop() as PenNode
    if (last.inH) nodes[0].inH = last.inH
  }
  return { nodes, closed }
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Les quatre points de la courbe du segment `i` (de `i` au suivant). */
export function segmentCurve(nodes: readonly PenNode[], i: number): [Pt, Pt, Pt, Pt] {
  const a = nodes[i]
  const b = nodes[(i + 1) % nodes.length]
  return [a, a.outH ?? a, b.inH ?? b, b]
}

/** Nombre de segments d'un tracé (un de plus s'il est fermé). */
export const segmentCount = (nodes: readonly PenNode[], closed: boolean): number => (nodes.length < 2 ? 0 : closed ? nodes.length : nodes.length - 1)

export function bezierAt(c: readonly [Pt, Pt, Pt, Pt], t: number): Pt {
  const [p0, p1, p2, p3] = c
  const a = lerp(p0, p1, t)
  const b = lerp(p1, p2, t)
  const d = lerp(p2, p3, t)
  return lerp(lerp(a, b, t), lerp(b, d, t), t)
}

const SAMPLES = 24

/** La boîte exacte (à l'échantillonnage près) de la courbe : les poignées n'en font pas partie, seule la courbe compte. */
export function curveBounds(nodes: readonly PenNode[], closed: boolean): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (p: Pt): void => {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  for (const n of nodes) grow(n)
  for (let i = 0; i < segmentCount(nodes, closed); i++) {
    const c = segmentCurve(nodes, i)
    if (c[0] === c[1] && c[2] === c[3]) continue
    for (let k = 1; k < SAMPLES; k++) grow(bezierAt(c, k / SAMPLES))
  }
  return { minX, minY, maxX, maxY }
}

export const mapNode = (n: PenNode, f: (p: Pt) => Pt): PenNode => ({ ...f(n), ...(n.inH ? { inH: f(n.inH) } : {}), ...(n.outH ? { outH: f(n.outH) } : {}) })

/**
 * Ce qu'il faut pour poser le tracé : la boîte qui entoure la courbe (au moins 1 px de chaque côté) et le chemin dans un viewBox
 * 100 × 100 étiré à cette boîte. Les poignées peuvent sortir du viewBox.
 */
export function fitNodes(nodes: readonly PenNode[], closed: boolean): Drawn {
  const b = curveBounds(nodes, closed)
  const width = Math.max(1, b.maxX - b.minX)
  const height = Math.max(1, b.maxY - b.minY)
  const x = (b.minX + b.maxX) / 2 - width / 2
  const y = (b.minY + b.maxY) / 2 - height / 2
  const norm = nodes.map((n) => mapNode(n, (p) => ({ x: ((p.x - x) / width) * 100, y: ((p.y - y) / height) * 100 })))
  return { x, y, width, height, path: pathFromNodes(norm, closed, 3) }
}

type Framed = Pick<TrameElement, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'path'>

/** Les mêmes points, tous les repères multipliés par `k` (passage des pixels de la page à ceux de l'écran). */
export const scaleNodes = (nodes: readonly PenNode[], k: number): PenNode[] => nodes.map((n) => mapNode(n, (p) => ({ x: p.x * k, y: p.y * k })))

/** Les points d'un élément en pixels, dans son propre repère (origine à son coin haut gauche, avant rotation). `null` si son chemin n'est pas modifiable. */
export function elementNodes(el: Pick<TrameElement, 'width' | 'height' | 'path'>): PenPath | null {
  const parsed = nodesFromPath(el.path)
  if (!parsed) return null
  const sx = el.width / 100
  const sy = el.height / 100
  return { closed: parsed.closed, nodes: parsed.nodes.map((n) => mapNode(n, (p) => ({ x: p.x * sx, y: p.y * sy }))) }
}

/** Le chemin d'un élément pour ces points (en pixels de son repère), **sans changer sa boîte** : pour suivre un glissement en cours. */
export function pathInFrame(el: Pick<TrameElement, 'width' | 'height'>, nodes: readonly PenNode[], closed: boolean): string {
  const sx = 100 / Math.max(el.width, 1e-6)
  const sy = 100 / Math.max(el.height, 1e-6)
  return pathFromNodes(
    nodes.map((n) => mapNode(n, (p) => ({ x: p.x * sx, y: p.y * sy }))),
    closed,
    3
  )
}

/**
 * Ajuste la boîte de l'élément à sa courbe après une modification (points en pixels de son repère actuel) : rend la nouvelle boîte, sa
 * position (qui tient compte de la rotation de l'élément autour de son coin) et son chemin. Le dessin ne bouge pas à l'écran.
 */
export function refit(el: Framed, nodes: readonly PenNode[], closed: boolean): Pick<TrameElement, 'x' | 'y' | 'width' | 'height' | 'path'> {
  const f = fitNodes(nodes, closed)
  const r = ((el.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: el.x + f.x * cos - f.y * sin, y: el.y + f.x * sin + f.y * cos, width: f.width, height: f.height, path: f.path }
}

/** Déplace le point `i` en `p` avec ses deux poignées. */
export function moveNode(nodes: readonly PenNode[], i: number, p: Pt): PenNode[] {
  const dx = p.x - nodes[i].x
  const dy = p.y - nodes[i].y
  return nodes.map((n, k) => (k === i ? mapNode(n, (q) => ({ x: q.x + dx, y: q.y + dy })) : n))
}

/** Un point est lisse quand ses deux poignées existent et prolongent la même droite, de part et d'autre. */
export function isSmooth(n: PenNode): boolean {
  if (!n.inH || !n.outH) return false
  const ax = n.inH.x - n.x
  const ay = n.inH.y - n.y
  const bx = n.outH.x - n.x
  const by = n.outH.y - n.y
  const la = Math.hypot(ax, ay)
  const lb = Math.hypot(bx, by)
  if (la < 1e-6 || lb < 1e-6) return false
  return Math.abs(ax * by - ay * bx) / (la * lb) < 0.02 && ax * bx + ay * by < 0
}

/**
 * Déplace une poignée du point `i`. Avec `keepSmooth`, l'autre poignée reste alignée de l'autre côté (à sa propre distance) : le point
 * reste lisse ; sans, elle ne bouge pas (point d'angle).
 */
export function moveHandle(nodes: readonly PenNode[], i: number, which: 'in' | 'out', p: Pt, keepSmooth: boolean): PenNode[] {
  const n = nodes[i]
  const next: PenNode = { ...n, [which === 'in' ? 'inH' : 'outH']: { x: p.x, y: p.y } }
  const other = which === 'in' ? n.outH : n.inH
  if (keepSmooth && other) {
    const len = dist(p, n)
    if (len > 1e-6) {
      const keep = dist(other, n)
      const q = { x: n.x - ((p.x - n.x) / len) * keep, y: n.y - ((p.y - n.y) / len) * keep }
      if (which === 'in') next.outH = q
      else next.inH = q
    }
  }
  return nodes.map((m, k) => (k === i ? next : m))
}

/** Pose une courbe lisse sur un point d'angle, ou ramène un point lisse à un angle (sans poignées). */
export function toggleSmooth(nodes: readonly PenNode[], closed: boolean, i: number): PenNode[] {
  const n = nodes[i]
  if (n.inH || n.outH) {
    const { inH: _i, outH: _o, ...bare } = n
    void _i
    void _o
    return nodes.map((m, k) => (k === i ? bare : m))
  }
  const count = nodes.length
  const prev = i > 0 ? nodes[i - 1] : closed ? nodes[count - 1] : undefined
  const next = i < count - 1 ? nodes[i + 1] : closed ? nodes[0] : undefined
  const from = prev ?? n
  const to = next ?? n
  let dx = to.x - from.x
  let dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [...nodes]
  dx /= len
  dy /= len
  const lenOut = next ? dist(n, next) / 3 : 0
  const lenIn = prev ? dist(n, prev) / 3 : 0
  const smooth: PenNode = { ...n }
  if (next) smooth.outH = { x: n.x + dx * lenOut, y: n.y + dy * lenOut }
  if (prev) smooth.inH = { x: n.x - dx * lenIn, y: n.y - dy * lenIn }
  return nodes.map((m, k) => (k === i ? smooth : m))
}

/** Coupe le segment `seg` à la position `t` (0–1) : un nouveau point, sur la courbe, qui en garde exactement la forme. */
export function insertNode(nodes: readonly PenNode[], seg: number, t: number): PenNode[] {
  const [p0, p1, p2, p3] = segmentCurve(nodes, seg)
  const straight = !nodes[seg].outH && !nodes[(seg + 1) % nodes.length].inH
  const a = lerp(p0, p1, t)
  const b = lerp(p1, p2, t)
  const c = lerp(p2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const m = lerp(d, e, t)
  const added: PenNode = straight ? { x: m.x, y: m.y } : { x: m.x, y: m.y, inH: d, outH: e }
  const out = nodes.map((n) => ({ ...n }))
  const after = (seg + 1) % nodes.length
  if (!straight) {
    out[seg].outH = a
    out[after].inH = c
  }
  out.splice(seg + 1, 0, added)
  return out
}

/** Retire le point `i` (le tracé garde au moins deux points) ; rend `null` si c'est impossible. */
export function removeNode(nodes: readonly PenNode[], i: number): PenNode[] | null {
  if (nodes.length <= 2 || i < 0 || i >= nodes.length) return null
  return nodes.filter((_, k) => k !== i)
}

/** Le point de la courbe le plus proche de `p` : son segment, sa position `t` dans ce segment et sa distance. */
export function nearestOnPath(nodes: readonly PenNode[], closed: boolean, p: Pt): { seg: number; t: number; dist: number } | null {
  let best: { seg: number; t: number; dist: number } | null = null
  for (let i = 0; i < segmentCount(nodes, closed); i++) {
    const c = segmentCurve(nodes, i)
    const steps = 40
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const d = dist(p, bezierAt(c, t))
      if (!best || d < best.dist) best = { seg: i, t, dist: d }
    }
  }
  if (!best) return null
  // affine autour du meilleur échantillon
  const c = segmentCurve(nodes, best.seg)
  let lo = Math.max(0, best.t - 1 / 40)
  let hi = Math.min(1, best.t + 1 / 40)
  for (let k = 0; k < 12; k++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (dist(p, bezierAt(c, m1)) < dist(p, bezierAt(c, m2))) hi = m2
    else lo = m1
  }
  const t = (lo + hi) / 2
  return { seg: best.seg, t, dist: dist(p, bezierAt(c, t)) }
}

/** Pose un point à la position `p` (clic) : un point d'angle ; ou, si `p` retombe sur le premier point d'un tracé d'au moins trois points, ferme le tracé. */
export function pressNode(nodes: readonly PenNode[], p: Pt, closeRadius: number): { nodes: PenNode[]; closes: boolean } {
  if (nodes.length >= 3 && dist(p, nodes[0]) <= closeRadius) return { nodes: [...nodes], closes: true }
  return { nodes: [...nodes, { x: p.x, y: p.y }], closes: false }
}

/** Glisser en posant le dernier point en tire les poignées : celle de départ suit le pointeur, celle d'arrivée lui est opposée (point lisse). */
export function dragLastNode(nodes: readonly PenNode[], p: Pt, minDistance: number): PenNode[] {
  if (!nodes.length) return []
  const n = nodes[nodes.length - 1]
  if (dist(p, n) < minDistance) {
    const { inH: _i, outH: _o, ...bare } = n
    void _i
    void _o
    return [...nodes.slice(0, -1), bare]
  }
  return [...nodes.slice(0, -1), { ...n, outH: { x: p.x, y: p.y }, inH: { x: 2 * n.x - p.x, y: 2 * n.y - p.y } }]
}

/** Retire les points qui doublent le précédent (un double-clic pose deux fois le même point). */
export function dedupeNodes(nodes: readonly PenNode[], eps = 0.5): PenNode[] {
  const out: PenNode[] = []
  for (const n of nodes) {
    const last = out[out.length - 1]
    if (last && dist(last, n) < eps) {
      // le point gardé prend la poignée de départ du doublon (le glisser du dernier clic)
      if (n.outH) last.outH = n.outH
      continue
    }
    out.push({ ...n })
  }
  return out
}
