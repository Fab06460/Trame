import type { TrameElement } from '@/types'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Boîte englobante alignée aux axes, rotation comprise (Konva tourne autour du coin haut-gauche). */
export function boundsOf(e: TrameElement): Box {
  const r = (e.rotation * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const xs = [0, e.width, e.width, 0].map((px, i) => e.x + px * cos - [0, 0, e.height, e.height][i] * sin)
  const ys = [0, e.width, e.width, 0].map((px, i) => e.y + px * sin + [0, 0, e.height, e.height][i] * cos)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y
  }
}

export const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** Retourne le décalage (dx, dy) à appliquer à chaque élément pour l'aligner sur `target`. */
export function alignDeltas(els: TrameElement[], mode: AlignMode, target: Box): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>()
  for (const e of els) {
    const b = boundsOf(e)
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = target.x - b.x
    if (mode === 'hcenter') dx = target.x + target.width / 2 - (b.x + b.width / 2)
    if (mode === 'right') dx = target.x + target.width - (b.x + b.width)
    if (mode === 'top') dy = target.y - b.y
    if (mode === 'vcenter') dy = target.y + target.height / 2 - (b.y + b.height / 2)
    if (mode === 'bottom') dy = target.y + target.height - (b.y + b.height)
    out.set(e.id, { dx, dy })
  }
  return out
}

/** Répartit les éléments pour obtenir des écarts égaux entre leurs boîtes (≥ 3 éléments). */
export function distributeDeltas(els: TrameElement[], axis: 'h' | 'v'): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>()
  const items = els.map((e) => ({ e, b: boundsOf(e) }))
  const pos = (b: Box): number => (axis === 'h' ? b.x : b.y)
  const len = (b: Box): number => (axis === 'h' ? b.width : b.height)
  items.sort((a, b) => pos(a.b) - pos(b.b))
  const first = items[0].b
  const last = items[items.length - 1].b
  const total = pos(last) + len(last) - pos(first)
  const gap = (total - items.reduce((s, i) => s + len(i.b), 0)) / (items.length - 1)
  let cursor = pos(first)
  for (const it of items) {
    const d = cursor - pos(it.b)
    out.set(it.e.id, axis === 'h' ? { dx: d, dy: 0 } : { dx: 0, dy: d })
    cursor += len(it.b) + gap
  }
  return out
}

// ── Aimantation (guides magnétiques) ────────────────────────────────────────────────────────────────────

export interface SnapLine {
  /** `x` : ligne verticale à x = position ; `y` : ligne horizontale à y = position */
  axis: 'x' | 'y'
  position: number
  /** étendue de la ligne sur l'autre axe (pixels de design) */
  from: number
  to: number
}

export interface SnapOptions {
  /** taille de la page */
  width: number
  height: number
  /** repères de l'utilisateur */
  guides?: Array<{ orientation: 'h' | 'v'; position: number }>
  /** distance maximale d'accroche, en pixels de design (donc seuil écran ÷ échelle) */
  threshold: number
}

interface Line {
  value: number
  from: number
  to: number
}

/** Lignes verticales (x) et horizontales (y) auxquelles on peut s'accrocher : bords et centres des cibles, de la page, repères. */
function snapLines(targets: Box[], o: SnapOptions): { xs: Line[]; ys: Line[] } {
  const xs: Line[] = []
  const ys: Line[] = []
  for (const t of targets) {
    for (const v of [t.x, t.x + t.width / 2, t.x + t.width]) xs.push({ value: v, from: t.y, to: t.y + t.height })
    for (const v of [t.y, t.y + t.height / 2, t.y + t.height]) ys.push({ value: v, from: t.x, to: t.x + t.width })
  }
  for (const v of [0, o.width / 2, o.width]) xs.push({ value: v, from: 0, to: o.height })
  for (const v of [0, o.height / 2, o.height]) ys.push({ value: v, from: 0, to: o.width })
  for (const g of o.guides ?? []) {
    if (g.orientation === 'v') xs.push({ value: g.position, from: 0, to: o.height })
    else ys.push({ value: g.position, from: 0, to: o.width })
  }
  return { xs, ys }
}

