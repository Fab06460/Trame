import { boundsOf, type Box } from '@/geometry'
import type { TrameElement } from '@/types'

/**
 * Pile (auto-layout) : les membres d'un groupe sont rangés l'un après l'autre, dans un sens (vertical ou horizontal), avec un espacement
 * et un alignement. Quand un texte s'allonge, les suivants se décalent tout seuls. Le **premier membre est l'ancre** : il ne bouge pas, les
 * autres se placent par rapport à lui. Un membre peut être le **fond** de la pile (`stackBg`) : il épouse le contenu, avec une marge.
 */
export type StackAlign = 'start' | 'center' | 'end' | 'stretch'
export interface StackSpec {
  dir: 'v' | 'h'
  /** espace entre deux éléments consécutifs, en pixels de design */
  gap: number
  /** alignement sur l'axe transversal (`stretch` : les éléments prennent la largeur — ou la hauteur — de l'ancre) */
  align: StackAlign
  /** marge entre le contenu et le fond de la pile (sans fond : sans effet) */
  pad: number
}

export const STACK_LIMITS = { gap: { min: 0, max: 500 }, pad: { min: 0, max: 500 } }
export const STACK_ALIGNS: readonly StackAlign[] = ['start', 'center', 'end', 'stretch']
export const DEFAULT_STACK: StackSpec = { dir: 'v', gap: 16, align: 'start', pad: 0 }

/** Taille d'un élément telle qu'elle sera dessinée (un texte a la hauteur de son contenu, que seul le moteur de texte connaît). */
export type Measure = (e: TrameElement) => { width: number; height: number }

export interface LayoutPatch {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const EPS = 0.01

/** Les réglages de la pile d'un groupe : ceux du premier membre qui en porte (tous les membres portent les mêmes). */
export const stackSpecOf = (members: readonly TrameElement[]): StackSpec | null => members.find((e) => e.stack)?.stack ?? null

/** Contenu de la pile, dans l'ordre : par `stackAt`, puis par ordre dans la page (un membre ajouté après coup vient à la fin). Le fond, les masques et les éléments masqués n'en font pas partie. */
export function stackContent(members: readonly TrameElement[]): TrameElement[] {
  return members
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.hidden && !e.stackBg && !e.clip)
    .sort((a, b) => (a.e.stackAt ?? 1e9) - (b.e.stackAt ?? 1e9) || a.i - b.i)
    .map(({ e }) => e)
}

/**
 * Place les membres d'une pile. Rend, pour chaque élément qui doit changer, sa nouvelle position (et sa taille si elle change : largeur en
 * mode `stretch`, hauteur mesurée d'un texte). Un résultat vide veut dire que tout est déjà bien placé (le calcul est stable).
 */
