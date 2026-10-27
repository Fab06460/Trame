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

/** Un bloc dont un bord est à moins de cette part de la page du bord de la page lui reste collé (fonds, bandeaux, décors qui débordent). */
const EDGE = 0.04

/**
 * Position d'un bloc sur un axe. Le bloc garde ses rapports avec les autres : la composition est mise à l'échelle UNIFORME `s` et centrée
 * (`offset`), sauf si le bloc touche un bord de la page, auquel cas il reste collé à ce bord (à sa distance mise à l'échelle) ; un bloc
 * qui occupe presque tout l'axe (fond, bandeau) occupe tout l'axe du nouveau format.
 */
type AxisKind = 'stretch' | 'start' | 'end' | 'free'

function placeOnAxis(start: number, size: number, total: number, newTotal: number, s: number, offset: number, canStretch: boolean): { pos: number; size: number; kind: AxisKind } {
  const before = start
  const after = total - (start + size)
  if (canStretch && size >= total * SPANS) return { pos: 0, size: newTotal, kind: 'stretch' }
  if (before <= EDGE * total && before <= after) return { pos: before * s, size: size * s, kind: 'start' }
  if (after <= EDGE * total) return { pos: newTotal - after * s - size * s, size: size * s, kind: 'end' }
  return { pos: offset + start * s, size: size * s, kind: 'free' }
}

/**
 * Adapte une page à un autre format (Magic Resize) :
 * - **la composition reste d'un seul tenant** : toutes les tailles (boîte, police, interlettrage, contour, arrondi, ombre, flou) sont
 *   multipliées par l'échelle UNIFORME `s = min(sx, sy)`, et l'ensemble est centré dans le nouveau format — un texte posé sur une carte
 *   reste sur sa carte, rien n'est déformé ni recouvert par autre chose qu'avant ;
 * - **les éléments collés à un bord de la page** (décors qui débordent, bandeaux, barres) restent collés au même bord ;
 * - un élément non pivoté qui occupe presque toute une dimension (fond, bandeau) occupe toute la dimension du nouveau format ;
 * - un élément entièrement contenu dans un décor collé à un bord (une étoile sur un grand cercle) suit ce décor ;
 * - un groupe se déplace d'un bloc (ses membres gardent leurs écarts, à l'échelle `s`) ;
 * - les repères suivent la composition.
 */
export function adaptPage(page: TramePage, from: { width: number; height: number }, to: { width: number; height: number }): TramePage {
  const sx = to.width / from.width
  const sy = to.height / from.height
  const s = Math.min(sx, sy)
  const ox = (to.width - from.width * s) / 2
  const oy = (to.height - from.height * s) / 2

  const blocks = new Map<string, TrameElement[]>()
  for (const e of page.elements) {
    const key = e.groupId ?? e.id
    blocks.set(key, [...(blocks.get(key) ?? []), e])
  }

  // 1. placement de chaque bloc
  interface Placed { members: TrameElement[]; box: ReturnType<typeof unionBox>; single: boolean; px: ReturnType<typeof placeOnAxis>; py: ReturnType<typeof placeOnAxis> }
  const placed: Placed[] = [...blocks.values()].map((members) => {
    const box = unionBox(members.map(boundsOf))
    const single = members.length === 1 && members[0].rotation === 0
    return { members, box, single, px: placeOnAxis(box.x, box.width, from.width, to.width, s, ox, single), py: placeOnAxis(box.y, box.height, from.height, to.height, s, oy, single) }
  })
  const centreOf = (b: Placed['box']): { x: number; y: number } => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  const contains = (a: Placed['box'], b: Placed['box']): boolean => b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.width <= a.x + a.width + 1 && b.y + b.height <= a.y + a.height + 1
  const pinned = (p: Placed['px']): boolean => p.kind === 'start' || p.kind === 'end'

  // 2. un bloc entièrement contenu dans un décor collé à un bord (une étoile sur un grand cercle) le suit, axe par axe : sinon il s'en détacherait
  const owner = new Map<Placed, Placed>()
  for (const b of placed) {
    if (pinned(b.px) || pinned(b.py)) continue
    const hosts = placed.filter((h) => h !== b && (pinned(h.px) || pinned(h.py)) && contains(h.box, b.box) && h.box.width * h.box.height > b.box.width * b.box.height)
    if (hosts.length) owner.set(b, hosts.sort((x, y) => x.box.width * x.box.height - y.box.width * y.box.height)[0])
  }

  const moved = new Map<string, TrameElement>()
  for (const b of placed) {
    const host = owner.get(b)
    const c = centreOf(b.box)
    const free = { x: b.px.pos + b.px.size / 2, y: b.py.pos + b.py.size / 2 }
    // centre du bloc dans le nouveau format ; collé à son hôte sur les axes où l'hôte est collé à un bord
    const target = { ...free }
    if (host) {
      const hc = centreOf(host.box)
      const hostTarget = { x: host.px.pos + host.px.size / 2, y: host.py.pos + host.py.size / 2 }
      if (pinned(host.px)) target.x = hostTarget.x + (c.x - hc.x) * s
      if (pinned(host.py)) target.y = hostTarget.y + (c.y - hc.y) * s
    }
    for (const e of b.members) {
      const n = scaleStyle(e, s)
      // un bloc étiré (fond, bandeau) prend la taille de l'axe ; sinon tout est à l'échelle s
      n.width = b.single && b.px.kind === 'stretch' ? b.px.size : e.width * s
      n.height = b.single && b.py.kind === 'stretch' ? b.py.size : e.height * s
      const ec = centerOf(e)
      const nc = b.single ? target : { x: target.x + (ec.x - c.x) * s, y: target.y + (ec.y - c.y) * s }
      const r = (e.rotation * Math.PI) / 180
      // le centre voulu → le coin haut-gauche (la rotation se fait autour de ce coin)
      n.x = nc.x - (n.width / 2) * Math.cos(r) + (n.height / 2) * Math.sin(r)
      n.y = nc.y - (n.width / 2) * Math.sin(r) - (n.height / 2) * Math.cos(r)
      moved.set(e.id, n)
    }
  }

  return {
    ...page,
    guides: page.guides?.map((g) => ({ ...g, position: g.orientation === 'v' ? ox + g.position * s : oy + g.position * s })),
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
