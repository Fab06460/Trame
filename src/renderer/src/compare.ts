import type { TrameDocument, TrameElement, TramePage } from '@/types'

/**
 * Comparaison de deux versions d'un même document (une copie corrigée, une version de l'historique…). Les pages et les éléments sont
 * rapprochés par leur identifiant : deux copies d'un même fichier les partagent. Les commentaires de relecture sont traités à part
 * (`mergeComments`).
 */
export type ChangeKind = 'page-added' | 'page-removed' | 'page-background' | 'page-notes' | 'element-added' | 'element-removed' | 'element-changed'

/** Ce qui a changé dans un élément, en grandes familles (pour l'afficher sans jargon). */
export type ElementAspect = 'text' | 'position' | 'size' | 'rotation' | 'color' | 'image' | 'style' | 'visibility' | 'other'

export interface Change {
  /** identifiant stable dans cette comparaison (sert à cocher) */
  id: string
  kind: ChangeKind
  pageId: string
  elementId?: string
  /** pour un élément modifié : les familles de changements */
  aspects?: ElementAspect[]
  /** nature de l'élément concerné (ajouté, retiré ou modifié) */
  elementType?: TrameElement['type']
  /** début du texte de l'élément, pour le reconnaître */
  excerpt?: string
}

export interface DocDiff {
  changes: Change[]
  /** pages communes aux deux documents : 0 = les fichiers ne dérivent probablement pas l'un de l'autre */
  commonPages: number
  /** le format de page diffère (les positions ne sont pas comparables) */
  sizeDiffers: boolean
}

const ASPECT_OF: Record<string, ElementAspect> = {
  text: 'text',
  x: 'position',
  y: 'position',
  width: 'size',
  height: 'size',
  rotation: 'rotation',
  fill: 'color',
  gradient: 'color',
  stroke: 'color',
  src: 'image',
  crop: 'image',
  filters: 'image',
  flipX: 'image',
  flipY: 'image',
  hidden: 'visibility',
  opacity: 'visibility'
}

/** Représentation stable pour comparer (l'ordre des clés ne compte pas). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

const EPS = 0.01
const same = (a: unknown, b: unknown): boolean => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < EPS : stable(a) === stable(b))

/** Familles de différences entre deux versions d'un élément (vide = identiques). */
export function elementAspects(a: TrameElement, b: TrameElement): ElementAspect[] {
  const found = new Set<ElementAspect>()
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === 'id') continue
    if (same((a as unknown as Record<string, unknown>)[k], (b as unknown as Record<string, unknown>)[k])) continue
    found.add(ASPECT_OF[k] ?? (['fontFamily', 'fontSize', 'fontStyle', 'align', 'shadow', 'strokeWidth', 'cornerRadius'].includes(k) ? 'style' : 'other'))
  }
  return [...found]
}

const excerptOf = (e: TrameElement): string | undefined => {
  const s = (e.text ?? '').replace(/\s+/g, ' ').trim()
  return s ? (s.length > 40 ? `${s.slice(0, 39)}…` : s) : undefined
}

export function diffDocuments(mine: TrameDocument, other: TrameDocument): DocDiff {
  const changes: Change[] = []
  const theirPages = new Map(other.pages.map((p) => [p.id, p]))
  const myPages = new Map(mine.pages.map((p) => [p.id, p]))
  let common = 0
  for (const page of mine.pages) {
    const t = theirPages.get(page.id)
    if (!t) {
      changes.push({ id: `pr:${page.id}`, kind: 'page-removed', pageId: page.id })
      continue
    }
    common++
    if (page.background !== t.background) changes.push({ id: `pb:${page.id}`, kind: 'page-background', pageId: page.id })
    if ((page.notes ?? '') !== (t.notes ?? '')) changes.push({ id: `pn:${page.id}`, kind: 'page-notes', pageId: page.id })
    const mineEls = new Map(page.elements.map((e) => [e.id, e]))
    const theirEls = new Map(t.elements.map((e) => [e.id, e]))
    for (const e of t.elements) {
      const m = mineEls.get(e.id)
      if (!m) changes.push({ id: `ea:${e.id}`, kind: 'element-added', pageId: page.id, elementId: e.id, elementType: e.type, excerpt: excerptOf(e) })
      else {
        const aspects = elementAspects(m, e)
        if (aspects.length) changes.push({ id: `ec:${e.id}`, kind: 'element-changed', pageId: page.id, elementId: e.id, aspects, elementType: e.type, excerpt: excerptOf(e) ?? excerptOf(m) })
      }
    }
    for (const e of page.elements) if (!theirEls.has(e.id)) changes.push({ id: `er:${e.id}`, kind: 'element-removed', pageId: page.id, elementId: e.id, elementType: e.type, excerpt: excerptOf(e) })
  }
  for (const page of other.pages) if (!myPages.has(page.id)) changes.push({ id: `pa:${page.id}`, kind: 'page-added', pageId: page.id })
  return { changes, commonPages: common, sizeDiffers: mine.width !== other.width || mine.height !== other.height }
}