export function layoutStack(members: readonly TrameElement[], spec: StackSpec, measure: Measure): Map<string, LayoutPatch> {
  const patches = new Map<string, LayoutPatch>()
  const content = stackContent(members)
  if (!content.length) return patches
  const vertical = spec.dir === 'v'
  const gap = clamp(spec.gap, STACK_LIMITS.gap.min, STACK_LIMITS.gap.max)
  const pad = clamp(spec.pad, STACK_LIMITS.pad.min, STACK_LIMITS.pad.max)

  const sized = (e: TrameElement, override: Partial<TrameElement> = {}): { e: TrameElement; box: Box; width: number; height: number } => {
    const m = measure({ ...e, ...override })
    return { e, width: m.width, height: m.height, box: boundsOf({ ...e, ...override, width: m.width, height: m.height }) }
  }
  const anchor = sized(content[0])
  // axe de la pile (le long) et axe transversal, par rapport à l'ancre
  const along = (b: Box): { pos: number; size: number } => (vertical ? { pos: b.y, size: b.height } : { pos: b.x, size: b.width })
  const across = (b: Box): { pos: number; size: number } => (vertical ? { pos: b.x, size: b.width } : { pos: b.y, size: b.height })
  const ref = across(anchor.box)
  let cursor = along(anchor.box).pos
  const placed: Box[] = []

  content.forEach((e, i) => {
    let item = i === 0 ? anchor : sized(e)
    let stretchTo: number | undefined
    // « étirer » : la largeur (pile verticale) ou la hauteur (pile horizontale) de l'ancre ; un élément pivoté ne s'étire pas
    if (spec.align === 'stretch' && i > 0 && !e.rotation) {
      if (vertical) {
        item = sized(e, { width: ref.size })
        stretchTo = ref.size
      } else if (e.type !== 'text') {
        item = sized(e, { height: ref.size })
        stretchTo = ref.size
      }
    }
    const a = along(item.box)
    const c = across(item.box)
    const crossPos = spec.align === 'center' ? ref.pos + ref.size / 2 - c.size / 2 : spec.align === 'end' ? ref.pos + ref.size - c.size : ref.pos
    const targetX = vertical ? crossPos : cursor
    const targetY = vertical ? cursor : crossPos
    const patch: LayoutPatch = {}
    const nx = r3(e.x + (targetX - item.box.x))
    const ny = r3(e.y + (targetY - item.box.y))
    if (Math.abs(nx - e.x) > EPS) patch.x = nx
    if (Math.abs(ny - e.y) > EPS) patch.y = ny
    if (stretchTo !== undefined) {
      if (vertical && Math.abs(stretchTo - e.width) > EPS) patch.width = r3(stretchTo)
      if (!vertical && Math.abs(stretchTo - e.height) > EPS) patch.height = r3(stretchTo)
    }
    // un texte garde dans le fichier la hauteur de son contenu (les exports et les calculs de boîte s'y fient)
    if (e.type === 'text' && Math.abs(item.height - e.height) > 0.5) patch.height = r3(item.height)
    if (Object.keys(patch).length) patches.set(e.id, patch)
    placed.push({ x: targetX, y: targetY, width: item.box.width, height: item.box.height })
    cursor += a.size + gap
  })

  // fond : l'enveloppe du contenu, agrandie de la marge
  const bgs = members.filter((e) => e.stackBg && !e.hidden)
  if (bgs.length) {
    const minX = Math.min(...placed.map((b) => b.x))
    const minY = Math.min(...placed.map((b) => b.y))
    const maxX = Math.max(...placed.map((b) => b.x + b.width))
    const maxY = Math.max(...placed.map((b) => b.y + b.height))
    const frame = { x: r3(minX - pad), y: r3(minY - pad), width: r3(maxX - minX + 2 * pad), height: r3(maxY - minY + 2 * pad) }
    for (const bg of bgs) {
      const patch: LayoutPatch = {}
      for (const k of ['x', 'y', 'width', 'height'] as const) if (Math.abs(frame[k] - bg[k]) > EPS) patch[k] = frame[k]
      if (bg.rotation) patch.rotation = 0
      if (Object.keys(patch).length) patches.set(bg.id, patch)
    }
  }
  return patches
}

/** Les décalages à appliquer à une page : les piles de chacun de ses groupes. */
export function reflowPage(elements: readonly TrameElement[], measure: Measure): Map<string, LayoutPatch> {
  const out = new Map<string, LayoutPatch>()
  if (!elements.some((e) => e.stack)) return out
  const groups = new Map<string, TrameElement[]>()
  for (const e of elements) if (e.groupId) groups.set(e.groupId, [...(groups.get(e.groupId) ?? []), e])
  for (const members of groups.values()) {
    const spec = stackSpecOf(members)
    if (!spec) continue
    for (const [id, p] of layoutStack(members, spec, measure)) out.set(id, p)
  }
  return out
}

/** Applique des décalages à une liste d'éléments (sans toucher à ceux qui n'ont rien à changer). */
export function applyPatches(elements: readonly TrameElement[], patches: ReadonlyMap<string, LayoutPatch>): TrameElement[] {
  return elements.map((e) => {
    const p = patches.get(e.id)
    return p ? { ...e, ...p } : e
  })
}

export interface StackPlan {
  spec: StackSpec
  /** l'ordre des éléments de contenu (leur `stackAt` suit cet ordre) */
  order: string[]
  /** l'élément qui sert de fond, s'il y en a un */
  backgroundId?: string
}

const contains = (outer: Box, inner: Box, tolerance = 1): boolean => outer.x - tolerance <= inner.x && outer.y - tolerance <= inner.y && outer.x + outer.width + tolerance >= inner.x + inner.width && outer.y + outer.height + tolerance >= inner.y + inner.height

