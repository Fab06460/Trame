import { describe, expect, it } from 'vitest'
import { pruneSources, sanitizeSources } from '@/pdfSources'
import type { TrameDocument } from '@/types'

const doc = (sources: Record<string, string> | undefined, refs: string[]): TrameDocument => ({
  version: 2, name: 'x', width: 10, height: 10, sources,
  pages: [{ id: 'p', background: '#fff', elements: refs.map((id, i) => ({ id: `e${i}`, type: 'image', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, fill: '#000', pdfSource: { id, page: 1 } })) }]
})

describe('pdfSources', () => {
  it('retire les sources non référencées', () => {
    const d = pruneSources(doc({ a: 'AAAA', b: 'BBBB' }, ['a']))
    expect(Object.keys(d.sources ?? {})).toEqual(['a'])
  })
  it('plus aucune référence : la clé disparaît du fichier', () => expect('sources' in pruneSources(doc({ a: 'AAAA' }, []))).toBe(false))
  it('document sans sources : inchangé', () => {
    const d = doc(undefined, [])
    expect(pruneSources(d)).toBe(d)
  })
  it('nettoie à la lecture', () => {
    const raw = {
      sources: { ok: 'AAAA', vide: '', nombre: 4 },
      pages: [{ elements: [
        { type: 'image', pdfSource: { id: 'ok', page: 2 } },
        { type: 'image', pdfSource: { id: 'ok', page: 0 } },
        { type: 'image', pdfSource: 'x' },
        { type: 'rect', pdfSource: { id: 'ok', page: 1 } }
      ] }]
    }
    sanitizeSources(raw as never)
    expect(raw.sources).toEqual({ ok: 'AAAA' })
    expect(raw.pages[0].elements.map((e) => e.pdfSource)).toEqual([{ id: 'ok', page: 2 }, undefined, undefined, undefined])
  })
  it('sources absentes ou invalides : clé retirée', () => {
    const raw = { sources: 'oops', pages: [] }
    sanitizeSources(raw as never)
    expect('sources' in raw).toBe(false)
  })
})
