import { describe, expect, it } from 'vitest'
import { PX_PER_MM, cells, sheetSize } from './mergeSheets'
import { NUP_PRESETS, bookletBlanks, bookletDocument, bookletOrder, nUpDocument, ratioMismatch, sheetCount } from './imposition'
import type { TrameDocument, TramePage } from './types'

const page = (n: number): TramePage => ({
  id: `p${n}`,
  background: '#ffffff',
  elements: [{ id: `t${n}`, type: 'text', x: 20, y: 20, width: 300, height: 60, rotation: 0, opacity: 1, fill: '#000000', text: `Page ${n + 1}`, fontSize: 40 }]
})
const doc = (n: number, width = 559, height = 794): TrameDocument => ({ version: 2, name: 'd', width, height, pages: Array.from({ length: n }, (_, i) => page(i)) })

describe('ordre d\'un livret', () => {
  it('8 pages : 8,1 | 2,7 | 6,3 | 4,5 (indices 7,0 | 1,6 | 5,2 | 3,4)', () => {
    expect(bookletOrder(8)).toEqual([7, 0, 1, 6, 5, 2, 3, 4])
  })
  it('4 pages : 4,1 | 2,3', () => {
    expect(bookletOrder(4)).toEqual([3, 0, 1, 2])
  })
  it('complété par des pages blanches jusqu\'à un multiple de 4', () => {
    expect(bookletOrder(5)).toEqual([null, 0, 1, null, null, 2, 3, 4])
    expect(bookletBlanks(5)).toBe(3)
    expect(bookletBlanks(8)).toBe(0)
    expect(bookletBlanks(1)).toBe(3)
    expect(bookletOrder(1)).toEqual([null, 0, null, null])
  })
  it('chaque page apparaît une fois, les pages d\'une feuille se suivent', () => {
    for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 12, 13, 30]) {
      const order = bookletOrder(n)
      const real = order.filter((v): v is number => v !== null).sort((a, b) => a - b)
      expect(real, String(n)).toEqual(Array.from({ length: n }, (_, i) => i))
      expect(order.length % 4).toBe(0)
      // un recto et son verso : les deux pages « dos à dos » sont consécutives (p, p+1)
      for (let s = 0; s < order.length; s += 4) {
        const [fl, fr, bl, br] = order.slice(s, s + 4)
        if (fr !== null && bl !== null) expect(bl, `${n}:${s}`).toBe(fr + 1)
        if (fl !== null && br !== null) expect(fl, `${n}:${s}`).toBe(br + 1)
      }
    }
  })
})

describe('livret', () => {
  it('8 pages A5 : 4 faces A4 paysage, chaque page à sa taille réelle dans sa moitié', () => {
    const r = bookletDocument(doc(8), { paper: 'a4', foldLine: false })
    expect(r.sides).toBe(4)
    const size = sheetSize({ paper: 'a4', landscape: true })
    expect(r.doc.width).toBe(size.width)
    expect(r.doc.width).toBeGreaterThan(r.doc.height)
    // face 1 : page 8 à gauche, page 1 à droite
    const texts = r.doc.pages[0].elements.filter((e) => e.type === 'text')
    expect(texts.map((t) => t.text)).toEqual(['Page 8', 'Page 1'])
    expect(texts[0].x).toBeLessThan(size.width / 2)
    expect(texts[1].x).toBeGreaterThan(size.width / 2)
    // face 2 (verso) : page 2 à gauche, page 7 à droite
    expect(r.doc.pages[1].elements.filter((e) => e.type === 'text').map((t) => t.text)).toEqual(['Page 2', 'Page 7'])
    // taille réelle : la police n'a pas changé (A5 = demi feuille A4)
    expect(texts[0].fontSize).toBeCloseTo(40, 0)
  })
  it('des pages A4 sont réduites pour tenir dans la moitié, jamais agrandies', () => {
    const big = bookletDocument(doc(4, 794, 1123), { paper: 'a4', foldLine: false })
    const t = big.doc.pages[0].elements.find((e) => e.type === 'text')!
    expect(t.fontSize!).toBeLessThan(40)
    const small = bookletDocument(doc(4, 200, 300), { paper: 'a4', foldLine: false })
    expect(small.doc.pages[0].elements.find((e) => e.type === 'text')!.fontSize).toBeCloseTo(40, 6)
  })
  it('pages blanches ajoutées en fin de cahier (5 pages : 3 blanches, 2 feuilles recto-verso)', () => {
    const r = bookletDocument(doc(5), { paper: 'a4', foldLine: false })
    expect(r.sides).toBe(4)
    const all = r.doc.pages.flatMap((p) => p.elements.filter((e) => e.type === 'text').map((e) => e.text))
    expect(all.sort()).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5'])
  })
  it('trait de pli au centre de chaque face, si demandé', () => {
    const r = bookletDocument(doc(4), { paper: 'a4', foldLine: true })
    for (const p of r.doc.pages) {
      const fold = p.elements.filter((e) => e.type === 'rect' && e.width < 1 && e.height === r.doc.height)
      expect(fold).toHaveLength(1)
      expect(fold[0].x + fold[0].width / 2).toBeCloseTo(r.doc.width / 2, 6)
    }
    expect(bookletDocument(doc(4), { paper: 'a4', foldLine: false }).doc.pages[0].elements.some((e) => e.width < 1)).toBe(false)
  })
  it('format Lettre', () => {
    const r = bookletDocument(doc(4), { paper: 'letter', foldLine: false })
    expect(r.doc.width).toBe(1056)
    expect(r.doc.height).toBe(816)
  })
})

