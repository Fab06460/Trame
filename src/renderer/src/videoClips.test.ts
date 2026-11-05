import { describe, expect, it } from 'vitest'
import { clipAutoplay, clipElements, clipLoops, clipVolume, MAX_CLIP_CHARS, MAX_CLIP_SECONDS, pruneClips, sanitizeClips, withoutClips } from './videoClips'
import type { TrameDocument, TrameElement } from './types'

const MP4 = 'data:video/mp4;base64,AAAA'
const el = (id: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', ...extra })
const doc = (elements: TrameElement[], clips?: Record<string, string>): TrameDocument =>
  ({ id: 'd', name: 'n', width: 100, height: 100, pages: [{ id: 'p', background: '#fff', elements }], ...(clips ? { clips } : {}) }) as unknown as TrameDocument
const raw = (elements: Array<Record<string, unknown>>, clips?: unknown): { clips?: unknown; pages: Array<{ elements: Array<Record<string, unknown>> }> } => ({ ...(clips !== undefined ? { clips } : {}), pages: [{ elements }] })

describe('réglages de lecture', () => {
  it('valeurs par défaut : lecture automatique, une fois, volume plein', () => {
    const v = { id: 'a', duration: 3 }
    expect(clipAutoplay(v)).toBe(true)
    expect(clipLoops(v)).toBe(false)
    expect(clipVolume(v)).toBe(1)
  })
  it('manuel, boucle, volume ramené entre 0 et 1', () => {
    expect(clipAutoplay({ id: 'a', duration: 3, manual: true })).toBe(false)
    expect(clipLoops({ id: 'a', duration: 3, loop: true })).toBe(true)
    expect(clipVolume({ id: 'a', duration: 3, volume: 0.3 })).toBe(0.3)
    expect(clipVolume({ id: 'a', duration: 3, volume: 9 })).toBe(1)
    expect(clipVolume({ id: 'a', duration: 3, volume: -2 })).toBe(0)
  })
})

describe('pruneClips', () => {
  it('retire les clips que plus aucun élément ne référence', () => {
    const d = doc([el('a', { video: { id: 'u', duration: 2 } })], { u: MP4, orphan: MP4 })
    expect(Object.keys(pruneClips(d).clips ?? {})).toEqual(['u'])
  })
  it('plus aucun clip utilisé : le champ disparaît', () => {
    expect('clips' in pruneClips(doc([el('a')], { orphan: MP4 }))).toBe(false)
  })
  it('sans clips : le document tel quel', () => {
    const d = doc([el('a')])
    expect(pruneClips(d)).toBe(d)
  })
  it('withoutClips retire tout, sans toucher aux éléments', () => {
    const d = doc([el('a', { video: { id: 'u', duration: 2 } })], { u: MP4 })
    const r = withoutClips(d)
    expect('clips' in r).toBe(false)
    expect(r.pages[0].elements[0].video?.id).toBe('u')
  })
  it('clipElements : les images à clip visibles', () => {
    const els = [el('a', { video: { id: 'u', duration: 2 } }), el('b'), el('c', { video: { id: 'u', duration: 2 }, hidden: true }), el('d', { type: 'rect' })]
    expect(clipElements(els).map((e) => e.id)).toEqual(['a'])
  })
})

describe('sanitizeClips', () => {
  it('garde un clip valide et sa référence', () => {
    const d = raw([{ id: 'a', type: 'image', video: { id: 'u', duration: 2.5, loop: true, muted: true, manual: true, volume: 0.4 } }], { u: MP4 })
    sanitizeClips(d)
    expect(d.clips).toEqual({ u: MP4 })
    expect(d.pages[0].elements[0].video).toEqual({ id: 'u', duration: 2.5, loop: true, muted: true, manual: true, volume: 0.4 })
  })
  it('réglages inutiles retirés (faux, volume plein, valeurs étrangères)', () => {
    const d = raw([{ id: 'a', type: 'image', video: { id: 'u', duration: 2, loop: false, muted: 'oui', manual: 1, volume: 1, extra: 1 } }], { u: MP4 })
    sanitizeClips(d)
    expect(d.pages[0].elements[0].video).toEqual({ id: 'u', duration: 2 })
  })
  it('clip absent ou invalide : l\'élément redevient une simple image', () => {
    const els = [
      { id: 'a', type: 'image', video: { id: 'missing', duration: 2 } },
      { id: 'b', type: 'image', video: { id: 'u', duration: 0 } },
      { id: 'c', type: 'image', video: { id: 'u', duration: MAX_CLIP_SECONDS + 1 } },
      { id: 'd', type: 'image', video: { id: 'u', duration: NaN } },
      { id: 'e', type: 'image', video: 'oui' },
      { id: 'f', type: 'rect', video: { id: 'u', duration: 2 } },
      { id: 'g', type: 'image', video: { id: 7, duration: 2 } }
    ]
    const d = raw(els, { u: MP4 })
    sanitizeClips(d)
    for (const e of d.pages[0].elements) expect('video' in e).toBe(false)
  })
  it('clips invalides écartés : mauvais type de média, trop gros, pas du texte, identifiant vide', () => {
    const d = raw([], { ok: MP4, svg: 'data:image/svg+xml;base64,AAAA', exe: 'data:application/x-msdownload;base64,AAAA', big: `data:video/mp4;base64,${'A'.repeat(MAX_CLIP_CHARS)}`, num: 5, '': MP4 })
    sanitizeClips(d)
    expect(Object.keys(d.clips as object)).toEqual(['ok'])
  })
  it('format absent ou autre chose qu\'un objet : champ retiré', () => {
    for (const bad of [null, 'x', [], 12]) {
      const d = raw([], bad)
      sanitizeClips(d)
      expect('clips' in d).toBe(false)
    }
  })
  it('plafonne le total des clips', () => {
    const big = `data:video/mp4;base64,${'A'.repeat(60_000_000)}`
    const d = raw([], { a: big, b: big, c: big, d: big, e: big })
    sanitizeClips(d)
    expect(Object.keys(d.clips as object).length).toBeLessThan(5)
  })
})
