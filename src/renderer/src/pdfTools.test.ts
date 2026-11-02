import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildPdf, countPages, moveItem, parsePageRanges, partName, splitGroups, turn, type PageRef } from './pdfTools'

/** PDF dont la page i a pour largeur `widths[i]` (repère de reconnaissance des pages). */
async function pdfOf(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const w of widths) doc.addPage([w, 100])
  return doc.save()
}
const widthsOf = async (bytes: Uint8Array): Promise<number[]> => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()))

describe('parsePageRanges', () => {
  it('lit des numéros, des plages et des plages ouvertes', () => {
    expect(parsePageRanges('1-3, 5', 10)).toEqual([0, 1, 2, 4])
    expect(parsePageRanges('8-', 10)).toEqual([7, 8, 9])
    expect(parsePageRanges('-2', 10)).toEqual([0, 1])
    expect(parsePageRanges('4', 10)).toEqual([3])
  })
  it('trie, dédoublonne et borne au nombre de pages', () => {
    expect(parsePageRanges('5 2 2-3; 3', 10)).toEqual([1, 2, 4])
    expect(parsePageRanges('8-99', 10)).toEqual([7, 8, 9])
  })
  it('refuse le vide, le mal écrit et ce qui ne désigne aucune page', () => {
    for (const bad of ['', '  ', '-', 'a', '1-x', '0', '3-1', '1--2', '50']) expect(parsePageRanges(bad, 10), bad).toBeNull()
  })
})

describe('splitGroups / partName', () => {
  it('une page par fichier, ou tous les n', () => {
    expect(splitGroups(3, { kind: 'each' })).toEqual([[0], [1], [2]])
    expect(splitGroups(5, { kind: 'every', n: 2 })).toEqual([[0, 1], [2, 3], [4]])
    expect(splitGroups(2, { kind: 'every', n: 10 })).toEqual([[0, 1]])
    expect(splitGroups(3, { kind: 'every', n: 0 })).toEqual([[0], [1], [2]])
    expect(splitGroups(0, { kind: 'each' })).toEqual([])
  })
  it('numérote sur au moins deux chiffres, plus si besoin', () => {
    expect(partName('Rapport', 0, 5)).toBe('Rapport-01.pdf')
    expect(partName('Rapport', 11, 120)).toBe('Rapport-012.pdf')
  })
})

describe('moveItem / turn', () => {
  it('déplace sans modifier la liste d\'origine', () => {
    const l = ['a', 'b', 'c', 'd']
    expect(moveItem(l, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(l, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(l).toEqual(['a', 'b', 'c', 'd'])
    expect(moveItem(l, 1, 9)).toBe(l)
  })
  it('les rotations restent entre 0 et 270', () => {
    expect(turn(0, 90)).toBe(90)
    expect(turn(270, 90)).toBe(0)
    expect(turn(0, -90)).toBe(270)
    expect(turn(90, 180)).toBe(270)
  })
})

describe('buildPdf', () => {
  it('fusionne deux PDF dans l\'ordre demandé, un même PDF pouvant revenir', async () => {
    const a = await pdfOf([100, 200, 300])
    const b = await pdfOf([400, 500])
    const pages: PageRef[] = [
      { src: 'b', index: 1, rotate: 0 },
      { src: 'a', index: 0, rotate: 0 },
      { src: 'a', index: 2, rotate: 0 },
      { src: 'b', index: 0, rotate: 0 },
      { src: 'a', index: 0, rotate: 0 }
    ]
    expect(await widthsOf(await buildPdf({ a, b }, pages))).toEqual([500, 100, 300, 400, 100])
  })
  it('extrait des pages', async () => {
    const a = await pdfOf([100, 200, 300, 400])
    const keep = parsePageRanges('2-3', 4)!.map((index): PageRef => ({ src: 'a', index, rotate: 0 }))
    expect(await widthsOf(await buildPdf({ a }, keep))).toEqual([200, 300])
  })
  it('pivote par quarts de tour, en s\'ajoutant à la rotation d\'origine', async () => {
    const src = await PDFDocument.create()
    src.addPage([100, 50]).setRotation({ type: 'degrees' as never, angle: 90 } as never)
    const a = await src.save()
    const out = await PDFDocument.load(await buildPdf({ a }, [{ src: 'a', index: 0, rotate: 90 }, { src: 'a', index: 0, rotate: 0 }, { src: 'a', index: 0, rotate: 270 }]))
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([180, 90, 0])
  })
  it('écrit « Trame » comme producteur', async () => {
    const a = await pdfOf([100])
    const out = await PDFDocument.load(await buildPdf({ a }, [{ src: 'a', index: 0, rotate: 0 }]), { updateMetadata: false })
    expect(out.getProducer()).toBe('Trame')
  })
  it('refuse une page ou un PDF inconnus', async () => {
    const a = await pdfOf([100])
    await expect(buildPdf({ a }, [{ src: 'a', index: 5, rotate: 0 }])).rejects.toThrow('unreadable')
    await expect(buildPdf({ a }, [{ src: 'zz', index: 0, rotate: 0 }])).rejects.toThrow('unreadable')
  })
})

describe('countPages', () => {
  it('compte les pages et signale un fichier illisible', async () => {
    expect(await countPages(await pdfOf([1, 2, 3]))).toBe(3)
    await expect(countPages(new TextEncoder().encode('pas un pdf'))).rejects.toThrow('unreadable')
  })
})
