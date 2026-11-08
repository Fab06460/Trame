import { describe, expect, it } from 'vitest'
import { handoutDocument, linesSheetCount, noteChunks, type HandoutOptions, type Measure } from './handout'
import type { TrameDocument, TrameElement, TramePage } from './types'

/** Mesure de substitution : 0,5 em par caractère, lignes de 1,35. */
const measure: Measure = (text, size, width) => {
  const perLine = Math.max(1, Math.floor(width / (size * 0.5)))
  let lines = 0
  for (const para of text.split('\n')) lines += Math.max(1, Math.ceil(para.length / perLine))
  return lines * size * 1.35
}
const labels = { notes: 'Notes', continued: 'suite' }
const slide = (id: string, extra: Partial<TramePage> = {}): TramePage => ({ id, background: '#ffffff', elements: [{ id: id + 'e', type: 'rect', x: 100, y: 100, width: 400, height: 200, rotation: 0, opacity: 1, fill: '#7c5cff' } as TrameElement], ...extra })
const doc = (pages: TramePage[]): TrameDocument => ({ version: 2, name: 'Cours', width: 1920, height: 1080, pages }) as unknown as TrameDocument
const opts = (extra: Partial<HandoutOptions> = {}): HandoutOptions => ({ layout: 'notes', paper: 'a4', perPage: 3, border: true, ...extra })
const texts = (p: TramePage): string[] => p.elements.filter((e) => e.type === 'text').map((e) => e.text ?? '')

describe('noteChunks', () => {
  it('garde des notes courtes d\'un seul morceau, à la plus grande taille', () => {
    expect(noteChunks('Bonjour', 680, 400, 900, measure)).toEqual([{ text: 'Bonjour', size: 15 }])
  })
  it('réduit la taille quand les notes ne tiennent pas à 15', () => {
    const text = 'mot '.repeat(1000).trim()
    const [chunk] = noteChunks(text, 680, 560, 900, measure)
    expect(chunk.size).toBeLessThan(15)
  })
  it('coupe des notes trop longues en plusieurs morceaux sans perdre un mot', () => {
    const text = Array.from({ length: 3000 }, (_, i) => `m${i}`).join(' ')
    const chunks = noteChunks(text, 680, 300, 900, measure)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((c) => c.text).join(' ')).toBe(text)
    for (const [i, c] of chunks.entries()) expect(measure(c.text, c.size, 680)).toBeLessThanOrEqual(i === 0 ? 300 : 900)
  })
  it('rend aucun morceau pour des notes vides', () => {
    expect(noteChunks('   ', 680, 400, 900, measure)).toEqual([])
  })
})

