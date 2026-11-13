import { describe, expect, it } from 'vitest'
import { splitClipAt, clipAutoplay, clipElements, clipLength, clipLoops, clipRange, clipSourceTime, clipSpeed, clipVolume, MAX_CLIP_CHARS, MAX_CLIP_SECONDS, pruneClips, sanitizeClips, withClipSettings, withoutClips } from './videoClips'
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

describe('montage : début, fin, vitesse', () => {
  const v = { id: 'u', duration: 10 }
  it('sans montage : tout le clip, vitesse 1', () => {
    expect(clipRange(v)).toEqual({ start: 0, end: 10 })
    expect(clipSpeed(v)).toBe(1)
    expect(clipLength(v)).toBe(10)
  })
  it('un morceau monté et sa durée de lecture selon la vitesse', () => {
    const m = { ...v, start: 2, end: 6, speed: 2 }
    expect(clipRange(m)).toEqual({ start: 2, end: 6 })
    expect(clipLength(m)).toBe(2)
    expect(clipLength({ ...m, speed: 0.5 })).toBe(8)
  })
  it('valeurs incohérentes ignorées à la lecture du montage', () => {
    expect(clipRange({ ...v, start: -3, end: 99 })).toEqual({ start: 0, end: 10 })
    expect(clipRange({ ...v, start: 5, end: 4 })).toEqual({ start: 5, end: 10 })
    expect(clipRange({ ...v, start: NaN, end: NaN })).toEqual({ start: 0, end: 10 })
    expect(clipSpeed({ speed: 100 })).toBe(4)
    expect(clipSpeed({ speed: 0 })).toBe(0.25)
  })
  it('clipSourceTime : part du début, avance à la vitesse, s\'arrête avant la fin', () => {
    const m = { ...v, start: 2, end: 6, speed: 2 }
    expect(clipSourceTime(m, 0)).toBe(2)
    expect(clipSourceTime(m, 1)).toBe(4)
    expect(clipSourceTime(m, 50)).toBeCloseTo(5.95, 5)
  })
  it('clipSourceTime : en boucle, le morceau recommence', () => {
    const m = { ...v, start: 2, end: 6, speed: 2, loop: true as const }
    expect(clipSourceTime(m, 2)).toBe(2)
    expect(clipSourceTime(m, 2.5)).toBe(3)
  })
  it('withClipSettings : ne garde que ce qui s\'écarte des valeurs par défaut', () => {
    expect(withClipSettings(v, {})).toEqual(v)
    expect(withClipSettings(v, { start: 1.234, end: 7, speed: 1.5 })).toEqual({ ...v, start: 1.23, end: 7, speed: 1.5 })
    expect(withClipSettings({ ...v, start: 1, end: 7, speed: 2 }, { start: 0, end: 10, speed: 1 })).toEqual(v)
  })
  it('withClipSettings : le début reste avant la fin, la fin après le début, tout dans le clip', () => {
    const a = withClipSettings({ ...v, end: 4 }, { start: 9 })
    expect(a.start).toBeCloseTo(3.8, 5)
    const b = withClipSettings({ ...v, start: 6 }, { end: 1 })
    expect(b.end).toBeCloseTo(6.2, 5)
    expect(withClipSettings(v, { end: 50 }).end).toBeUndefined()
    expect(withClipSettings(v, { speed: 99 }).speed).toBe(4)
  })
  it('withClipSettings garde les autres réglages', () => {
    expect(withClipSettings({ ...v, loop: true, muted: true, manual: true, volume: 0.3 }, { start: 1 })).toEqual({ ...v, loop: true, muted: true, manual: true, volume: 0.3, start: 1 })
  })
  it('lecture d\'un fichier : montage valide gardé, incohérent retiré', () => {
    const d = raw(
      [
        { id: 'a', type: 'image', video: { id: 'u', duration: 10, start: 2, end: 6, speed: 2 } },
        { id: 'b', type: 'image', video: { id: 'u', duration: 10, start: 20, end: 3, speed: 9 } },
        { id: 'c', type: 'image', video: { id: 'u', duration: 10, start: 5, end: 5, speed: 1 } },
        { id: 'd', type: 'image', video: { id: 'u', duration: 10, start: 'x', end: null, speed: '2' } }
      ],
      { u: MP4 }
    )
    sanitizeClips(d)
    const [a, b, c, e] = d.pages[0].elements.map((x) => x.video)
    expect(a).toEqual({ id: 'u', duration: 10, start: 2, end: 6, speed: 2 })
    expect(b).toEqual({ id: 'u', duration: 10, end: 3 }) // début hors du clip ignoré, fin valide gardée
    expect(c).toEqual({ id: 'u', duration: 10, start: 5 })
    expect(e).toEqual({ id: 'u', duration: 10 })
  })
})

describe('splitClipAt', () => {
  const base = { id: 'c', duration: 10 }
  it('coupe en deux morceaux qui se suivent et gardent vitesse, son et boucle', () => {
    const parts = splitClipAt({ ...base, speed: 2, muted: true, loop: true, volume: 0.5 }, 4)!
    expect(parts[0]).toEqual({ id: 'c', duration: 10, speed: 2, muted: true, loop: true, volume: 0.5, end: 4 })
    expect(parts[1]).toEqual({ id: 'c', duration: 10, speed: 2, muted: true, loop: true, volume: 0.5, start: 4 })
  })
  it('respecte un montage déjà fait', () => {
    const parts = splitClipAt({ ...base, start: 2, end: 8 }, 5)!
    expect(parts[0]).toEqual({ id: 'c', duration: 10, start: 2, end: 5 })
    expect(parts[1]).toEqual({ id: 'c', duration: 10, start: 5, end: 8 })
  })
  it('refuse une coupe trop près des bords ou hors du morceau gardé', () => {
    expect(splitClipAt(base, 0.1)).toBeNull()
    expect(splitClipAt(base, 9.9)).toBeNull()
    expect(splitClipAt({ ...base, start: 2, end: 8 }, 1)).toBeNull()
    expect(splitClipAt({ ...base, start: 2, end: 8 }, Number.NaN)).toBeNull()
  })
})