describe('plusieurs pages par feuille', () => {
  const base = { paper: 'a4' as const, landscape: false, marginMm: 10, gapMm: 4, border: true }
  it('4 par feuille, 10 pages : 3 feuilles, dans l\'ordre de lecture', () => {
    const r = nUpDocument(doc(10, 794, 1123), { ...base, cols: 2, rows: 2 })
    expect(r.sides).toBe(3)
    expect(sheetCount(10, 4)).toBe(3)
    expect(r.doc.pages[0].elements.filter((e) => e.type === 'text').map((e) => e.text)).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4'])
    expect(r.doc.pages[2].elements.filter((e) => e.type === 'text').map((e) => e.text)).toEqual(['Page 9', 'Page 10'])
  })
  it('chaque page est réduite à la taille de sa case', () => {
    const r = nUpDocument(doc(4, 794, 1123), { ...base, cols: 2, rows: 2 })
    const cell = cells({ ...base, cols: 2, rows: 2, cutMarks: true, mirrorBacks: false, fillCell: false })[0]
    const scale = Math.min(cell.width / 794, cell.height / 1123)
    expect(r.doc.pages[0].elements.find((e) => e.type === 'text')!.fontSize).toBeCloseTo(40 * scale, 4)
  })
  it('contour fin autour de chaque page : quatre traits par page, ou aucun', () => {
    const lines = (border: boolean) => nUpDocument(doc(2), { ...base, cols: 2, rows: 1, landscape: true, border }).doc.pages[0].elements.filter((e) => e.type === 'rect' && e.fill === '#9aa0aa')
    expect(lines(true)).toHaveLength(8)
    expect(lines(false)).toHaveLength(0)
  })
  it('les réglages usuels tiennent sur la feuille', () => {
    for (const p of NUP_PRESETS) {
      const r = nUpDocument(doc(p.cols * p.rows), { ...base, cols: p.cols, rows: p.rows, landscape: p.landscape })
      expect(r.sides).toBe(1)
      const size = sheetSize({ paper: 'a4', landscape: p.landscape })
      for (const e of r.doc.pages[0].elements) expect(e.x + e.width, p.id).toBeLessThanOrEqual(size.width + 1)
    }
  })
})

describe('proportions', () => {
  it('compare une page à sa case', () => {
    const half = { width: (297 * PX_PER_MM) / 2, height: 210 * PX_PER_MM }
    expect(ratioMismatch({ width: 559, height: 794 }, half)).toBe(false)
    expect(ratioMismatch({ width: 1920, height: 1080 }, half)).toBe(true)
  })
})
