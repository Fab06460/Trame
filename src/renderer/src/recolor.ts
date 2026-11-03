import { backdropOf, contrastRatio, parseHex, requiredContrast, toHex, type Rgb } from '@/accessibility'
import { chromaOf, labOf, labToRgb, rgbToLab, type Lab } from '@/palette'
import { allowedPatch } from '@/protection'
import { hasStroke } from '@/strokeStyle'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

/** Une couleur du design et le poids de son usage (aire des éléments qui la portent). */
export interface SourceColor {
  color: string
  weight: number
}

/** En dessous de ce chroma (L*a*b*), une couleur est un blanc, un noir ou un gris : on peut la laisser telle quelle. */
export const NEUTRAL_CHROMA = 12

/** `#rrggbb` en minuscules, ou null (« transparent », nom de couleur, valeur illisible). */
export const normalizeHex = (c: string | undefined): string | null => {
  const rgb = c ? parseHex(c) : null
  return rgb ? toHex(rgb) : null
}

/** Groupes d'un graphique ou d'un QR code : leurs formes sont régénérées depuis une description, on n'y touche pas. */
function generatedGroups(page: Pick<TramePage, 'elements'>): Set<string> {
  const ids = new Set<string>()
  for (const e of page.elements) if ((e.chart || e.qr) && e.groupId) ids.add(e.groupId)
  return ids
}

/** Un élément dont on peut changer les couleurs : pas une image, pas une pièce d'un graphique ou d'un QR code. */
const recolorable = (e: TrameElement, generated: Set<string>): boolean => e.type !== 'image' && !(e.groupId && generated.has(e.groupId))

/** Couleurs que porte un élément, avec le poids de chacune. */
function colorsOf(e: TrameElement): Array<[string, number]> {
  const area = Math.max(1, e.width * e.height)
  const out: Array<[string, number]> = []
  if (e.gradient) out.push([e.gradient.from, area / 2], [e.gradient.to, area / 2])
  else out.push([e.fill, e.type === 'text' ? area / 2 : area])
  if (hasStroke(e)) out.push([e.stroke as string, area / 10])
  if (e.shadow) out.push([e.shadow.color, area / 20])
  return out
}

/** Toutes les couleurs (`#rrggbb`) du design dans ces pages — fonds de page compris —, de la plus employée à la moins employée. */
export function collectColors(doc: Pick<TrameDocument, 'pages' | 'width' | 'height'>, pageIds: ReadonlySet<string>): SourceColor[] {
  const weights = new Map<string, number>()
  const add = (c: string | undefined, w: number): void => {
    const hex = normalizeHex(c)
    if (hex) weights.set(hex, (weights.get(hex) ?? 0) + w)
  }
  for (const page of doc.pages) {
    if (!pageIds.has(page.id)) continue
    add(page.background, doc.width * doc.height)
    const generated = generatedGroups(page)
    for (const e of page.elements) if (recolorable(e, generated)) for (const [c, w] of colorsOf(e)) add(c, w)
  }
  return [...weights].map(([color, weight]) => ({ color, weight })).sort((a, b) => b.weight - a.weight)
}

/**
 * Quelle couleur de la palette remplace chaque couleur du design. On range les couleurs du design et celles de la palette de la plus
 * claire à la plus sombre et on les fait correspondre dans l'ordre : le clair reste clair, le sombre reste sombre, donc les contrastes
 * (texte sur fond) tiennent à peu près. Une seule couleur du design reçoit la couleur dominante de la palette.
 * Avec `keepNeutrals`, le blanc, le noir et les gris du design ne changent pas.
 */
export function buildMapping(sources: SourceColor[], palette: string[], keepNeutrals: boolean): Map<string, string> {
  const map = new Map<string, string>()
  const target = palette.map((c) => ({ color: c, lab: labOf(c) })).filter((p): p is { color: string; lab: Lab } => !!p.lab)
  if (target.length === 0) return map
  const from = sources
    .map((s) => ({ color: s.color, lab: labOf(s.color) }))
    .filter((s): s is { color: string; lab: Lab } => !!s.lab && (!keepNeutrals || chromaOf(s.lab) >= NEUTRAL_CHROMA))
  if (from.length === 0) return map
  if (from.length === 1) {
    map.set(from[0].color, target[0].color)
    return map
  }
  const byLight = [...target].sort((a, b) => a.lab[0] - b.lab[0])
  from.sort((a, b) => a.lab[0] - b.lab[0])
  from.forEach((s, i) => map.set(s.color, byLight[Math.round((i * (byLight.length - 1)) / (from.length - 1))].color))
  return map
}

