import { describe, expect, it } from 'vitest'
import { withoutVoices, MAX_VOICE_CHARS, MAX_VOICE_SECONDS, pageVoice, pruneVoices, sanitizeVoices, VOICE_DELAY, VOICE_TAIL, voiceNeed } from './voiceOver'
import type { TrameDocument, TramePage } from './types'

const WEBM = 'data:audio/webm;base64,AAAA'
const page = (id: string, voice?: { id: string; duration: number }): TramePage => ({ id, background: '#fff', elements: [], ...(voice ? { voice } : {}) })
const doc = (pages: TramePage[], voices?: Record<string, string>): TrameDocument => ({ id: 'd', name: 'n', width: 100, height: 100, pages, ...(voices ? { voices } : {}) }) as unknown as TrameDocument
const raw = (pages: Array<Record<string, unknown>>, voices?: unknown): { voices?: unknown; pages: Array<Record<string, unknown>> } => ({ ...(voices !== undefined ? { voices } : {}), pages })

describe('pageVoice et voiceNeed', () => {
  it('rend la voix de la page avec ses octets, ou null', () => {
    const d = doc([page('a', { id: 'v', duration: 4 }), page('b')], { v: WEBM })
    expect(pageVoice(d, d.pages[0])).toEqual({ id: 'v', duration: 4, data: WEBM })
    expect(pageVoice(d, d.pages[1])).toBeNull()
    expect(pageVoice(doc([page('a', { id: 'x', duration: 4 })]), page('a', { id: 'x', duration: 4 }))).toBeNull()
  })
  it('la page doit durer le silence avant + la voix + le silence après', () => {
    expect(voiceNeed(4)).toBeCloseTo(VOICE_DELAY + 4 + VOICE_TAIL, 10)
  })
})

describe('pruneVoices', () => {
  it('retire les voix que plus aucune page ne référence', () => {
    const d = pruneVoices(doc([page('a', { id: 'v', duration: 2 })], { v: WEBM, orphan: WEBM }))
    expect(Object.keys(d.voices!)).toEqual(['v'])
  })
  it('sans aucune voix utilisée, le champ disparaît', () => {
    expect(pruneVoices(doc([page('a')], { orphan: WEBM }))).not.toHaveProperty('voices')
  })
  it('un document sans voix est rendu tel quel', () => {
    const d = doc([page('a')])
    expect(pruneVoices(d)).toBe(d)
  })
})

describe('sanitizeVoices (lecture d\'un fichier)', () => {
  it('garde une voix valide et sa référence', () => {
    const d = raw([{ id: 'a', voice: { id: 'v', duration: 3.456 } }], { v: WEBM })
    sanitizeVoices(d)
    expect(d.voices).toEqual({ v: WEBM })
    expect(d.pages[0].voice).toEqual({ id: 'v', duration: 3.46 })
  })
  it('référence vers une voix absente, durée invalide ou page sans objet : champ retiré', () => {
    for (const voice of [{ id: 'absent', duration: 2 }, { id: 'v', duration: 0 }, { id: 'v', duration: -2 }, { id: 'v', duration: MAX_VOICE_SECONDS + 1 }, { id: 'v', duration: NaN }, { id: 'v' }, { id: 5, duration: 2 }, 'oui', null]) {
      const d = raw([{ id: 'a', voice }], { v: WEBM })
      sanitizeVoices(d)
      expect(d.pages[0]).not.toHaveProperty('voice')
    }
  })
  it('voix invalides écartées : type de média, taille, identifiant vide, pas du texte', () => {
    const d = raw([], { ok: WEBM, ogg: 'data:audio/ogg;base64,AAAA', svg: 'data:image/svg+xml;base64,AAAA', video: 'data:video/mp4;base64,AAAA', params: 'data:audio/webm;codecs=opus;base64,AAAA', big: `data:audio/webm;base64,${'A'.repeat(MAX_VOICE_CHARS)}`, num: 5, '': WEBM })
    sanitizeVoices(d)
    expect(Object.keys(d.voices as object).sort()).toEqual(['ogg', 'ok'])
  })
  it('format absent ou autre chose qu\'un objet : champ retiré', () => {
    for (const bad of [null, 'x', [], 12]) {
      const d = raw([], bad)
      sanitizeVoices(d)
      expect('voices' in d).toBe(false)
    }
  })
  it('plafonne le total des voix', () => {
    const big = `data:audio/webm;base64,${'A'.repeat(11_000_000)}`
    const d = raw([], { a: big, b: big, c: big, d: big, e: big, f: big, g: big })
    sanitizeVoices(d)
    expect(Object.keys(d.voices as object).length).toBeLessThan(7)
  })
})

describe('withoutVoices', () => {
  it('retire les enregistrements, pas les références des pages', () => {
    const d = withoutVoices(doc([page('a', { id: 'v', duration: 2 })], { v: WEBM }))
    expect(d).not.toHaveProperty('voices')
    expect(d.pages[0].voice).toEqual({ id: 'v', duration: 2 })
  })
  it('un document sans voix est rendu tel quel', () => {
    const d = doc([page('a')])
    expect(withoutVoices(d)).toBe(d)
  })
})
