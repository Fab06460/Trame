import { describe, expect, it } from 'vitest'
import { Reader, clampRate, pickVoice, readingItems, splitSpeech, voiceOptions, type ReadItem, type SynthLike, type UtteranceLike, type VoiceInfo } from './speech'
import type { TrameElement } from './types'

const text = (id: string, t: string, x: number, y: number, over: Partial<TrameElement> = {}): TrameElement =>
  ({ id, type: 'text', x, y, width: 200, height: 40, rotation: 0, opacity: 1, text: t, fontSize: 24, ...over }) as TrameElement
const doc = {
  pages: [
    { id: 'p1', elements: [text('b', 'Deuxième', 10, 200), text('a', 'Premier', 10, 20), text('h', 'Caché', 10, 100, { hidden: true }), text('v', '   ', 10, 120), text('t', 'Transparent', 10, 140, { opacity: 0 })] },
    { id: 'p2', elements: [text('c', 'Page deux', 10, 10), { id: 'r', type: 'rect', x: 0, y: 0, width: 5, height: 5, rotation: 0, opacity: 1 } as TrameElement] }
  ]
} as never

describe('texte à lire', () => {
  it('page courante : ordre de lecture à l\'écran, sans texte masqué, vide ou transparent', () => {
    expect(readingItems(doc, 'page', 'p1', []).map((i) => i.text)).toEqual(['Premier', 'Deuxième'])
  })
  it('document : toutes les pages dans l\'ordre', () => {
    const items = readingItems(doc, 'all', 'p1', [])
    expect(items.map((i) => `${i.pageIndex}:${i.text}`)).toEqual(['0:Premier', '0:Deuxième', '1:Page deux'])
  })
  it('sélection : seulement les textes sélectionnés de la page', () => {
    expect(readingItems(doc, 'selection', 'p1', ['b', 'h']).map((i) => i.text)).toEqual(['Deuxième'])
    expect(readingItems(doc, 'selection', 'p1', [])).toEqual([])
    expect(readingItems(doc, 'selection', 'p2', ['b'])).toEqual([])
  })
})

describe('découpage', () => {
  it('une ligne par morceau, une phrase par morceau', () => {
    expect(splitSpeech('Bonjour. Comment allez-vous ? Très bien !\nDeuxième ligne')).toEqual(['Bonjour.', 'Comment allez-vous ?', 'Très bien !', 'Deuxième ligne'])
  })
  it('ignore ce qui n\'a ni lettre ni chiffre', () => {
    expect(splitSpeech('•\n—\n 12 \n…')).toEqual(['12'])
    expect(splitSpeech('')).toEqual([])
  })
  it('une phrase trop longue est coupée à une virgule, sinon à une espace, sans rien perdre', () => {
    const long = 'Alpha beta gamma, delta epsilon zeta eta theta, iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'
    const parts = splitSpeech(long, 40)
    expect(parts.every((p) => p.length <= 41)).toBe(true)
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long)
    expect(splitSpeech('x'.repeat(100), 30).join('')).toBe('x'.repeat(100)) // un mot sans espace est tranché
  })
  it('les guillemets fermants restent avec leur phrase', () => {
    expect(splitSpeech('Il dit « oui. » Puis il part.')).toEqual(['Il dit « oui. »', 'Puis il part.'])
  })
})

describe('voix', () => {
  const v = (voiceURI: string, lang: string, local = true): VoiceInfo => ({ voiceURI, name: voiceURI, lang, local })
  const voices = [v('en-1', 'en-US'), v('fr-cloud', 'fr-FR', false), v('fr-local', 'fr_CA'), v('de-1', 'de-DE')]
  it('la voix choisie d\'abord, sinon une voix locale de la langue, sinon aucune', () => {
    expect(pickVoice(voices, 'fr', 'de-1')?.voiceURI).toBe('de-1')
    expect(pickVoice(voices, 'fr', 'disparue')?.voiceURI).toBe('fr-local')
    expect(pickVoice(voices, 'fr-FR', '')?.voiceURI).toBe('fr-local')
    expect(pickVoice([v('fr-cloud', 'fr-FR', false)], 'fr', '')?.voiceURI).toBe('fr-cloud')
    expect(pickVoice(voices, 'es', '')).toBeNull()
    expect(pickVoice([], 'fr', '')).toBeNull()
  })
  it('les voix de la langue de l\'interface sont proposées en premier', () => {
    expect(voiceOptions(voices, 'fr').map((x) => x.voiceURI)).toEqual(['fr-cloud', 'fr-local', 'de-1', 'en-1'])
  })
  it('vitesse bornée', () => {
    expect(clampRate(0.1)).toBe(0.6)
    expect(clampRate(9)).toBe(1.6)
    expect(clampRate(1.2)).toBe(1.2)
    expect(clampRate('x')).toBe(1)
    expect(clampRate(NaN)).toBe(1)
  })
})

