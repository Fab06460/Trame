import { describe, expect, it } from 'vitest'
import { columnGapOf, columnLayout, columnRows, columnsOf, columnWidth, placeLine, sanitizeColumns } from '@/columnStyle'

describe('colonnes de texte', () => {
  it('une colonne par défaut, bornée entre 1 et 4', () => {
    expect(columnsOf({})).toBe(1)
    expect(columnsOf({ columns: 3 })).toBe(3)
    expect(columnsOf({ columns: 9 })).toBe(4)
    expect(columnsOf({ columns: 2.4 })).toBe(2)
  })

  it('espace par défaut : une fois la taille de police', () => {
    expect(columnGapOf({ fontSize: 24 })).toBe(24)
    expect(columnGapOf({})).toBe(32)
    expect(columnGapOf({ columnGap: 0, fontSize: 24 })).toBe(0)
  })

  it('largeur d’une colonne : la boîte moins les espaces, partagée', () => {
    expect(columnWidth(1000, 2, 40)).toBe(480)
    expect(columnWidth(1000, 3, 50)).toBeCloseTo(300)
    expect(columnWidth(10, 4, 100)).toBe(1)
  })

  it('colonnes équilibrées : les premières pleines, la dernière plus courte', () => {
    expect(columnRows(7, 2)).toBe(4)
    expect(columnRows(6, 3)).toBe(2)
    expect(columnRows(1, 3)).toBe(1)
    expect(columnRows(0, 2)).toBe(1)
  })

  it('place chaque ligne dans sa colonne', () => {
    // 7 lignes en 2 colonnes de 480 px séparées de 40 px : 4 + 3
    expect([0, 3, 4, 6].map((i) => placeLine(i, 4, 480, 40))).toEqual([
      { col: 0, row: 0, x: 0 },
      { col: 0, row: 3, x: 0 },
      { col: 1, row: 0, x: 520 },
      { col: 1, row: 2, x: 520 }
    ])
  })

  it('sans colonnes tout reste dans une colonne large comme la boîte', () => {
    expect(columnLayout({ width: 600, fontSize: 20 }, 5)).toEqual({ count: 1, width: 600, gap: 0, rows: 5 })
    expect(columnLayout({ width: 600, fontSize: 20, columns: 3 }, 7)).toMatchObject({ count: 3, gap: 20, rows: 3 })
  })

  it('nettoyage : valeurs connues seulement, sur un texte seulement', () => {
    const ok = { type: 'text', columns: 3, columnGap: 500 }
    sanitizeColumns(ok)
    expect(ok).toEqual({ type: 'text', columns: 3, columnGap: 200 })
    const one = { type: 'text', columns: 1, columnGap: 10 }
    sanitizeColumns(one)
    expect(one).toEqual({ type: 'text' })
    const bad = { type: 'text', columns: 'deux', columnGap: 'x' }
    sanitizeColumns(bad)
    expect(bad).toEqual({ type: 'text' })
    const rect = { type: 'rect', columns: 2 }
    sanitizeColumns(rect)
    expect(rect).toEqual({ type: 'rect' })
    const big = { type: 'text', columns: 12, columnGap: 'x' }
    sanitizeColumns(big)
    expect(big).toEqual({ type: 'text', columns: 4 })
  })
})
