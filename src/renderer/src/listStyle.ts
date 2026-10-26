import type { ListKind, TrameElement } from '@/types'

export const LIST_KINDS: ListKind[] = ['bullet', 'number']

export const BULLET = '•'

/** Retrait des puces : largeur de la colonne des marqueurs, proportionnelle à la taille de police (le texte vient ensuite). */
export const listIndent = (fontSize: number | undefined): number => Math.round((fontSize ?? 32) * 1.4)

/** Marqueur de chaque paragraphe : « • », « 1. », « 2. »… ; un paragraphe vide n'a ni marqueur ni numéro. */
export function markersFor(kind: ListKind, paragraphs: string[]): string[] {
  let n = 0
  return paragraphs.map((p) => {
    if (!p.trim()) return ''
    n += 1
    return kind === 'bullet' ? BULLET : `${n}.`
  })
}

/** Caractères que les marqueurs ajoutent au texte (pour vérifier que la police les possède avant de les écrire dans le PDF). */
export const markerChars = (el: Pick<TrameElement, 'list'>): string => (el.list === 'bullet' ? BULLET : el.list === 'number' ? '0123456789.' : '')

/** Nettoyage à la lecture : seules les valeurs connues sont gardées, et seulement sur un texte. Modifie en place. */
export function sanitizeList(element: object): void {
  const e = element as Record<string, unknown>
  if (e.type !== 'text' || !LIST_KINDS.includes(e.list as ListKind)) delete e.list
}
