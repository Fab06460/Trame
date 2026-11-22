import { nanoid } from 'nanoid'
import { pathFromNodes, type PenNode } from '@/pen'
import type { TrameElement } from '@/types'

/** Opérations entre formes, comme dans un éditeur vectoriel : unir, soustraire (le dessous moins le dessus), intersecter, exclure (ce qui n'est pas commun). */
export type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude'
export const BOOLEAN_OPS: readonly BooleanOp[] = ['unite', 'subtract', 'intersect', 'exclude']

/** Éléments combinables : rectangle, ellipse et tracé fermé (un trait, une ligne, un texte ou une image n'ont pas de surface à combiner). */
export const combinable = (e: TrameElement): boolean => (e.type === 'rect' || e.type === 'ellipse' || (e.type === 'path' && !e.open && !!e.path)) && e.width > 0 && e.height > 0 && !e.formula && !e.qr && !e.chart

/** Au moins deux éléments, tous combinables. */
export const canCombine = (els: readonly TrameElement[]): boolean => els.length >= 2 && els.every(combinable)

const n = (v: number): string => String(Math.round(v * 1000) / 1000)

/** Le contour d'un rectangle (coins arrondis compris) dans le repère de sa boîte, en données de chemin SVG. */
export function rectData(width: number, height: number, radius = 0): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  if (!r) return `M0 0H${n(width)}V${n(height)}H0Z`
  return `M${n(r)} 0H${n(width - r)}A${n(r)} ${n(r)} 0 0 1 ${n(width)} ${n(r)}V${n(height - r)}A${n(r)} ${n(r)} 0 0 1 ${n(width - r)} ${n(height)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(height - r)}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`
}

/** Le contour d'une ellipse qui remplit sa boîte, en données de chemin SVG. */
export function ellipseData(width: number, height: number): string {
  const rx = width / 2
  const ry = height / 2
  return `M0 ${n(ry)}A${n(rx)} ${n(ry)} 0 1 1 ${n(width)} ${n(ry)}A${n(rx)} ${n(ry)} 0 1 1 0 ${n(ry)}Z`
}

/** Le tracé d'un élément, dans le repère de sa boîte (un tracé Trame est dessiné dans 100 × 100 puis étiré). */
export function localOutline(el: TrameElement): { data: string; scaleX: number; scaleY: number } {
  if (el.type === 'ellipse') return { data: ellipseData(el.width, el.height), scaleX: 1, scaleY: 1 }
  if (el.type === 'rect') return { data: rectData(el.width, el.height, el.cornerRadius ?? 0), scaleX: 1, scaleY: 1 }
  return { data: el.path ?? '', scaleX: el.width / 100, scaleY: el.height / 100 }
}

export interface Combined {
  /** chemin SVG dans un repère 100 × 100 */
  path: string
  x: number
  y: number
  width: number
  height: number
}

type Paper = typeof import('paper')
let scope: paper.PaperScope | null = null

async function paperScope(): Promise<paper.PaperScope> {
  if (scope) return scope
  const mod = (await import('paper/dist/paper-core.js')) as unknown as { default?: Paper } & Paper
  const lib = (mod.default ?? mod) as unknown as typeof paper
  const s = new lib.PaperScope()
  s.setup(new lib.Size(10, 10))
  scope = s
  return s
}

/**
 * Le chemin d'un résultat en `M`, `L`, `C` et `Z` absolus (un sous-chemin par contour) : la forme que sait relire la plume, donc modifiable
 * point par point (le `pathData` de paper écrit des commandes relatives, `h`, `v`, `c`…).
 */
function outlineData(item: paper.PathItem): string {
  // (`paper` n'est chargé qu'à la demande : on reconnaît le type par son nom)
  const paths = (item.className === 'CompoundPath' ? (item as paper.CompoundPath).children : [item]) as paper.Path[]
  return paths
    .map((p) => {
      const nodes: PenNode[] = p.segments.map((seg) => ({
        x: seg.point.x,
        y: seg.point.y,
        ...(seg.handleIn.length > 1e-6 ? { inH: { x: seg.point.x + seg.handleIn.x, y: seg.point.y + seg.handleIn.y } } : {}),
        ...(seg.handleOut.length > 1e-6 ? { outH: { x: seg.point.x + seg.handleOut.x, y: seg.point.y + seg.handleOut.y } } : {})
      }))
      return nodes.length > 1 ? pathFromNodes(nodes, p.closed, 3) : ''
    })
    .filter(Boolean)
    .join(' ')
}

/**
 * Combine des formes (dans l'ordre de la pile, du dessous au dessus) : chacune est posée à sa place sur la page (position, taille, rotation),
 * puis l'opération est appliquée en cascade (« soustraire » : la première forme moins toutes les suivantes). Le résultat est un seul tracé,
 * normalisé dans un repère 100 × 100 avec sa boîte ; `null` s'il ne reste rien (formes qui ne se recouvrent pas, par exemple).
 */
export async function combineShapes(els: readonly TrameElement[], op: BooleanOp): Promise<Combined | null> {
  if (!canCombine(els)) return null
  const s = await paperScope()
  const items = els.map((el) => {
    const { data, scaleX, scaleY } = localOutline(el)
    const item = new s.CompoundPath({ pathData: data, fillRule: el.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', insert: false })
    item.scale(scaleX, scaleY, new s.Point(0, 0))
    if (el.rotation) item.rotate(el.rotation, new s.Point(0, 0))
    item.translate(new s.Point(el.x, el.y))
    return item
  })
  let result: paper.PathItem = items[0]
  for (const next of items.slice(1)) result = result[op](next, { insert: false })
  const b = result.bounds
  if (!result.pathData || !(b.width > 0.01) || !(b.height > 0.01)) return null
  const normal = result.clone({ insert: false }) as paper.PathItem
  normal.translate(new s.Point(-b.x, -b.y))
  normal.scale(100 / b.width, 100 / b.height, new s.Point(0, 0))
  const path = outlineData(normal)
  if (!path) return null
  const r3 = (v: number): number => Math.round(v * 1000) / 1000
  return { path, x: r3(b.x), y: r3(b.y), width: r3(b.width), height: r3(b.height) }
}

/** L'élément qui remplace les formes combinées : un tracé qui garde le style de la forme du dessous (remplissage, dégradé, contour, ombre, opacité). Pair-impair : les trous restent des trous. */
export function combinedElement(els: readonly TrameElement[], c: Combined): TrameElement {
  const { fill, gradient, stroke, strokeWidth, strokeDashed, shadow, opacity } = els[0]
  return {
    id: nanoid(8),
    type: 'path',
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    rotation: 0,
    opacity,
    fill,
    ...(gradient ? { gradient } : {}),
    ...(stroke ? { stroke } : {}),
    ...(strokeWidth ? { strokeWidth } : {}),
    ...(strokeDashed ? { strokeDashed } : {}),
    ...(shadow ? { shadow } : {}),
    path: c.path,
    fillRule: 'evenodd'
  }
}