/** Faux moteur : chaque morceau lu attend qu'on le termine (`finish`) ou le fasse échouer (`fail`). */
function fakeSynth() {
  const spoken: UtteranceLike[] = []
  const calls: string[] = []
  const synth: SynthLike = {
    speak: (u) => void spoken.push(u),
    cancel: () => void calls.push('cancel'),
    pause: () => void calls.push('pause'),
    resume: () => void calls.push('resume')
  }
  return { synth, spoken, calls, finish: () => spoken.at(-1)!.onend?.({}), fail: (error = 'synthesis-failed') => spoken.at(-1)!.onerror?.({ error }) }
}

function setup(items: ReadItem[], opts = { lang: 'fr', rate: 1, voice: null as unknown }) {
  const f = fakeSynth()
  const log: string[] = []
  const options = { ...opts }
  const reader = new Reader(() => f.synth, (t) => ({ text: t, lang: '', rate: 0, voice: null, onend: null, onerror: null }), () => options, {
    change: (s, i, n) => log.push(`${s}:${i}/${n}`),
    item: (it) => log.push(`item:${it.elementId}`),
    failed: () => log.push('failed')
  })
  return { ...f, reader, log, options, items }
}
const item = (id: string, t: string): ReadItem => ({ pageId: 'p', pageIndex: 0, elementId: id, text: t })

describe('lecteur', () => {
  it('lit les morceaux un par un, annonce chaque nouveau texte, puis s\'arrête seul', () => {
    const s = setup([item('a', 'Un. Deux.'), item('b', 'Trois')])
    expect(s.reader.play(s.items)).toBe(true)
    expect(s.spoken.map((u) => u.text)).toEqual(['Un.'])
    s.finish()
    s.finish()
    expect(s.spoken.map((u) => u.text)).toEqual(['Un.', 'Deux.', 'Trois'])
    s.finish()
    expect(s.reader.state).toBe('idle')
    expect(s.log).toEqual(['item:a', 'playing:0/2', 'item:b', 'playing:1/2', 'idle:0/0'])
  })
  it('voix, langue et vitesse sont relues à chaque morceau', () => {
    const voice = { name: 'v' }
    const s = setup([item('a', 'Un. Deux.')])
    s.reader.play(s.items)
    expect([s.spoken[0].lang, s.spoken[0].rate, s.spoken[0].voice]).toEqual(['fr', 1, null])
    s.options.rate = 1.4
    s.options.voice = voice
    s.finish()
    expect([s.spoken[1].rate, s.spoken[1].voice]).toEqual([1.4, voice])
  })
  it('pause et reprise ; arrêt : annule le moteur et ignore la fin du morceau en cours', () => {
    const s = setup([item('a', 'Un. Deux. Trois.')])
    s.reader.play(s.items)
    s.reader.pause()
    expect(s.reader.state).toBe('paused')
    s.reader.pause() // sans effet
    s.reader.resume()
    expect(s.reader.state).toBe('playing')
    const last = s.spoken.at(-1)!
    s.reader.stop()
    expect(s.reader.state).toBe('idle')
    expect(s.calls).toEqual(['pause', 'resume', 'cancel'])
    last.onend?.({}) // fin en retard du morceau annulé : rien ne doit être lu
    last.onerror?.({ error: 'canceled' })
    expect(s.spoken).toHaveLength(1)
  })
  it('relancer remplace la lecture en cours', () => {
    const s = setup([item('a', 'Un. Deux.')])
    s.reader.play(s.items)
    s.reader.play([item('z', 'Autre')])
    expect(s.spoken.map((u) => u.text)).toEqual(['Un.', 'Autre'])
    s.spoken[0].onend?.({}) // l'ancien morceau ne relance rien
    expect(s.spoken).toHaveLength(2)
  })
  it('rien à lire (ou pas de moteur) : play() le dit', () => {
    const s = setup([item('a', '•')])
    expect(s.reader.play(s.items)).toBe(false)
    expect(s.reader.state).toBe('idle')
    const none = new Reader(() => null, (t) => ({ text: t, lang: '', rate: 0, voice: null, onend: null, onerror: null }), () => ({ lang: 'fr', rate: 1, voice: null }), { change: () => {}, item: () => {}, failed: () => {} })
    expect(none.play([item('a', 'Bonjour')])).toBe(false)
  })
  it('une erreur isolée saute le morceau ; trois de suite arrêtent la lecture', () => {
    const s = setup([item('a', 'Un. Deux. Trois. Quatre. Cinq.')])
    s.reader.play(s.items)
    s.fail()
    expect(s.spoken.map((u) => u.text)).toEqual(['Un.', 'Deux.'])
    s.finish()
    s.fail()
    s.fail()
    s.fail()
    expect(s.reader.state).toBe('idle')
    expect(s.log.at(-1)).toBe('failed')
  })
  it('un gestionnaire qui arrête la lecture au changement de texte la fait cesser aussitôt', () => {
    const f = fakeSynth()
    let reader!: Reader
    reader = new Reader(() => f.synth, (t) => ({ text: t, lang: '', rate: 0, voice: null, onend: null, onerror: null }), () => ({ lang: 'fr', rate: 1, voice: null }), {
      change: () => {},
      item: () => reader.stop(),
      failed: () => {}
    })
    expect(reader.play([item('a', 'Bonjour')])).toBe(true)
    expect(f.spoken).toHaveLength(0)
    expect(reader.state).toBe('idle')
  })
})
