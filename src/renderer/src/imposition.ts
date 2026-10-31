import { nanoid } from 'nanoid'
import { sheetSize, sheetsFromMerged, type SheetLayout } from '@/mergeSheets'
import type { TrameDocument, TramePage } from '@/types'

/**
 * Impression pratique : un livret (feuilles recto-verso pliées en deux et agrafées) ou plusieurs pages par feuille. Les deux fabriquent un
 * document de « feuilles » (pages à la taille du papier, les pages d'origine réduites dessus) que l'export PDF ordinaire écrit : les textes
 * restent du vrai texte. Le placement réutilise celui des planches du publipostage (`sheetsFromMerged`).
 */

/**
 * Ordre des pages d'un livret : pour chaque feuille, d'abord son recto (dernière page à gauche, première à droite), puis son verso
 * (deuxième à gauche, avant-dernière à droite) ; le total est complété par des pages blanches (`null`) jusqu'à un multiple de 4.
 * Exemple pour 8 pages (indices à partir de 0) : 7,0 | 1,6 | 5,2 | 3,4.
 */
export function bookletOrder(pageCount: number): Array<number | null> {
  const total = Math.max(4, Math.ceil(pageCount / 4) * 4)
  const at = (i: number): number | null => (i < pageCount ? i : null)
  const out: Array<number | null> = []
  for (let k = 0; k < total / 4; k++) out.push(at(total - 1 - 2 * k), at(2 * k), at(2 * k + 1), at(total - 2 - 2 * k))
  return out
}

/** Pages blanches ajoutées pour compléter le dernier cahier. */
export const bookletBlanks = (pageCount: number): number => Math.max(4, Math.ceil(pageCount / 4) * 4) - pageCount

const blankPage = (): TramePage => ({ id: nanoid(8), background: '#ffffff', elements: [] })

export type Paper = SheetLayout['paper']

export interface BookletOptions {
  paper: Paper
  /** trait fin au centre de chaque face, pour plier droit */
  foldLine: boolean
}

export interface ImposedDocument {
  doc: TrameDocument
  /** nombre de faces imprimées (pages du PDF produit) */
  sides: number
}

/**
 * Livret : feuille paysage, deux pages côte à côte (chacune réduite pour tenir dans sa moitié, jamais agrandie, centrée). Le PDF est à
 * imprimer en recto-verso avec retournement sur le bord COURT : le verso d'une page tombe alors derrière elle.
 */
export function bookletDocument(doc: TrameDocument, options: BookletOptions): ImposedDocument {
  const order = bookletOrder(doc.pages.length)
  const ordered: TramePage[] = order.map((i) => (i === null ? blankPage() : doc.pages[i]))
  const layout: SheetLayout = { paper: options.paper, landscape: true, cols: 2, rows: 1, marginMm: 0, gapMm: 0, cutMarks: false, mirrorBacks: false, fillCell: false }
  const { doc: sheets } = sheetsFromMerged({ ...doc, pages: ordered }, 1, layout)
  if (options.foldLine) {
    const size = sheetSize(layout)
    for (const page of sheets.pages) page.elements.push({ id: nanoid(8), type: 'rect', x: size.width / 2 - 0.25, y: 0, width: 0.5, height: size.height, rotation: 0, opacity: 1, fill: '#9aa0aa' })
  }
  return { doc: sheets, sides: sheets.pages.length }
}

export interface NUpOptions {
  paper: Paper
  landscape: boolean
  cols: number
  rows: number
  marginMm: number
  gapMm: number
  /** contour fin autour de chaque page (utile pour des pages blanches ou claires) */
  border: boolean
}

/** Plusieurs pages par feuille, dans l'ordre de lecture (de gauche à droite, de haut en bas) ; une page n'est jamais agrandie. */
export function nUpDocument(doc: TrameDocument, options: NUpOptions): ImposedDocument {
  const layout: SheetLayout = { paper: options.paper, landscape: options.landscape, cols: options.cols, rows: options.rows, marginMm: options.marginMm, gapMm: options.gapMm, cutMarks: options.border, mirrorBacks: false, fillCell: false }
  const { doc: sheets } = sheetsFromMerged(doc, 1, layout)
  return { doc: sheets, sides: sheets.pages.length }
}

/** Réglages usuels « plusieurs pages par feuille » : nombre de pages, grille et orientation du papier. */
export const NUP_PRESETS = [
  { id: '2', cols: 2, rows: 1, landscape: true },
  { id: '4', cols: 2, rows: 2, landscape: false },
  { id: '6', cols: 3, rows: 2, landscape: true },
  { id: '9', cols: 3, rows: 3, landscape: false }
] as const

export type NUpPresetId = (typeof NUP_PRESETS)[number]['id']

/** Nombre de feuilles (faces) pour N pages à raison de `perSheet` pages par feuille. */
export const sheetCount = (pageCount: number, perSheet: number): number => Math.ceil(pageCount / Math.max(1, perSheet))

/** Les pages d'origine tiennent-elles bien dans la case (proportions voisines à 5 % près) ? Sinon elles seront centrées avec des marges. */
export function ratioMismatch(page: { width: number; height: number }, cell: { width: number; height: number }): boolean {
  const a = page.width / page.height
  const b = cell.width / cell.height
  return Math.abs(a - b) / b > 0.05
}
