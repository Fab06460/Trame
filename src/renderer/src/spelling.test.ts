import { describe, expect, it, vi } from 'vitest'
import { contextAround, findMisspellings, MAX_WORDS, replaceWord, wordsIn, type Checker } from './spelling'

const words = (t: string): string[] => wordsIn(t).map((w) => w.word)
/** Faux correcteur : refuse une liste de mots, avec une suggestion. */
const checker = (bad: Record<string, string[]>): Checker => (ws) => ws.map((w) => (w in bad ? { suggestions: bad[w] } : null))

describe('wordsIn', () => {
  it('mots simples, avec leur place', () => {
    expect(wordsIn('Bonjour le monde')).toEqual([
      { word: 'Bonjour', start: 0, end: 7 },
      { word: 'le', start: 8, end: 10 },
      { word: 'monde', start: 11, end: 16 }
    ])
  })
  it('accents, apostrophes et traits d\'union restent dans le mot', () => {
    expect(words("Aujourd'hui, c’est l'été : peut-être déjà")).toEqual(["Aujourd'hui", 'c’est', "l'été", 'peut-être', 'déjà'])
  })
  it('ignore les lettres isolées', () => {
    expect(words('à b c de')).toEqual(['de'])
  })
  it('ignore sigles, mots à capitale intérieure et chiffres collés', () => {
    expect(words('PDF iPhone YouTube A4 3D 2e Mac')).toEqual(['Mac'])
  })
  it('ignore adresses, courriels, marques de fusion, mots-dièse et mentions', () => {
    expect(words('Voir https://exemple.fr/page et paul@exemple.fr ou www.exemple.fr {{prenom}} #trame @paul fin')).toEqual(['Voir', 'et', 'ou', 'fin'])
  })
  it('garde les indices d\'origine malgré les zones ignorées', () => {
    const t = 'https://x.fr bonjuor'
    const [w] = wordsIn(t)
    expect(t.slice(w.start, w.end)).toBe('bonjuor')
  })
  it('ignore les écritures non latines', () => {
    expect(words('Hello 日本語 привет world')).toEqual(['Hello', 'world'])
  })
  it('texte vide', () => {
    expect(wordsIn('')).toEqual([])
  })
})

describe('findMisspellings', () => {
  it('signale les mots refusés, avec leurs suggestions, par texte', () => {
    const r = findMisspellings([{ key: 'a', text: 'Un bonjuor ici' }, { key: 'b', text: 'Tout va bien' }], checker({ bonjuor: ['bonjour'] }))
    expect([...r.keys()]).toEqual(['a'])
    expect(r.get('a')).toEqual([{ word: 'bonjuor', start: 3, end: 10, suggestions: ['bonjour'] }])
  })
  it('un mot répété n\'est demandé qu\'une fois, tous ses emplacements sont signalés', () => {
    const spy = vi.fn(checker({ erreure: [] }))
    const r = findMisspellings([{ key: 'a', text: 'erreure et erreure' }, { key: 'b', text: 'une erreure' }], spy)
    expect(spy.mock.calls[0][0].filter((w) => w === 'erreure')).toHaveLength(1)
    expect(r.get('a')).toHaveLength(2)
    expect(r.get('b')).toHaveLength(1)
  })
  it('mots ignorés : insensible à la casse', () => {
    const r = findMisspellings([{ key: 'a', text: 'Trameo et trameo' }], checker({ Trameo: [], trameo: [] }), new Set(['trameo']))
    expect(r.size).toBe(0)
  })
  it('mot composé accepté en entier : rien', () => {
    expect(findMisspellings([{ key: 'a', text: "aujourd'hui" }], checker({})).size).toBe(0)
  })
  it('mot composé refusé : seuls les morceaux refusés sont signalés', () => {
    const r = findMisspellings([{ key: 'a', text: 'très-bonjuor' }], checker({ 'très-bonjuor': [], bonjuor: ['bonjour'] }))
    expect(r.get('a')).toEqual([{ word: 'bonjuor', start: 5, end: 12, suggestions: ['bonjour'] }])
  })
  it('mot composé refusé mais dont tous les morceaux passent : rien', () => {
    expect(findMisspellings([{ key: 'a', text: "c'est-à-dire" }], checker({ "c'est-à-dire": [] })).size).toBe(0)
  })
  it('plafonne le nombre de mots demandés', () => {
    const text = Array.from({ length: MAX_WORDS + 500 }, (_, i) => `mot${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + (Math.floor(i / 26) % 26))}${String.fromCharCode(97 + (Math.floor(i / 676) % 26))}x`).join(' ')
    const spy = vi.fn(checker({}))
    findMisspellings([{ key: 'a', text }], spy)
    expect(spy.mock.calls.flatMap((c) => c[0]).length).toBeLessThanOrEqual(MAX_WORDS)
  })
})

describe('replaceWord', () => {
  const text = 'erreure et erreure et bien'
  const found = findMisspellings([{ key: 'a', text }], checker({ erreure: ['erreur'] })).get('a') ?? []
  it('remplace toutes les occurrences', () => {
    expect(replaceWord(text, found, 'erreure', 'erreur')).toBe('erreur et erreur et bien')
  })
  it('un indice périmé est laissé de côté', () => {
    expect(replaceWord('x' + text, found, 'erreure', 'erreur')).toBe('x' + text)
  })
  it('ne touche pas aux autres mots', () => {
    expect(replaceWord(text, found, 'bien', 'mal')).toBe(text)
  })
})

describe('contextAround', () => {
  it('quelques mots autour, avec des points de suspension aux bords coupés', () => {
    const t = 'a'.repeat(40) + ' faute ' + 'b'.repeat(40)
    const m = wordsIn(t).find((w) => w.word === 'faute')!
    const c = contextAround(t, m)
    expect(c.word).toBe('faute')
    expect(c.before.startsWith('…')).toBe(true)
    expect(c.after.endsWith('…')).toBe(true)
  })
  it('texte court : sans points de suspension, espaces ramenés à un', () => {
    const t = 'un\nbonjuor\n\nici'
    const m = wordsIn(t).find((w) => w.word === 'bonjuor')!
    expect(contextAround(t, m)).toEqual({ before: 'un ', word: 'bonjuor', after: ' ici' })
  })
})
