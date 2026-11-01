import { describe, expect, it } from 'vitest'
import type { TrameDocument, TrameElement, TramePage } from '@/types'
import { applyChanges, diffDocuments, elementAspects } from './compare'

const el = (id: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#ff0000', ...extra })
const page = (id: string, elements: TrameElement[] = [], extra: Partial<TramePage> = {}): TramePage => ({ id, background: '#ffffff', elements, ...extra })
const doc = (pages: TramePage[], extra: Partial<TrameDocument> = {}): TrameDocument => ({ version: 2, name: 'D', width: 1000, height: 500, pages, ...extra })
const ids = (d: TrameDocument, pageId: string): string[] => d.pages.find((p) => p.id === pageId)!.elements.map((e) => e.id)

describe('elementAspects', () => {
  it('range les différences par famille', () => {
    const a = el('a', { type: 'text', text: 'un' })
    expect(elementAspects(a, a)).toEqual([])
    expect(elementAspects(a, { ...a, text: 'deux' })).toEqual(['text'])
    expect(elementAspects(a, { ...a, x: 50, width: 120 }).sort()).toEqual(['position', 'size'])
    expect(elementAspects(a, { ...a, fill: '#00ff00', fontSize: 40 }).sort()).toEqual(['color', 'style'])
  })

  it('ignore un écart de moins d\'un centième de pixel et l\'ordre des clés', () => {
    const a = el('a', { shadow: { color: '#000', blur: 1, offsetX: 0, offsetY: 0, opacity: 1 } })
    expect(elementAspects(a, { ...a, x: 0.004 })).toEqual([])
    expect(elementAspects(a, { ...a, shadow: { opacity: 1, offsetY: 0, offsetX: 0, blur: 1, color: '#000' } })).toEqual([])
  })
})

describe('diffDocuments', () => {
  const mine = doc([page('p1', [el('a'), el('b')]), page('p2', [el('c')])])

  it('deux documents identiques n\'ont aucune différence', () => {
    expect(diffDocuments(mine, mine)).toMatchObject({ changes: [], commonPages: 2, sizeDiffers: false })
  })

  it('repère éléments ajoutés, retirés, modifiés, et les pages ajoutées ou retirées', () => {
    const other = doc([page('p1', [el('a', { x: 20 }), el('n', { type: 'text', text: 'Nouveau' })], { background: '#000000' }), page('p3', [el('z')])])
    const kinds = diffDocuments(mine, other).changes.map((c) => `${c.kind}:${c.elementId ?? c.pageId}`).sort()
    expect(kinds).toEqual(['element-added:n', 'element-changed:a', 'element-removed:b', 'page-added:p3', 'page-background:p1', 'page-removed:p2'])
  })

  it('compare les notes (absentes = vides) et signale un format différent ou des fichiers sans page commune', () => {
    const d = diffDocuments(mine, doc([page('p1', [el('a'), el('b')], { notes: 'à dire' }), page('p2', [el('c')])], { width: 800 }))
    expect(d.changes.map((c) => c.kind)).toEqual(['page-notes'])
    expect(d.sizeDiffers).toBe(true)
    expect(diffDocuments(mine, doc([page('x1'), page('x2')])).commonPages).toBe(0)
  })
})

describe('applyChanges', () => {
  const mine = doc([page('p1', [el('a'), el('b'), el('c')]), page('p2', [el('d')])])
  const all = (m: TrameDocument, o: TrameDocument): Set<string> => new Set(diffDocuments(m, o).changes.map((c) => c.id))

  it('sans sélection, rend le même document', () => {
    expect(applyChanges(mine, doc([page('p1')]), new Set())).toBe(mine)
  })

  it('applique seulement ce qui est coché', () => {
    const other = doc([page('p1', [el('a', { x: 99 }), el('b', { x: 77 }), el('c')]), page('p2', [el('d')])])
    const r = applyChanges(mine, other, new Set(['ec:a']))
    expect(r.pages[0].elements.find((e) => e.id === 'a')!.x).toBe(99)
    expect(r.pages[0].elements.find((e) => e.id === 'b')!.x).toBe(0)
  })

  it('ajoute un élément à sa place dans l\'ordre des calques, retire un élément', () => {
    const other = doc([page('p1', [el('a'), el('n'), el('b')]), page('p2', [])])
    const r = applyChanges(mine, other, all(mine, other))
    expect(ids(r, 'p1')).toEqual(['a', 'n', 'b'])
    expect(ids(r, 'p2')).toEqual([])
  })

  it('ajoute une page à la bonne place et retire une page, sans jamais retirer la dernière', () => {
    const other = doc([page('p1', [el('a'), el('b'), el('c')]), page('pn', [el('z')]), page('p2', [el('d')])])
    expect(applyChanges(mine, other, new Set(['pa:pn'])).pages.map((p) => p.id)).toEqual(['p1', 'pn', 'p2'])
    const solo = doc([page('p1', [el('a')])])
    expect(applyChanges(solo, doc([page('zz')]), new Set(['pr:p1'])).pages.map((p) => p.id)).toEqual(['p1'])
    expect(applyChanges(mine, doc([page('p1', [el('a'), el('b'), el('c')])]), new Set(['pr:p2'])).pages.map((p) => p.id)).toEqual(['p1'])
  })

  it('reprend fond et notes de la page, et retire les notes quand l\'autre n\'en a plus', () => {
    const withNotes = doc([page('p1', [], { notes: 'x' })])
    const other = doc([page('p1', [], { background: '#123456' })])
    const r = applyChanges(withNotes, other, all(withNotes, other))
    expect(r.pages[0].background).toBe('#123456')
    expect('notes' in r.pages[0]).toBe(false)
  })

  it('un changement qui ne s\'applique plus est ignoré', () => {
    const other = doc([page('p1', [el('a', { x: 5 })])])
    const diff = diffDocuments(mine, other)
    const gone = doc([page('p2', [el('d')])])
    expect(applyChanges(gone, other, new Set(diff.changes.map((c) => c.id)), diff).pages.map((p) => p.id)).toEqual(['p2'])
  })

  it('reprend les polices incorporées manquantes, sans toucher à celles qu\'on a', () => {
    const font = (n: string) => ({ name: n, family: `"${n}"`, category: 'sans', license: 'OFL', variants: {} })
    const m = doc([page('p1', [el('a')])], { fonts: { x: font('X') } })
    const o = doc([page('p1', [el('a'), el('n')])], { fonts: { x: font('Autre'), y: font('Y') } })
    const r = applyChanges(m, o, new Set(['ea:n']))
    expect(Object.keys(r.fonts!).sort()).toEqual(['x', 'y'])
    expect(r.fonts!.x.name).toBe('X')
  })

  it('ne modifie pas les documents d\'origine', () => {
    const other = doc([page('p1', [el('a', { x: 5 })])])
    const before = JSON.stringify(mine)
    applyChanges(mine, other, all(mine, other))
    expect(JSON.stringify(mine)).toBe(before)
  })
})