describe('handoutDocument — pages de notes', () => {
  const pages = [slide('a', { notes: 'Accueillir la salle' }), slide('b'), slide('c', { notes: 'Conclure' })]
  it('une feuille par diapositive, au format du papier (A4 ou Letter) en portrait', () => {
    const a4 = handoutDocument(doc(pages), opts(), labels, measure)
    expect(a4.sheets).toBe(3)
    expect([a4.doc.width, a4.doc.height]).toEqual([794, 1123])
    expect(a4.continued).toBe(0)
    const letter = handoutDocument(doc(pages), opts({ paper: 'letter' }), labels, measure)
    expect([letter.doc.width, letter.doc.height]).toEqual([816, 1056])
  })
  it('les notes sont du vrai texte sous la diapositive ; sans notes, des lignes à remplir', () => {
    const r = handoutDocument(doc(pages), opts(), labels, measure)
    expect(texts(r.doc.pages[0])).toContain('Accueillir la salle')
    expect(texts(r.doc.pages[0])).toContain('Notes')
    expect(texts(r.doc.pages[1])).not.toContain('Accueillir la salle')
    const thin = (p: TramePage): number => p.elements.filter((e) => e.type === 'rect' && e.height < 1).length
    expect(thin(r.doc.pages[1])).toBeGreaterThan(10)
    expect(thin(r.doc.pages[0])).toBe(0)
  })
  it('numérote les feuilles et nomme le document', () => {
    const r = handoutDocument(doc(pages), opts(), labels, measure)
    expect(texts(r.doc.pages[1])).toEqual(expect.arrayContaining(['Cours', '2 / 3']))
  })
  it('la diapositive tient dans la feuille avec ses marges, cadre compris', () => {
    const r = handoutDocument(doc(pages), opts(), labels, measure)
    for (const p of r.doc.pages) for (const e of p.elements) {
      expect(e.x).toBeGreaterThanOrEqual(-1)
      expect(e.y).toBeGreaterThanOrEqual(-1)
      expect(e.x + e.width).toBeLessThanOrEqual(r.doc.width + 1)
      expect(e.y + e.height).toBeLessThanOrEqual(r.doc.height + 1)
    }
  })
  it('sans cadre, aucun filet autour de la diapositive', () => {
    const framed = handoutDocument(doc(pages), opts({ border: true }), labels, measure).doc.pages[0].elements.length
    const bare = handoutDocument(doc(pages), opts({ border: false }), labels, measure).doc.pages[0].elements.length
    expect(framed - bare).toBe(4)
  })
  it('des notes très longues continuent sur des feuilles de suite', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `m${i}`).join(' ')
    const r = handoutDocument(doc([slide('a', { notes: long }), slide('b')]), opts(), labels, measure)
    expect(r.continued).toBeGreaterThan(0)
    expect(r.sheets).toBe(2 + r.continued)
    const written = r.doc.pages.flatMap((p) => p.elements.filter((e) => e.type === 'text' && /^m\d/.test(e.text ?? '')).map((e) => e.text)).join(' ')
    expect(written).toBe(long)
    expect(texts(r.doc.pages[1])).toContain('1 / 2 · suite')
  })
  it('les diapositives masquées ne sont pas reprises', () => {
    const p = slide('a')
    p.elements.push({ ...p.elements[0], id: 'h', hidden: true, fill: '#ff0000' })
    const r = handoutDocument(doc([p]), opts(), labels, measure)
    expect(r.doc.pages[0].elements.some((e) => e.fill === '#ff0000')).toBe(false)
  })
})

describe('handoutDocument — polycopié avec lignes', () => {
  const many = Array.from({ length: 7 }, (_, i) => slide('p' + i))
  it('autant de feuilles que nécessaire', () => {
    expect(handoutDocument(doc(many), opts({ layout: 'lines', perPage: 3 }), labels, measure).sheets).toBe(3)
    expect(handoutDocument(doc(many), opts({ layout: 'lines', perPage: 2 }), labels, measure).sheets).toBe(4)
    expect(handoutDocument(doc(many), opts({ layout: 'lines', perPage: 6 }), labels, measure).sheets).toBe(2)
    expect(linesSheetCount(7, 3)).toBe(3)
  })
  it('numérote chaque diapositive et indique les pages de la feuille', () => {
    const r = handoutDocument(doc(many), opts({ layout: 'lines', perPage: 3 }), labels, measure)
    expect(texts(r.doc.pages[0])).toEqual(expect.arrayContaining(['1', '2', '3', '1–3 / 7']))
    expect(texts(r.doc.pages[2])).toEqual(expect.arrayContaining(['7', '7 / 7']))
  })
  it('met des lignes à remplir à côté (ou sous) les diapositives', () => {
    for (const perPage of [2, 3, 4, 6] as const) {
      const r = handoutDocument(doc(many), opts({ layout: 'lines', perPage }), labels, measure)
      expect(r.doc.pages[0].elements.filter((e) => e.type === 'rect' && e.height < 1).length).toBeGreaterThan(perPage)
    }
  })
  it('tout reste dans la feuille', () => {
    for (const perPage of [2, 3, 4, 6] as const) {
      const r = handoutDocument(doc(many), opts({ layout: 'lines', perPage }), labels, measure)
      for (const p of r.doc.pages) for (const e of p.elements) {
        expect(e.x).toBeGreaterThanOrEqual(-1)
        expect(e.y).toBeGreaterThanOrEqual(-1)
        expect(e.x + e.width).toBeLessThanOrEqual(r.doc.width + 1)
        expect(e.y + e.height).toBeLessThanOrEqual(r.doc.height + 1)
      }
    }
  })
  it('les notes de l\'orateur ne sont pas imprimées dans ce polycopié', () => {
    const r = handoutDocument(doc([slide('a', { notes: 'Secret de l\'orateur' })]), opts({ layout: 'lines' }), labels, measure)
    expect(texts(r.doc.pages[0]).join('|')).not.toContain('Secret')
  })
})
