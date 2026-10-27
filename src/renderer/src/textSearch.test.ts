import { describe, expect, it } from 'vitest'
import { applyReplacements, findInDocument, findMatches, replacementsFor, type SearchOptions } from '@/textSearch'
import type { TrameDocument, TrameElement } from '@/types'

const base: SearchOptions = { caseSensitive: false, wholeWord: false, ignoreAccents: false }
const opt = (o: Partial<SearchOptions> = {}): SearchOptions => ({ ...base, ...o })

describe('findMatches', () => {
  it('trouve toutes les occurrences, sans chevauchement, sans tenir compte de la casse par défaut', () => {
    expect(findMatches('Chat chat CHAT', 'chat', base)).toEqual([{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 10, end: 14 }])
    expect(findMatches('aaaa', 'aa', base)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }])
  })
  it('respecte la casse si demandé', () => expect(findMatches('Chat chat', 'chat', opt({ caseSensitive: true }))).toEqual([{ start: 5, end: 9 }]))
  it('mot entier : pas à l\'intérieur d\'un autre mot, accents et chiffres compris', () => {
    expect(findMatches('chat chaton achat chat.', 'chat', opt({ wholeWord: true }))).toEqual([{ start: 0, end: 4 }, { start: 18, end: 22 }])
    expect(findMatches('été étés', 'été', opt({ wholeWord: true }))).toEqual([{ start: 0, end: 3 }])
    expect(findMatches('a1 a', 'a', opt({ wholeWord: true }))).toEqual([{ start: 3, end: 4 }])
  })
  it('accents : respectés par défaut, ignorés si demandé (et l\'original est bien repéré)', () => {
    expect(findMatches('Éléphant élevé', 'elephant', base)).toEqual([])
    expect(findMatches('Éléphant élevé', 'elephant', opt({ ignoreAccents: true }))).toEqual([{ start: 0, end: 8 }])
    expect(findMatches('crème brûlée', 'brulee', opt({ ignoreAccents: true }))).toEqual([{ start: 6, end: 12 }])
    expect(findMatches('cafe', 'café', opt({ ignoreAccents: true }))).toEqual([{ start: 0, end: 4 }]) // la requête aussi est pliée
  })
  it('lettres décomposées (e + accent combinant) : positions exactes dans l\'original', () => {
    const t = 'café noir' // « café » écrit avec un accent combinant
    expect(findMatches(t, 'noir', base)).toEqual([{ start: 6, end: 10 }])
    expect(findMatches(t, 'cafe', opt({ ignoreAccents: true }))).toEqual([{ start: 0, end: 5 }]) // l'accent combinant fait partie de la lettre
    expect(findMatches(t, 'cafe', base)).toEqual([]) // accents respectés : « cafe » n'est pas « café »
  })
  it('émojis et caractères hors plan de base : indices cohérents', () => {
    const t = '😀 chat 😀'
    const [m] = findMatches(t, 'chat', base)
    expect(t.slice(m.start, m.end)).toBe('chat')
  })
  it('requête vide : rien ; caractères spéciaux de regex : littéraux', () => {
    expect(findMatches('abc', '', base)).toEqual([])
    expect(findMatches('prix (HT) .*', '(HT)', base)).toEqual([{ start: 5, end: 9 }])
    expect(findMatches('a.b axb', 'a.b', base)).toEqual([{ start: 0, end: 3 }])
  })
})

describe('applyReplacements', () => {
  it('remplace toutes les occurrences, y compris par du texte plus long ou vide', () => {
    const t = 'un chat, deux chats'
    const m = findMatches(t, 'chat', base)
    expect(applyReplacements(t, m, 'chien')).toBe('un chien, deux chiens')
    expect(applyReplacements(t, m, '')).toBe('un , deux s')
  })
  it('le texte de remplacement n\'est jamais interprété ($1, \\n…)', () => expect(applyReplacements('a', [{ start: 0, end: 1 }], '$1 \\n $&')).toBe('$1 \\n $&'))
})

const el = (id: string, text: string, o: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'text', x: 0, y: 0, width: 100, height: 20, rotation: 0, opacity: 1, fill: '#000', text, ...o }) as TrameElement
const doc = (pages: TrameElement[][]): TrameDocument => ({ version: 2, name: 'x', width: 10, height: 10, pages: pages.map((els, i) => ({ id: `p${i + 1}`, background: '#fff', elements: els })) })

describe('findInDocument', () => {
  const d = doc([
    [el('a', 'Bonjour le monde'), { ...el('r', ''), type: 'rect' } as TrameElement, el('h', 'monde caché', { hidden: true })],
    [el('b', 'Le monde est grand\nle MONDE entier')]
  ])
  it('parcourt les pages dans l\'ordre, ignore les calques masqués et les éléments sans texte', () => {
    const hits = findInDocument(d, 'monde', base)
    expect(hits.map((h) => [h.pageIndex, h.elementId, h.start])).toEqual([[0, 'a', 11], [1, 'b', 3], [1, 'b', 22]])
  })
  it('peut se limiter à une page', () => expect(findInDocument(d, 'monde', base, 'p1')).toHaveLength(1))
  it('extrait autour de l\'occurrence', () => {
    const [h] = findInDocument(d, 'Bonjour', base)
    expect(h).toMatchObject({ before: '', found: 'Bonjour', after: ' le monde' })
  })
})

describe('replacementsFor', () => {
  it('un nouveau texte par élément, toutes les occurrences d\'un élément ensemble', () => {
    const d = doc([[el('a', 'chat et chat')], [el('b', 'un chat')]])
    const hits = findInDocument(d, 'chat', base)
    expect(replacementsFor(d, hits, 'chien')).toEqual([{ elementId: 'a', text: 'chien et chien' }, { elementId: 'b', text: 'un chien' }])
    expect(replacementsFor(d, [hits[1]], 'chien')).toEqual([{ elementId: 'a', text: 'chat et chien' }])
  })
})