const median = (values: number[]): number => {
  const v = [...values].sort((a, b) => a - b)
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0
}

/**
 * Prépare une pile à partir d'une sélection, pour que l'apparence ne change presque pas : le fond est la plus grande forme qui contient
 * tous les autres éléments ; l'ordre suit les positions ; l'espacement est l'écart médian actuel ; l'alignement est celui qu'ont déjà les
 * éléments (bords gauches égaux, centres égaux ou bords droits égaux), sinon `start`.
 */
export function planStack(elements: readonly TrameElement[], dir: 'v' | 'h', measure: Measure, canBeBackground: (e: TrameElement) => boolean): StackPlan | null {
  const items = elements.filter((e) => !e.hidden).map((e) => {
    const m = measure(e)
    return { e, box: boundsOf({ ...e, width: m.width, height: m.height }) }
  })
  if (items.length < 2) return null
  let bg: (typeof items)[number] | undefined
  for (const cand of [...items].sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)) {
    if (canBeBackground(cand.e) && items.every((o) => o === cand || contains(cand.box, o.box))) {
      bg = cand
      break
    }
  }
  const content = items.filter((i) => i !== bg).sort((a, b) => (dir === 'v' ? a.box.y - b.box.y || a.box.x - b.box.x : a.box.x - b.box.x || a.box.y - b.box.y))
  if (!content.length) return null
  const gaps = content.slice(1).map((it, i) => (dir === 'v' ? it.box.y - (content[i].box.y + content[i].box.height) : it.box.x - (content[i].box.x + content[i].box.width)))
  const gap = clamp(Math.round(gaps.length ? median(gaps) : 16), STACK_LIMITS.gap.min, STACK_LIMITS.gap.max)
  const edges = (pick: (b: Box) => number): boolean => content.every((it) => Math.abs(pick(it.box) - pick(content[0].box)) <= 2)
  const near = dir === 'v' ? (b: Box) => b.x : (b: Box) => b.y
  const mid = dir === 'v' ? (b: Box) => b.x + b.width / 2 : (b: Box) => b.y + b.height / 2
  const far = dir === 'v' ? (b: Box) => b.x + b.width : (b: Box) => b.y + b.height
  const align: StackAlign = content.length < 2 || edges(near) ? 'start' : edges(mid) ? 'center' : edges(far) ? 'end' : 'start'
  let pad = 0
  if (bg) {
    const u = content.reduce((acc, it) => ({ x0: Math.min(acc.x0, it.box.x), y0: Math.min(acc.y0, it.box.y), x1: Math.max(acc.x1, it.box.x + it.box.width), y1: Math.max(acc.y1, it.box.y + it.box.height) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
    pad = clamp(Math.round(Math.min(u.x0 - bg.box.x, u.y0 - bg.box.y, bg.box.x + bg.box.width - u.x1, bg.box.y + bg.box.height - u.y1)), STACK_LIMITS.pad.min, STACK_LIMITS.pad.max)
  }
  return { spec: { dir, gap, align, pad }, order: content.map((i) => i.e.id), ...(bg ? { backgroundId: bg.e.id } : {}) }
}

/** Nettoyage à la lecture : réglages de pile valides, ou rien. Modifie l'élément en place. */
export function sanitizeStack(element: object): void {
  const e = element as Record<string, unknown>
  const s = e.stack as Record<string, unknown> | undefined
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (typeof e.groupId !== 'string' || !s || typeof s !== 'object' || (s.dir !== 'v' && s.dir !== 'h') || !ok(s.gap) || !ok(s.pad) || !(STACK_ALIGNS as readonly unknown[]).includes(s.align)) {
    delete e.stack
    delete e.stackAt
    delete e.stackBg
    return
  }
  e.stack = { dir: s.dir, gap: clamp(s.gap, STACK_LIMITS.gap.min, STACK_LIMITS.gap.max), align: s.align, pad: clamp(s.pad, STACK_LIMITS.pad.min, STACK_LIMITS.pad.max) }
  if (!ok(e.stackAt) || e.stackAt < 0) delete e.stackAt
  else e.stackAt = Math.round(e.stackAt)
  if (e.stackBg !== true) delete e.stackBg
}
