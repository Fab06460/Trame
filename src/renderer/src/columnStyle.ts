import type { TrameElement } from '@/types'

/** Nombre de colonnes accepté, et espace entre deux colonnes (pixels de design). */
export const COLUMNS = { min: 1, max: 4 }
export const COLUMN_GAP = { min: 0, max: 200 }

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Nombre de colonnes d'un texte (1 = texte ordinaire). */
export const columnsOf = (el: Pick<TrameElement, 'columns'>): number => (el.columns ? clamp(Math.round(el.columns), COLUMNS.min, COLUMNS.max) : 1)

/** Espace entre les colonnes : celui de l'élément, sinon une fois la taille de police. */
export const columnGapOf = (el: Pick<TrameElement, 'columnGap' | 'fontSize'>): number => el.columnGap ?? Math.round(el.fontSize ?? 32)

/** Largeur d'une colonne dans une boîte de `width` (jamais moins de 1 : la mise en page de Konva ne supporte pas une largeur nulle). */
export const columnWidth = (width: number, count: number, gap: number): number => Math.max(1, (width - gap * (count - 1)) / count)

/** Lignes par colonne : le texte est réparti en colonnes équilibrées (les premières sont pleines, la dernière peut être plus courte). */
export const columnRows = (lines: number, count: number): number => Math.max(1, Math.ceil(lines / Math.max(1, count)))

/** Où tombe la ligne `index` : sa colonne, sa rangée dans la colonne et le décalage horizontal de la colonne. */
export function placeLine(index: number, rows: number, colWidth: number, gap: number): { col: number; row: number; x: number } {
  const col = Math.floor(index / rows)
  return { col, row: index - col * rows, x: col * (colWidth + gap) }
}

/**
 * Mise en page des colonnes d'un texte déjà découpé en `lines` lignes (à la largeur d'une colonne) : largeur de la colonne, lignes par
 * colonne et espace. Sans colonnes (ou sans largeur), tout est dans une seule colonne large comme la boîte.
 */
export function columnLayout(el: Pick<TrameElement, 'columns' | 'columnGap' | 'fontSize' | 'width'>, lines: number): { count: number; width: number; gap: number; rows: number } {
  const count = columnsOf(el)
  if (count === 1) return { count, width: el.width, gap: 0, rows: Math.max(1, lines) }
  const gap = columnGapOf(el)
  return { count, width: columnWidth(el.width, count, gap), gap, rows: columnRows(lines, count) }
}

/** Nettoyage à la lecture : seules des valeurs connues, et seulement sur un texte. Modifie en place. */
export function sanitizeColumns(element: object): void {
  const e = element as Record<string, unknown>
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (e.type !== 'text' || !ok(e.columns) || Math.round(e.columns) < 2) {
    delete e.columns
    delete e.columnGap
    return
  }
  e.columns = clamp(Math.round(e.columns), 2, COLUMNS.max)
  if (!ok(e.columnGap)) delete e.columnGap
  else e.columnGap = clamp(e.columnGap, COLUMN_GAP.min, COLUMN_GAP.max)
}
