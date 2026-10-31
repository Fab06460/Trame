import type { MessageKey } from '@shared/i18n'
import type { FixedGrid, SheetLayout } from '@/mergeSheets'

/**
 * Planches du commerce : taille d'une étiquette, nombre de colonnes et de lignes, espace entre colonnes. Les formats Avery courants sont
 * des grilles **centrées** sur la feuille (marges égales à gauche et à droite, en haut et en bas), ce qui évite d'avoir à connaître
 * chaque marge. Les valeurs viennent des fiches des fabricants ; une feuille d'essai sur papier ordinaire (superposée à la vraie
 * planche à contre-jour) permet de vérifier, et le réglage fin du décalage compense l'imprimante.
 */
export interface SheetPreset {
  id: string
  paper: SheetLayout['paper']
  cols: number
  rows: number
  grid: FixedGrid
  /** référence du fabricant (affichée telle quelle) */
  name: string
  /** gabarit sans fabricant : texte traduit à la place du nom */
  key?: MessageKey
}

const INCH = 25.4
const a4 = (id: string, name: string, cols: number, rows: number, cellWMm: number, cellHMm: number, gapXMm: number, gapYMm = 0): SheetPreset => ({ id, name, paper: 'a4', cols, rows, grid: { cellWMm, cellHMm, gapXMm, gapYMm } })
const us = (id: string, name: string, cols: number, rows: number, wIn: number, hIn: number, gapXIn: number): SheetPreset => ({
  id,
  name,
  paper: 'letter',
  cols,
  rows,
  grid: { cellWMm: Math.round(wIn * INCH * 100) / 100, cellHMm: Math.round(hIn * INCH * 100) / 100, gapXMm: Math.round(gapXIn * INCH * 100) / 100, gapYMm: 0 }
})

export const SHEET_PRESETS: SheetPreset[] = [
  a4('a4-l7160', 'Avery L7160', 3, 7, 63.5, 38.1, 2.5),
  a4('a4-l7161', 'Avery L7161', 3, 6, 63.5, 46.6, 2.5),
  a4('a4-l7162', 'Avery L7162', 2, 8, 99.1, 33.9, 2.5),
  a4('a4-l7163', 'Avery L7163', 2, 7, 99.1, 38.1, 2.5),
  a4('a4-l7164', 'Avery L7164', 3, 4, 63.5, 72, 2.5),
  a4('a4-l7165', 'Avery L7165', 2, 4, 99.1, 67.7, 2.5),
  a4('a4-l7173', 'Avery L7173', 2, 5, 99.1, 57, 2.5),
  a4('a4-l7651', 'Avery L7651', 5, 13, 38.1, 21.2, 2.5),
  { ...a4('a4-card85', '', 2, 5, 85, 55, 0), key: 'mm.preset.card85' },
  { ...a4('a4-a6', '', 2, 2, 105, 148.5, 0), key: 'mm.preset.a6' },
  { ...a4('a4-a7', '', 2, 4, 105, 74.25, 0), key: 'mm.preset.a7' },
  us('letter-5160', 'Avery 5160 / 8160', 3, 10, 2.625, 1, 0.125),
  us('letter-5162', 'Avery 5162', 2, 7, 4, 1.333, 0.1875),
  us('letter-5163', 'Avery 5163', 2, 5, 4, 2, 0.1875),
  us('letter-5164', 'Avery 5164', 2, 3, 4, 3.333, 0.1875)
]

export const presetById = (id: string | undefined): SheetPreset | undefined => SHEET_PRESETS.find((p) => p.id === id)

/** Mise en page d'un gabarit : papier et grille du fabricant, portrait, fiche ajustée à sa case (une étiquette se remplit), décalage conservé. */
export const applyPreset = (preset: SheetPreset, base: SheetLayout): SheetLayout => ({
  ...base,
  paper: preset.paper,
  landscape: false,
  cols: preset.cols,
  rows: preset.rows,
  fixed: { ...preset.grid },
  preset: preset.id,
  fillCell: true
})

/** Retour à la grille libre : les cases fixes sont oubliées, la grille garde ses colonnes et lignes. */
export const freeLayout = (l: SheetLayout): SheetLayout => {
  const { fixed: _f, preset: _p, ...rest } = l
  void _f
  void _p
  return rest
}
