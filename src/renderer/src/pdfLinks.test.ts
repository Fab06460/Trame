import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib'
import { addPdfLinks } from './pdfLinks'
import { PT_PER_PX } from './pdfMath'
import type { TrameDocument, TrameElement } from './types'

const el = (id: string, extra: Partial<TrameElement>): TrameElement => ({ id, type: 'rect', x: 10, y: 20, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#000', ...extra }) as TrameElement

async function build(elements: TrameElement[], margin = 0): Promise<{ pdf: PDFDocument; count: number; doc: TrameDocument }> {
  const doc = { id: 'd', name: 'n', width: 800, height: 600, pages: [{ id: 'a', background: '#fff', elements }, { id: 'b', background: '#fff', elements: [] }] } as unknown as TrameDocument
  const pdf = await PDFDocument.create()
  pdf.addPage([800 * PT_PER_PX + 2 * margin, 600 * PT_PER_PX + 2 * margin])
  pdf.addPage([800 * PT_PER_PX + 2 * margin, 600 * PT_PER_PX + 2 * margin])
  return { pdf, count: addPdfLinks(pdf, doc, margin), doc }
}

const annots = (pdf: PDFDocument, i: number): PDFDict[] => {
  const arr = pdf.getPage(i).node.lookup(PDFName.of('Annots'))
  return arr instanceof PDFArray ? arr.asArray().map((r) => pdf.context.lookup(r, PDFDict)) : []
}

describe('addPdfLinks', () => {
  it('pose une annotation Link avec l\'adresse sur le rectangle de l\'élément', async () => {
    const { pdf, count } = await build([el('1', { link: { url: 'https://exemple.fr/' } })])
    expect(count).toBe(1)
    const [a] = annots(pdf, 0)
    expect(a.get(PDFName.of('Subtype'))).toBe(PDFName.of('Link'))
    const action = a.lookup(PDFName.of('A'), PDFDict)
    expect(action.get(PDFName.of('S'))).toBe(PDFName.of('URI'))
    expect((action.lookup(PDFName.of('URI')) as PDFString).decodeText()).toBe('https://exemple.fr/')
    const rect = (a.lookup(PDFName.of('Rect'), PDFArray).asArray() as PDFNumber[]).map((n) => n.asNumber())
    expect(rect[0]).toBeCloseTo(10 * PT_PER_PX, 4)
    expect(rect[2]).toBeCloseTo(110 * PT_PER_PX, 4)
    expect(rect[3]).toBeCloseTo((600 - 20) * PT_PER_PX, 4)
    expect(rect[1]).toBeCloseTo((600 - 70) * PT_PER_PX, 4)
  })
  it('décale le rectangle de la marge (fond perdu)', async () => {
    const { pdf } = await build([el('1', { link: { url: 'https://exemple.fr/' } })], 10)
    const rect = (annots(pdf, 0)[0].lookup(PDFName.of('Rect'), PDFArray).asArray() as PDFNumber[]).map((n) => n.asNumber())
    expect(rect[0]).toBeCloseTo(10 + 10 * PT_PER_PX, 4)
  })
  it('vise une autre page par un saut', async () => {
    const { pdf } = await build([el('1', { link: { page: 'b' } })])
    const action = annots(pdf, 0)[0].lookup(PDFName.of('A'), PDFDict)
    expect(action.get(PDFName.of('S'))).toBe(PDFName.of('GoTo'))
    const dest = action.lookup(PDFName.of('D'), PDFArray)
    expect(dest.get(0)).toBe(pdf.getPage(1).ref)
  })
  it('ignore les éléments masqués, les clips, les liens cassés et les pages sans lien', async () => {
    const { pdf, count } = await build([
      el('1', { link: { url: 'https://exemple.fr/' }, hidden: true }),
      el('2', { link: { url: 'https://exemple.fr/' }, video: { id: 'c', duration: 2 } }),
      el('3', { link: { page: 'disparue' } }),
      el('4', {})
    ])
    expect(count).toBe(0)
    expect(annots(pdf, 0)).toHaveLength(0)
  })
  it('le PDF enregistré se relit avec ses liens', async () => {
    const { pdf } = await build([el('1', { link: { url: 'https://exemple.fr/' } })])
    const again = await PDFDocument.load(await pdf.save())
    expect(annots(again, 0)).toHaveLength(1)
  })
})