/** Index d'insertion dans `list` (des ids de `mine`) pour un élément dont le voisin précédent, chez l'autre, est `prevId`. */
function insertAfter<T extends { id: string }>(list: T[], item: T, ref: T[], keepIds: Set<string>): T[] {
  const at = ref.findIndex((x) => x.id === item.id)
  for (let i = at - 1; i >= 0; i--) {
    if (!keepIds.has(ref[i].id)) continue
    const pos = list.findIndex((x) => x.id === ref[i].id)
    if (pos >= 0) return [...list.slice(0, pos + 1), item, ...list.slice(pos + 1)]
  }
  return [item, ...list]
}

/**
 * Reprend dans `mine` les changements cochés de `other`. Les autres parties de `mine` sont intactes. Un changement qui ne peut plus
 * s'appliquer (page absente, élément déjà retiré) est ignoré. On ne retire jamais la dernière page. Les polices incorporées de l'autre
 * document qui manquent ici sont reprises.
 */
export function applyChanges(mine: TrameDocument, other: TrameDocument, selected: ReadonlySet<string>, diff: DocDiff = diffDocuments(mine, other)): TrameDocument {
  const picked = diff.changes.filter((c) => selected.has(c.id))
  if (!picked.length) return mine
  let pages = mine.pages
  const theirPage = (id: string): TramePage | undefined => other.pages.find((p) => p.id === id)
  const mapPage = (id: string, f: (p: TramePage) => TramePage): void => {
    pages = pages.map((p) => (p.id === id ? f(p) : p))
  }
  // 1. pages ajoutées puis retirées
  for (const c of picked.filter((x) => x.kind === 'page-added')) {
    const t = theirPage(c.pageId)
    if (!t || pages.some((p) => p.id === t.id)) continue
    const known = new Set(pages.map((p) => p.id))
    pages = insertAfter(pages, t, other.pages, known)
  }
  for (const c of picked.filter((x) => x.kind === 'page-removed')) {
    if (pages.length > 1) pages = pages.filter((p) => p.id !== c.pageId)
  }
  // 2. propriétés de page, puis éléments
  for (const c of picked) {
    const t = theirPage(c.pageId)
    if (!t || !pages.some((p) => p.id === c.pageId)) continue
    if (c.kind === 'page-background') mapPage(c.pageId, (p) => ({ ...p, background: t.background }))
    else if (c.kind === 'page-notes')
      mapPage(c.pageId, (p) => {
        const { notes: _old, ...rest } = p
        void _old
        return t.notes ? { ...rest, notes: t.notes } : rest
      })
    else if (c.kind === 'element-removed') mapPage(c.pageId, (p) => ({ ...p, elements: p.elements.filter((e) => e.id !== c.elementId) }))
    else if (c.kind === 'element-changed') {
      const theirs = t.elements.find((e) => e.id === c.elementId)
      if (theirs) mapPage(c.pageId, (p) => ({ ...p, elements: p.elements.map((e) => (e.id === c.elementId ? theirs : e)) }))
    } else if (c.kind === 'element-added') {
      const theirs = t.elements.find((e) => e.id === c.elementId)
      if (!theirs) continue
      mapPage(c.pageId, (p) => {
        if (p.elements.some((e) => e.id === theirs.id)) return p
        return { ...p, elements: insertAfter(p.elements, theirs, t.elements, new Set(p.elements.map((e) => e.id))) }
      })
    }
  }
  // 3. polices incorporées manquantes
  let fonts = mine.fonts
  if (other.fonts) {
    const missing = Object.entries(other.fonts).filter(([k]) => !mine.fonts || !(k in mine.fonts))
    if (missing.length) fonts = { ...(mine.fonts ?? {}), ...Object.fromEntries(missing) }
  }
  return { ...mine, pages, ...(fonts ? { fonts } : {}) }
}
