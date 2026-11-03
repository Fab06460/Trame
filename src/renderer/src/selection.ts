import type { TrameElement } from '@/types'

/** Point de la page (pixels de design) dans la forme de l'élément : rectangle tourné autour du coin haut-gauche, ou ellipse inscrite. */
export function pointHits(e: TrameElement, p: { x: number; y: number }): boolean {
  const r = (e.rotation * Math.PI) / 180
  const dx = p.x - e.x
  const dy = p.y - e.y
  const lx = dx * Math.cos(r) + dy * Math.sin(r)
  const ly = -dx * Math.sin(r) + dy * Math.cos(r)
  if (lx < 0 || ly < 0 || lx > e.width || ly > e.height) return false
  if (e.type !== 'ellipse') return true
  const a = e.width / 2
  const b = e.height / 2
  return a > 0 && b > 0 && ((lx - a) / a) ** 2 + ((ly - b) / b) ** 2 <= 1
}

/** Éléments visibles sous un point, du plus haut au plus bas (un élément masqué n'est pas sélectionnable sur le canvas). */
export function hitStack(els: TrameElement[], p: { x: number; y: number }): TrameElement[] {
  return els.filter((e) => !e.hidden && pointHits(e, p)).reverse()
}

const unitKey = (e: TrameElement): string => e.groupId ?? e.id

/**
 * Cliquer à travers : l'élément (ou groupe) qui suit, en descendant, celui qui est sélectionné parmi ceux superposés sous le pointeur ;
 * après le dernier on revient au premier. Sans sélection dans la pile, le premier (celui qu'un clic simple prend). Retourne l'id d'un
 * membre de l'unité choisie (le magasin étend aux membres du groupe), ou null si rien n'est sous le pointeur.
 */
export function throughTarget(stack: TrameElement[], selectedIds: string[]): string | null {
  const units: TrameElement[] = []
  const seen = new Set<string>()
  for (const e of stack) {
    if (seen.has(unitKey(e))) continue
    seen.add(unitKey(e))
    units.push(e)
  }
  if (!units.length) return null
  const selected = new Set(selectedIds)
  const current = units.findIndex((u) => stack.some((e) => unitKey(e) === unitKey(u) && selected.has(e.id)))
  return units[current < 0 ? 0 : (current + 1) % units.length].id
}

/**
 * Tab / Maj + Tab : la sélection suivante (`dir` = 1) ou précédente (−1), dans l'ordre des calques, masqués exclus. Un groupe se
 * sélectionne en entier, sauf quand on est « dans » un groupe (un seul de ses membres sélectionné) : on passe alors de membre en
 * membre. Sans sélection : le premier (ou le dernier). Retourne null quand on sort de la liste : le focus reprend alors son cours normal.
 */
export function tabTarget(els: TrameElement[], selectedIds: string[], dir: 1 | -1): string[] | null {
  const list = els.filter((e) => !e.hidden)
  if (!list.length) return null
  const selected = new Set(selectedIds)
  const indexes = list.flatMap((e, i) => (selected.has(e.id) ? [i] : []))
  const unit = (e: TrameElement, inside: string | undefined): string[] =>
    e.groupId && e.groupId !== inside ? list.filter((x) => x.groupId === e.groupId).map((x) => x.id) : [e.id]
  if (!indexes.length) return unit(list[dir > 0 ? 0 : list.length - 1], undefined)
  const inside = indexes.length === 1 ? list[indexes[0]].groupId : undefined
  for (let i = (dir > 0 ? Math.max(...indexes) : Math.min(...indexes)) + dir; i >= 0 && i < list.length; i += dir) {
    if (!selected.has(list[i].id)) return unit(list[i], inside)
  }
  return null
}

/** Tous les éléments visibles du même type que `ref` ; rien pour un graphique ou un QR code (leurs éléments forment un tout). */
export function sameTypeIds(els: TrameElement[], ref: TrameElement): string[] {
  const whole = (e: TrameElement): boolean => !!e.chart || !!e.qr || (!!e.groupId && els.some((o) => o.groupId === e.groupId && (!!o.chart || !!o.qr)))
  if (whole(ref)) return []
  return els.filter((e) => !e.hidden && e.type === ref.type && !whole(e)).map((e) => e.id)
}
