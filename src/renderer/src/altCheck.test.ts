import { describe, expect, it } from 'vitest'
import { imagesMissingAlt, missingAltByPage, needsAlt, sanitizeDecorative } from '@/altCheck'
import type { TramePage, TrameElement } from '@/types'

const img = (id: string, over: Partial<TrameElement> = {}): TrameElement =>
  ({ id, type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', src: 'data:image/png;base64,AA', ...over }) as TrameElement
const page = (id: string, elements: TrameElement[]): TramePage => ({ id, background: '#fff', elements }) as TramePage

describe('needsAlt', () => {
  it('image visible sans description', () => expect(needsAlt(img('a'))).toBe(true))
  it('décrite, décorative, masquée, vide ou autre type : non', () => {
    expect(needsAlt(img('a', { alt: 'Un chat' }))).toBe(false)
    expect(needsAlt(img('a', { decorative: true }))).toBe(false)
    expect(needsAlt(img('a', { hidden: true }))).toBe(false)
    expect(needsAlt(img('a', { src: undefined }))).toBe(false)
    expect(needsAlt(img('a', { type: 'rect' }))).toBe(false)
  })
  it('une description faite d\'espaces ne compte pas', () => expect(needsAlt(img('a', { alt: '   ' }))).toBe(true))
})

describe('imagesMissingAlt', () => {
  const doc = { pages: [page('p1', [img('a'), img('b', { alt: 'x' })]), page('p2', [img('c'), img('d', { decorative: true }), img('e')])] }
  it('liste dans l\'ordre du document', () => {
    expect(imagesMissingAlt(doc).map((m) => [m.pageIndex, m.elementId])).toEqual([[0, 'a'], [1, 'c'], [1, 'e']])
  })
  it('compte par page', () => {
    expect([...missingAltByPage(doc)]).toEqual([['p1', 1], ['p2', 2]])
  })
})

describe('sanitizeDecorative', () => {
  it('garde true sur une image sans description', () => {
    const e = { type: 'image', decorative: true } as { type: string; decorative?: unknown; alt?: unknown }
    sanitizeDecorative(e)
    expect(e.decorative).toBe(true)
  })
  it('retire les valeurs invalides, hors image ou avec description', () => {
    for (const e of [{ type: 'image', decorative: 'yes' }, { type: 'rect', decorative: true }, { type: 'image', decorative: true, alt: 'x' }] as Array<{ type: string; decorative?: unknown; alt?: unknown }>) {
      sanitizeDecorative(e)
      expect(e.decorative).toBeUndefined()
    }
  })
})
