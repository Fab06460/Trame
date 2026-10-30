import type { TrameDocument, TrameElement } from '@/types'

export interface MissingAlt {
  pageId: string
  /** rang de la page, à partir de 0 */
  pageIndex: number
  elementId: string
}

/** Une image visible a besoin d'une description sauf si elle en a une ou si elle est déclarée décorative. */
export const needsAlt = (e: Pick<TrameElement, 'type' | 'src' | 'alt' | 'decorative' | 'hidden'>): boolean =>
  e.type === 'image' && !!e.src && !e.hidden && !e.decorative && !e.alt?.trim()

/** Images sans description, dans l'ordre du document. */
export function imagesMissingAlt(doc: Pick<TrameDocument, 'pages'>): MissingAlt[] {
  const out: MissingAlt[] = []
  doc.pages.forEach((p, pageIndex) => {
    for (const e of p.elements) if (needsAlt(e)) out.push({ pageId: p.id, pageIndex, elementId: e.id })
  })
  return out
}

/** Nombre d'images sans description par page (clé : identifiant de page ; les pages complètes sont absentes). */
export function missingAltByPage(doc: Pick<TrameDocument, 'pages'>): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of imagesMissingAlt(doc)) out.set(m.pageId, (out.get(m.pageId) ?? 0) + 1)
  return out
}

/** Lecture d'un fichier : `decorative` n'a de sens que sur une image et vaut `true` ; sinon il est retiré (et une description l'emporte). */
export function sanitizeDecorative(e: { type: string; decorative?: unknown; alt?: unknown }): void {
  if (e.type !== 'image' || e.decorative !== true || (typeof e.alt === 'string' && e.alt.trim())) delete e.decorative
}