/** Plus petite correction (signée) qui amène une des valeurs `mine` sur une ligne de `lines`, dans le seuil ; null sinon. */
function bestDelta(mine: number[], lines: Line[], threshold: number): number | null {
  let best: number | null = null
  for (const m of mine) {
    for (const l of lines) {
      const d = l.value - m
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
  }
  return best
}

/** Lignes à afficher une fois la correction appliquée : toutes celles sur lesquelles on est effectivement accroché, étendues jusqu'à la cible. */
function matched(mine: number[], lines: Line[], span: [number, number], axis: 'x' | 'y'): SnapLine[] {
  const byPos = new Map<number, SnapLine>()
  for (const l of lines) {
    if (!mine.some((m) => Math.abs(m - l.value) < 0.01)) continue
    const key = Math.round(l.value * 100) / 100
    const cur = byPos.get(key)
    const from = Math.min(span[0], l.from)
    const to = Math.max(span[1], l.to)
    byPos.set(key, cur ? { ...cur, from: Math.min(cur.from, from), to: Math.max(cur.to, to) } : { axis, position: l.value, from, to })
  }
  return [...byPos.values()]
}

/**
 * Aimantation d'une boîte qu'on déplace : ses bords et son centre s'accrochent aux bords et centres des autres éléments,
 * de la page, et aux repères. Retourne la correction à ajouter au déplacement et les lignes à dessiner.
 * Les deux axes sont indépendants : on peut s'accrocher en x sans s'accrocher en y.
 */
export function snapBox(box: Box, targets: Box[], o: SnapOptions): { dx: number; dy: number; lines: SnapLine[] } {
  const { xs, ys } = snapLines(targets, o)
  const mx = (b: Box): number[] => [b.x, b.x + b.width / 2, b.x + b.width]
  const my = (b: Box): number[] => [b.y, b.y + b.height / 2, b.y + b.height]
  const dx = bestDelta(mx(box), xs, o.threshold) ?? 0
  const dy = bestDelta(my(box), ys, o.threshold) ?? 0
  const moved = { ...box, x: box.x + dx, y: box.y + dy }
  return {
    dx,
    dy,
    lines: [...matched(mx(moved), xs, [moved.y, moved.y + moved.height], 'x'), ...matched(my(moved), ys, [moved.x, moved.x + moved.width], 'y')]
  }
}

export interface ChangedEdges {
  left?: boolean
  right?: boolean
  top?: boolean
  bottom?: boolean
}

/**
 * Aimantation d'un redimensionnement : seuls les bords **déplacés** s'accrochent (les autres restent où ils sont).
 * La taille minimale est de 1 px.
 */
export function snapEdges(box: Box, changed: ChangedEdges, targets: Box[], o: SnapOptions): { box: Box; lines: SnapLine[] } {
  const { xs, ys } = snapLines(targets, o)
  let { x, y, width, height } = box
  const right = x + width
  const bottom = y + height
  const near = (v: number, lines: Line[]): number | null => bestDelta([v], lines, o.threshold)
  if (changed.left) {
    const d = near(x, xs)
    if (d !== null && right - (x + d) >= 1) {
      x += d
      width -= d
    }
  }
  if (changed.right) {
    const d = near(right, xs)
    if (d !== null && width + d >= 1) width += d
  }
  if (changed.top) {
    const d = near(y, ys)
    if (d !== null && bottom - (y + d) >= 1) {
      y += d
      height -= d
    }
  }
  if (changed.bottom) {
    const d = near(bottom, ys)
    if (d !== null && height + d >= 1) height += d
  }
  const out = { x, y, width, height }
  const lines = [
    ...matched([...(changed.left ? [out.x] : []), ...(changed.right ? [out.x + out.width] : [])], xs, [out.y, out.y + out.height], 'x'),
    ...matched([...(changed.top ? [out.y] : []), ...(changed.bottom ? [out.y + out.height] : [])], ys, [out.x, out.x + out.width], 'y')
  ]
  return { box: out, lines }
}