/** Même couleur, éclaircie ou assombrie (teinte conservée) jusqu'à tenir le contraste demandé sur tous les fonds ; null si impossible. */
function withContrast(fill: Rgb, backs: Rgb[], required: number): string | null {
  const ok = (c: Rgb): boolean => backs.every((b) => contrastRatio(c, b) >= required)
  const lab = rgbToLab(fill)
  let best: { c: Rgb; shift: number } | null = null
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= 25; step++) {
      const c = labToRgb([Math.min(100, Math.max(0, lab[0] + dir * step * 4)), lab[1], lab[2]])
      if (ok(c)) {
        if (!best || step < best.shift) best = { c, shift: step }
        break
      }
    }
  }
  if (best) return toHex(best.c)
  const bw = ([[0, 0, 0], [255, 255, 255]] as Rgb[]).find(ok)
  return bw ? toHex(bw) : null
}

/** Le texte lisible avant le changement doit le rester : sinon sa couleur est ajustée (plus claire ou plus sombre, même teinte). */
function keepTextReadable(before: TramePage, after: TramePage): TramePage {
  const elements = after.elements.map((e, i) => {
    const old = before.elements[i]
    if (e.type !== 'text' || e.fill === old.fill || !e.text?.trim()) return e
    const was = parseHex(old.fill)
    const now = parseHex(e.fill)
    const oldBack = backdropOf(before, old)
    const newBack = backdropOf(after, e)
    if (!was || !now || !('colors' in oldBack) || !('colors' in newBack)) return e
    const required = requiredContrast(e)
    const ratio = (c: Rgb, backs: Rgb[]): number => Math.min(...backs.map((b) => contrastRatio(c, b)))
    if (ratio(was, oldBack.colors) < required || ratio(now, newBack.colors) >= required) return e
    const fixed = withContrast(now, newBack.colors, required)
    return fixed ? { ...e, fill: fixed } : e
  })
  return { ...after, elements }
}

export interface RecolorOptions {
  /** pages à recolorer */
  pageIds: ReadonlySet<string>
  /** modèle de marque appliqué : un élément figé ne change pas */
  enforced: boolean
  /** recolorer aussi le fond des pages */
  background: boolean
}

/** Applique la correspondance de couleurs : fonds, remplissages, contours, dégradés, ombres et couleurs de texte. Renvoie le même document s'il n'y a rien à changer. */
export function recolorDoc(doc: TrameDocument, mapping: ReadonlyMap<string, string>, opts: RecolorOptions): { doc: TrameDocument; changed: number } {
  const swap = (c: string | undefined): string | undefined => {
    const hex = normalizeHex(c)
    return hex ? mapping.get(hex) : undefined
  }
  let changed = 0
  const pages = doc.pages.map((page) => {
    if (!opts.pageIds.has(page.id)) return page
    const generated = generatedGroups(page)
    let touched = false
    const background = opts.background ? swap(page.background) : undefined
    if (background) touched = true
    const elements = page.elements.map((e) => {
      if (!recolorable(e, generated)) return e
      const patch: Partial<TrameElement> = {}
      const fill = swap(e.fill)
      if (fill) patch.fill = fill
      const stroke = swap(e.stroke)
      if (stroke) patch.stroke = stroke
      const from = swap(e.gradient?.from)
      const to = swap(e.gradient?.to)
      if (e.gradient && (from || to)) patch.gradient = { ...e.gradient, from: from ?? e.gradient.from, to: to ?? e.gradient.to }
      const shadow = swap(e.shadow?.color)
      if (e.shadow && shadow) patch.shadow = { ...e.shadow, color: shadow }
      if (Object.keys(patch).length === 0) return e
      const allowed = allowedPatch(e, patch, opts.enforced)
      if (!allowed) return e
      changed++
      touched = true
      return { ...e, ...allowed } as TrameElement
    })
    if (!touched) return page
    return keepTextReadable(page, { ...page, background: background ?? page.background, elements })
  })
  return changed === 0 && pages.every((p, i) => p === doc.pages[i]) ? { doc, changed: 0 } : { doc: { ...doc, pages }, changed }
}
