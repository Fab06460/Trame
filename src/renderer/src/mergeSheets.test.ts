import { describe, expect, it } from 'vitest'
import { mergeDocument } from '@/mailMerge'
import { PX_PER_MM, cells, clipToCard, layoutProblem, sheetSize, sheetsFromMerged, suggestGrid, type SheetLayout } from '@/mergeSheets'
import type { TrameDocument, TrameElement } from '@/types'

const el = (id: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 10, y: 10, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#123456', ...extra })
const layout = (extra: Partial<SheetLayout> = {}): SheetLayout => ({ paper: 'a4', landscape: false, cols: 2, rows: 3, marginMm: 10, gapMm: 2, cutMarks: false, mirrorBacks: false, ...extra })
const card = (pages = 1): TrameDocument => ({
  version: 2, name: 'Carte', width: 400, height: 200,
  pages: Array.from({ length: pages }, (_, p) => ({ id: `p${p}`, background: p ? '#e8f4ff' : '#fff7e6', elements: [{ ...el(`t${p}`, { type: 'text', text: p ? '{{Verso}}' : '{{Nom}}', fontSize: 40, x: 20, y: 20, width: 360, height: 48, strokeWidth: 2, stroke: '#000', shadow: { color: '#000', blur: 10, offsetX: 4, offsetY: 6, opacity: 0.5 } }) }] }))
})
const data = { columns: ['Nom', 'Verso'], rows: [['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'], ['F', 'f'], ['G', 'g']] }

describe('grille de la planche', () => {
  it('formats et orientation', () => {
    expect(sheetSize({ paper: 'a4', landscape: false })).toEqual({ width: 794, height: 1123 })
    expect(sheetSize({ paper: 'a4', landscape: true })).toEqual({ width: 1123, height: 794 })
    expect(sheetSize({ paper: 'letter', landscape: false })).toEqual({ width: 816, height: 1056 })
  })
  it('les cases tiennent dans la feuille, séparées par l\'espace demandé', () => {
    const c = cells(layout())
    expect(c).toHaveLength(6)
    const last = c[5]
    expect(last.x + last.width).toBeCloseTo(794 - 10 * PX_PER_MM, 5)
    expect(last.y + last.height).toBeCloseTo(1123 - 10 * PX_PER_MM, 5)
    expect(c[1].x - (c[0].x + c[0].width)).toBeCloseTo(2 * PX_PER_MM, 5)
  })
  it('refuse une grille absurde ou une fiche de moins de 10 mm', () => {
    expect(layoutProblem(layout())).toBeNull()
    expect(layoutProblem(layout({ cols: 0 }))).toBe('grid')
    expect(layoutProblem(layout({ rows: 21 }))).toBe('grid')
    expect(layoutProblem(layout({ marginMm: -1 }))).toBe('grid')
    expect(layoutProblem(layout({ cols: 10, rows: 20, gapMm: 20 }))).toBe('room')
  })
  it('propose une grille où chaque fiche garde au moins 55 × 25 mm', () => {
    const base = { paper: 'a4' as const, landscape: false, marginMm: 10, gapMm: 2 }
    for (const size of [{ width: 680, height: 260 }, { width: 640, height: 420 }, { width: 794, height: 563 }, { width: 1123, height: 794 }]) {
      const g = suggestGrid(size, base)
      const cell = cells({ ...base, ...g, cutMarks: false, mirrorBacks: false })[0]
      const s = Math.min(cell.width / size.width, cell.height / size.height)
      expect(size.width * s, JSON.stringify(size)).toBeGreaterThanOrEqual(55 * PX_PER_MM - 0.001)
      expect(size.height * s, JSON.stringify(size)).toBeGreaterThanOrEqual(25 * PX_PER_MM - 0.001)
    }
    expect(suggestGrid({ width: 680, height: 260 }, base)).toEqual({ cols: 2, rows: 10 })
    expect(suggestGrid({ width: 100000, height: 100 }, base)).toEqual({ cols: 1, rows: 1 })
  })
})

describe('rognage d\'une fiche', () => {
  it('un élément dans la fiche reste tel quel', () => {
    expect(clipToCard(el('a'), 400, 200)).toEqual({ element: el('a'), overflow: false })
  })
  it('un rectangle qui sort est rogné au bord ; entièrement dehors, il est retiré', () => {
    const r = clipToCard(el('a', { x: -50, y: -20, width: 500, height: 300 }), 400, 200)
    expect(r.element).toMatchObject({ x: 0, y: 0, width: 400, height: 200 })
    expect(r.overflow).toBe(false)
    expect(clipToCard(el('b', { x: 500 }), 400, 200)).toEqual({ element: null, overflow: false })
  })
  it('une image qui sort est rognée avec son recadrage', () => {
    const img = el('i', { type: 'image', src: 'data:image/png;base64,AA==', x: -100, y: 0, width: 400, height: 200 })
    const r = clipToCard(img, 400, 200)
    expect(r.element).toMatchObject({ x: 0, width: 300, height: 200 })
    expect(r.element!.crop).toEqual({ x: 0.25, y: 0, width: 0.75, height: 1 })
    const recropped = clipToCard({ ...img, crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }, 400, 200)
    expect(recropped.element!.crop).toEqual({ x: 0.625, y: 0, width: 0.375, height: 1 })
  })
  it('texte, forme, élément pivoté ou à contour qui sortent sont comptés, pas rognés', () => {
    expect(clipToCard(el('t', { type: 'text', x: 350, width: 200 }), 400, 200).overflow).toBe(true)
    expect(clipToCard(el('e', { type: 'ellipse', x: -20 }), 400, 200).overflow).toBe(true)
    expect(clipToCard(el('r', { rotation: 45, x: 380 }), 400, 200).overflow).toBe(true)
    expect(clipToCard(el('s', { x: -10, stroke: '#000', strokeWidth: 2 }), 400, 200).overflow).toBe(true)
  })
})

describe('planches', () => {
  const merged = (rows: number[], pages = 1): TrameDocument => mergeDocument(card(pages), data, rows)

  it('une planche par groupe de fiches, au format du papier', () => {
    const r = sheetsFromMerged(merged([0, 1, 2, 3, 4, 5, 6]), 1, layout())
    expect(r.doc.pages).toHaveLength(2) // 6 + 1
    expect([r.doc.width, r.doc.height]).toEqual([794, 1123])
    expect(r.overflow).toBe(0)
    expect('mailMerge' in r.doc).toBe(false)
  })
  it('chaque fiche est réduite pour tenir dans sa case, mesures proportionnelles comprises', () => {
    const l = layout({ cols: 1, rows: 1, marginMm: 0, gapMm: 0 })
    const r = sheetsFromMerged(merged([0]), 1, l)
    const [bg, text] = r.doc.pages[0].elements
    const s = 794 / 400
    expect(bg.width).toBeCloseTo(794, 3)
    expect(bg.height).toBeCloseTo(397, 3)
    expect(bg.y).toBeCloseTo((1123 - 397) / 2, 3)
    expect(text.fontSize).toBeCloseTo(40 * s, 3)
    expect(text.strokeWidth).toBeCloseTo(2 * s, 3)
    expect(text.shadow).toMatchObject({ blur: 10 * s, offsetX: 4 * s, offsetY: 6 * s })
    expect(text.x).toBeCloseTo(20 * s, 3)
    expect(text.text).toBe('A')
  })
  it('recto-verso : une planche par page du modèle, versos en miroir sur les colonnes (portrait)', () => {
    const r = sheetsFromMerged(merged([0, 1], 2), 2, layout({ cols: 2, rows: 1, mirrorBacks: true }))
    expect(r.doc.pages).toHaveLength(2)
    const x = (page: number, text: string): number => r.doc.pages[page].elements.find((e) => e.text === text)!.x
    expect(x(0, 'A')).toBeLessThan(x(0, 'B'))
    expect(x(1, 'a')).toBeGreaterThan(x(1, 'b')) // le verso de A est derrière A : à droite après retournement
  })
  it('sans miroir, les versos gardent l\'ordre des rectos ; en paysage le miroir porte sur les lignes', () => {
    const plain = sheetsFromMerged(merged([0, 1], 2), 2, layout({ cols: 2, rows: 1, mirrorBacks: false }))
    expect(plain.doc.pages[1].elements.find((e) => e.text === 'a')!.x).toBeLessThan(plain.doc.pages[1].elements.find((e) => e.text === 'b')!.x)
    const land = sheetsFromMerged(merged([0, 1], 2), 2, layout({ landscape: true, cols: 1, rows: 2, mirrorBacks: true }))
    const y = (page: number, text: string): number => land.doc.pages[page].elements.find((e) => e.text === text)!.y
    expect(y(0, 'A')).toBeLessThan(y(0, 'B'))
    expect(y(1, 'a')).toBeGreaterThan(y(1, 'b'))
  })
  it('contour de découpe : quatre filets par fiche, en dernier', () => {
    const r = sheetsFromMerged(merged([0, 1]), 1, layout({ cutMarks: true }))
    const els = r.doc.pages[0].elements
    expect(els.length).toBe(2 * 2 + 2 * 4)
    expect(els.slice(-8).every((e) => e.fill === '#9aa0aa')).toBe(true)
  })
  it('les éléments qui débordent sans pouvoir être rognés sont comptés', () => {
    const d = card()
    d.pages[0].elements.push(el('big', { type: 'text', text: 'x', x: 380, width: 100 }))
    const r = sheetsFromMerged(mergeDocument(d, data, [0, 1]), 1, layout())
    expect(r.overflow).toBe(2)
  })
})
