/** Recherche et remplacement dans les textes d'un document : logique pure (casse, mot entier, accents). */
import type { TrameDocument } from '@/types'

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  ignoreAccents: boolean
}

export interface Match {
  /** position dans le texte d'origine (indices UTF-16) : `[start, end[` */
  start: number
  end: number
}

export interface Hit extends Match {
  pageId: string
  pageIndex: number
  elementId: string
  /** extrait du texte autour de l'occurrence, pour la liste des résultats */
  before: string
  found: string
  after: string
}

/**
 * Texte « plié » pour comparer (minuscules, sans accents selon les options) avec, pour chaque caractère plié, la position du caractère
 * d'origine dont il vient : une occurrence trouvée dans le texte plié se reporte exactement dans l'original, même si le pliage change
 * la longueur (« é » = e + accent, « İ » en minuscule…).
 */
function fold(text: string, o: SearchOptions): { folded: string; from: number[]; to: number[] } {
  let folded = ''
  const from: number[] = []
  const to: number[] = []
  let i = 0
  for (const ch of text) {
    let f = ch
    if (!o.caseSensitive) f = f.toLocaleLowerCase('fr')
    if (o.ignoreAccents) f = f.normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (let k = 0; k < f.length; k++) {
      from.push(i)
      to.push(i + ch.length)
    }
    folded += f
    i += ch.length
  }
  return { folded, from, to }
}

const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}_]/u.test(c)

/** Occurrences (sans chevauchement, de gauche à droite) de `query` dans `text`. Une requête vide n'en a aucune. */
export function findMatches(text: string, query: string, o: SearchOptions): Match[] {
  if (!query) return []
  const q = fold(query, o).folded
  if (!q) return []
  const { folded, from, to } = fold(text, o)
  const out: Match[] = []
  for (let at = folded.indexOf(q); at >= 0; at = folded.indexOf(q, at + q.length)) {
    const start = from[at]
    let end = to[at + q.length - 1]
    // un accent combinant appartient à sa lettre : on l'inclut quand les accents sont ignorés, sinon l'occurrence n'est pas une vraie occurrence
    const trailing = /^[\u0300-\u036f]+/.exec(text.slice(end))?.[0].length ?? 0
    if (trailing) {
      if (!o.ignoreAccents) continue
      end += trailing
    }
    if (o.wholeWord) {
      // mot entier : ni lettre, ni chiffre, ni « _ » juste avant ou juste après (dans le texte d'origine)
      const prev = start > 0 ? [...text.slice(0, start)].pop() : undefined
      const next = text.slice(end)[0] ? [...text.slice(end)][0] : undefined
      if (isWordChar(prev) || isWordChar(next)) continue
    }
    out.push({ start, end })
  }
  return out
}

/** `text` où les occurrences données sont remplacées par `replacement` (les positions doivent venir de `findMatches` sur ce même texte). */
export function applyReplacements(text: string, matches: Match[], replacement: string): string {
  let out = ''
  let at = 0
  for (const m of matches) {
    out += text.slice(at, m.start) + replacement
    at = m.end
  }
  return out + text.slice(at)
}

const SNIPPET = 28

/** Toutes les occurrences d'un document, dans l'ordre de lecture (pages, puis éléments dans l'ordre de superposition). Les calques masqués sont ignorés. */
export function findInDocument(doc: Pick<TrameDocument, 'pages'>, query: string, o: SearchOptions, onlyPageId?: string): Hit[] {
  const hits: Hit[] = []
  doc.pages.forEach((page, pageIndex) => {
    if (onlyPageId && page.id !== onlyPageId) return
    for (const e of page.elements) {
      if (e.type !== 'text' || e.hidden || !e.text) continue
      for (const m of findMatches(e.text, query, o)) {
        hits.push({
          ...m,
          pageId: page.id,
          pageIndex,
          elementId: e.id,
          before: (m.start > SNIPPET ? '…' : '') + e.text.slice(Math.max(0, m.start - SNIPPET), m.start).replace(/\s+/g, ' '),
          found: e.text.slice(m.start, m.end).replace(/\s+/g, ' '),
          after: e.text.slice(m.end, m.end + SNIPPET).replace(/\s+/g, ' ') + (e.text.length > m.end + SNIPPET ? '…' : '')
        })
      }
    }
  })
  return hits
}

/** Textes modifiés par un remplacement de `hits` : un nouveau texte par élément touché. */
export function replacementsFor(doc: Pick<TrameDocument, 'pages'>, hits: Hit[], replacement: string): Array<{ elementId: string; text: string }> {
  const byElement = new Map<string, Hit[]>()
  for (const h of hits) byElement.set(h.elementId, [...(byElement.get(h.elementId) ?? []), h])
  const texts = new Map(doc.pages.flatMap((p) => p.elements.map((e) => [e.id, e.text ?? ''] as const)))
  return [...byElement].map(([elementId, list]) => ({ elementId, text: applyReplacements(texts.get(elementId) ?? '', [...list].sort((a, b) => a.start - b.start), replacement) }))
}
