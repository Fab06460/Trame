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
