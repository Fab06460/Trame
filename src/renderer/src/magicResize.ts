import { boundsOf, unionBox } from '@/geometry'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

export const SIZE_LIMITS = { min: 16, max: 8000 }

/** Un élément qui occupe (presque) toute une dimension de la page : fond, bandeau… Il suit alors la page au lieu de rester à l'échelle. */
const SPANS = 0.97

const scaled = (v: number | undefined, s: number): number | undefined => (v === undefined ? v : v * s)

/** Même élément, ses tailles « en pixels » (police, contour, ombre, arrondi, interlettrage) multipliées par `s`. Position et boîte : voir `adaptPage`. */
function scaleStyle(e: TrameElement, s: number): TrameElement {
  const out: TrameElement = { ...e }
  if (e.fontSize !== undefined) out.fontSize = e.fontSize * s
  if (e.letterSpacing !== undefined) out.letterSpacing = e.letterSpacing * s
  if (e.strokeWidth !== undefined) out.strokeWidth = e.strokeWidth * s
  if (e.cornerRadius !== undefined) out.cornerRadius = scaled(e.cornerRadius, s)
  if (e.shadow) out.shadow = { ...e.shadow, blur: e.shadow.blur * s, offsetX: e.shadow.offsetX * s, offsetY: e.shadow.offsetY * s }
  if (e.filters?.blur) out.filters = { ...e.filters, blur: e.filters.blur * s }
  return out
}

const centerOf = (e: TrameElement): { x: number; y: number } => {
  const r = (e.rotation * Math.PI) / 180
  return {
    x: e.x + (e.width / 2) * Math.cos(r) - (e.height / 2) * Math.sin(r),
    y: e.y + (e.width / 2) * Math.sin(r) + (e.height / 2) * Math.cos(r)
  }
}

/**
 * Adapte une page à un autre format (Magic Resize) :
 * - toutes les tailles sont multipliées par l'échelle UNIFORME `s = min(sx, sy)` : rien n'est déformé ;
 * - les positions suivent la page (centres multipliés par `sx` / `sy`), pour que la mise en page occupe le nouveau format ;
 * - un groupe se déplace d'un bloc (ses membres gardent leurs écarts, à l'échelle `s`) ;
 * - un élément qui couvre toute une dimension (fond, bandeau) couvre aussi la même dimension du nouveau format ;
 * - rien ne sort de la page tant que le bloc y tient.
 */
export function adaptPage(page: TramePage, from: { width: number; height: number }, to: { width: number; height: number }): TramePage {
  const sx = to.width / from.width
  const sy = to.height / from.height
  const s = Math.min(sx, sy)

  const blocks = new Map<string, TrameElement[]>()
  for (const e of page.elements) {
    const key = e.groupId ?? e.id
    blocks.set(key, [...(blocks.get(key) ?? []), e])
  }

  const moved = new Map<string, TrameElement>()
  for (const members of blocks.values()) {
    const box = unionBox(members.map(boundsOf))
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const target = { x: c.x * sx, y: c.y * sy }
    const placed = members.map((e) => {
      const spansW = e.rotation === 0 && e.width >= from.width * SPANS
      const spansH = e.rotation === 0 && e.height >= from.height * SPANS
      const n = scaleStyle(e, s)
      n.width = spansW ? to.width : e.width * s
      n.height = spansH ? to.height : e.height * s
      const ec = centerOf(e)
      const nc = { x: target.x + (ec.x - c.x) * s, y: target.y + (ec.y - c.y) * s }
      const r = (e.rotation * Math.PI) / 180
      // le centre voulu → le coin haut-gauche (la rotation se fait autour de ce coin)
      n.x = spansW ? 0 : nc.x - (n.width / 2) * Math.cos(r) + (n.height / 2) * Math.sin(r)
      n.y = spansH ? 0 : nc.y - (n.width / 2) * Math.sin(r) - (n.height / 2) * Math.cos(r)
      return n
    })
    // le bloc entier est ramené dans la page (jamais élément par élément : un groupe ne doit pas se déformer)
    const nb = unionBox(placed.map(boundsOf))
    const fix = (lo: number, size: number, max: number): number => (size > max ? 0 : lo < 0 ? -lo : lo + size > max ? max - (lo + size) : 0)
    const ddx = nb.width > to.width ? 0 : fix(nb.x, nb.width, to.width)
    const ddy = nb.height > to.height ? 0 : fix(nb.y, nb.height, to.height)
    for (const n of placed) {
      n.x += ddx
      n.y += ddy
      moved.set(n.id, n)
    }
  }

  return {
    ...page,
    guides: page.guides?.map((g) => ({ ...g, position: g.position * (g.orientation === 'v' ? sx : sy) })),
    elements: page.elements.map((e) => moved.get(e.id) ?? e)
  }
}

/** Magic Resize du document entier (toutes les pages partagent le format du document). Les dimensions sont ramenées aux bornes. */
export function adaptDocument(doc: TrameDocument, width: number, height: number): TrameDocument {
  const w = Math.round(Math.min(SIZE_LIMITS.max, Math.max(SIZE_LIMITS.min, width)))
  const h = Math.round(Math.min(SIZE_LIMITS.max, Math.max(SIZE_LIMITS.min, height)))
  const from = { width: doc.width, height: doc.height }
  return { ...doc, width: w, height: h, pages: doc.pages.map((p) => adaptPage(p, from, { width: w, height: h })) }
}
