import { describe, expect, it } from 'vitest'
import { PX_PER_MM, cells, layoutProblem, sheetSize, type SheetLayout } from './mergeSheets'
import { SHEET_PRESETS, applyPreset, freeLayout, presetById } from './sheetPresets'

const base: SheetLayout = { paper: 'a4', landscape: false, cols: 2, rows: 4, marginMm: 10, gapMm: 2, cutMarks: true, mirrorBacks: true, fillCell: false }

describe('planches du commerce', () => {
  it('chaque gabarit tient sur sa feuille et a un identifiant unique', () => {
    expect(new Set(SHEET_PRESETS.map((p) => p.id)).size).toBe(SHEET_PRESETS.length)
    for (const p of SHEET_PRESETS) expect(layoutProblem(applyPreset(p, base)), p.id).toBeNull()
  })
  it('la grille est centrée sur la feuille : marges égales à gauche et à droite, en haut et en bas', () => {
    for (const p of SHEET_PRESETS) {
      const l = applyPreset(p, base)
      const grid = cells(l)
      const size = sheetSize(l)
      const first = grid[0]
      const last = grid[grid.length - 1]
      expect(first.x, p.id).toBeCloseTo(size.width - (last.x + last.width), 3)
      expect(first.y, p.id).toBeCloseTo(size.height - (last.y + last.height), 3)
    }
  })
  it('L7160 : 21 étiquettes de 63,5 × 38,1 mm, marge haute 15,15 mm et marge gauche 7,25 mm (valeurs publiées : 15,1 et 7,2)', () => {
    const l = applyPreset(presetById('a4-l7160')!, base)
    const grid = cells(l)
    expect(grid).toHaveLength(21)
    expect(grid[0].width / PX_PER_MM).toBeCloseTo(63.5, 3)
    expect(grid[0].height / PX_PER_MM).toBeCloseTo(38.1, 3)
    // la feuille A4 fait 794 × 1123 px (210,08 × 297,15 mm) : moins de 0,1 mm d'écart
    expect(Math.abs(grid[0].y / PX_PER_MM - 15.15)).toBeLessThan(0.1)
    expect(Math.abs(grid[0].x / PX_PER_MM - 7.25)).toBeLessThan(0.1)
    expect((grid[1].x - grid[0].x) / PX_PER_MM).toBeCloseTo(66, 3)
  })
  it('le gabarit remplit la case, sans espace vertical, et ignore les marges libres', () => {
    const l = applyPreset(presetById('a4-l7163')!, { ...base, marginMm: 40, gapMm: 30 })
    const grid = cells(l)
    expect(l.fillCell).toBe(true)
    expect(grid[2].y - (grid[0].y + grid[0].height)).toBeCloseTo(0, 6)
    expect(Math.abs(grid[0].x / PX_PER_MM - 4.65)).toBeLessThan(0.1)
  })
  it('le décalage déplace toute la grille, avec ou sans gabarit', () => {
    const free = cells(base)[0]
    const moved = cells({ ...base, offsetXMm: 1.5, offsetYMm: -2 })[0]
    expect((moved.x - free.x) / PX_PER_MM).toBeCloseTo(1.5, 6)
    expect((moved.y - free.y) / PX_PER_MM).toBeCloseTo(-2, 6)
    const l = applyPreset(presetById('a4-l7160')!, base)
    expect((cells({ ...l, offsetXMm: 2 })[0].x - cells(l)[0].x) / PX_PER_MM).toBeCloseTo(2, 6)
  })
  it('un gabarit qui ne tient plus (colonnes ajoutées, paysage) est refusé', () => {
    const l = applyPreset(presetById('a4-l7160')!, base)
    expect(layoutProblem({ ...l, cols: 4 })).toBe('room')
    expect(layoutProblem({ ...l, offsetXMm: Number.NaN })).toBe('grid')
  })
  it('la grille libre retrouve ses marges', () => {
    const free = freeLayout(applyPreset(presetById('a4-l7160')!, base))
    expect(free.fixed).toBeUndefined()
    expect(free.preset).toBeUndefined()
    expect(cells(free)[0].x / PX_PER_MM).toBeCloseTo(10, 6)
  })
})
