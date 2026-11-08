import { describe, expect, it } from 'vitest'
import { canLink, linkTarget, pageLinks, sanitizeLink, withoutLinksToPage } from './links'
import type { TrameDocument, TrameElement, TramePage } from './types'

const el = (id: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 10, y: 20, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#000', ...extra }) as TrameElement
const page = (id: string, elements: TrameElement[] = []): TramePage => ({ id, background: '#fff', elements })
const doc = (pages: TramePage[]): TrameDocument => ({ id: 'd', name: 'n', width: 800, height: 600, pages }) as unknown as TrameDocument

describe('linkTarget', () => {
  const d = doc([page('a'), page('b')])
  it('rend l\'adresse ou le rang de la page', () => {
    expect(linkTarget(d, { link: { url: 'https://exemple.fr/' } })).toEqual({ kind: 'url', url: 'https://exemple.fr/' })
    expect(linkTarget(d, { link: { page: 'b' } })).toEqual({ kind: 'page', index: 1 })
  })
  it('ignore un lien sans cible utilisable', () => {
    expect(linkTarget(d, {})).toBeNull()
    expect(linkTarget(d, { link: { page: 'disparue' } })).toBeNull()
    expect(linkTarget(d, { link: { url: 'javascript:alert(1)' } })).toBeNull()
  })
})

describe('pageLinks', () => {
  it('liste les éléments liés et visibles, pas les clips ni les masqués', () => {
    const p = page('a', [
      el('1', { link: { url: 'https://exemple.fr/' } }),
      el('2', { link: { url: 'https://exemple.fr/' }, hidden: true }),
      el('3', { link: { url: 'https://exemple.fr/' }, video: { id: 'c', duration: 3 } }),
      el('4')
    ])
    const out = pageLinks(doc([p]), p)
    expect(out.map((l) => l.el.id)).toEqual(['1'])
    expect(out[0].box).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })
  it('un élément tourné a sa boîte englobante', () => {
    const p = page('a', [el('1', { link: { url: 'https://exemple.fr/' }, rotation: 90 })])
    const box = pageLinks(doc([p]), p)[0].box
    expect(box.width).toBeCloseTo(50, 5)
    expect(box.height).toBeCloseTo(100, 5)
  })
  it('canLink refuse un clip', () => {
    expect(canLink(el('1'))).toBe(true)
    expect(canLink(el('1', { video: { id: 'c', duration: 1 } }))).toBe(false)
  })
})

describe('sanitizeLink', () => {
  const ids = new Set(['a', 'b'])
  const run = (link: unknown, extra: object = {}): unknown => {
    const e: Record<string, unknown> = { ...extra, link }
    sanitizeLink(e, ids)
    return e.link
  }
  it('garde une adresse normalisée et une page connue, sans champ en trop', () => {
    expect(run({ url: 'https://exemple.fr/', extra: 1 })).toEqual({ url: 'https://exemple.fr/' })
    expect(run({ page: 'b', url: 5 })).toEqual({ page: 'b' })
  })
  it('retire ce qui est invalide', () => {
    expect(run({ url: 'javascript:alert(1)' })).toBeUndefined()
    expect(run({ url: 'exemple.fr' })).toBeUndefined()
    expect(run({ page: 'inconnue' })).toBeUndefined()
    expect(run('https://exemple.fr/')).toBeUndefined()
    expect(run(null)).toBeUndefined()
    expect(run([])).toBeUndefined()
    expect(run({})).toBeUndefined()
  })
  it('retire le lien d\'un clip', () => {
    expect(run({ url: 'https://exemple.fr/' }, { video: { id: 'c', duration: 1 } })).toBeUndefined()
  })
})

describe('withoutLinksToPage', () => {
  it('retire seulement les liens vers la page supprimée', () => {
    const pages = [page('a', [el('1', { link: { page: 'b' } }), el('2', { link: { page: 'a' } }), el('3', { link: { url: 'https://exemple.fr/' } })]), page('c')]
    const out = withoutLinksToPage(pages, 'b')
    expect(out[0].elements[0].link).toBeUndefined()
    expect(out[0].elements[1].link).toEqual({ page: 'a' })
    expect(out[0].elements[2].link).toEqual({ url: 'https://exemple.fr/' })
  })
  it('rend les mêmes pages quand rien ne change', () => {
    const pages = [page('a', [el('1')])]
    expect(withoutLinksToPage(pages, 'x')).toBe(pages)
  })
})
