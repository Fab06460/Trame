import { describe, expect, it } from 'vitest'
import { blockText, fold, helpContent, searchHelp } from './index'
import { fr } from './fr'

describe('contenu de l’aide', () => {
  const { groups, topics } = helpContent('fr')

  it('identifiants de rubriques uniques, tous rattachés à un groupe', () => {
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length)
    const groupIds = groups.map((g) => g.id)
    expect(new Set(groupIds).size).toBe(groupIds.length)
    expect(topics.filter((t) => !groupIds.includes(t.group)).map((t) => t.id)).toEqual([])
    expect(groupIds.filter((g) => !topics.some((t) => t.group === g))).toEqual([])
  })

  it('chaque rubrique a un titre et un corps, sans bloc vide', () => {
    for (const t of topics) {
      expect(t.title.trim().length, t.id).toBeGreaterThan(2)
      expect(t.body.length, t.id).toBeGreaterThan(0)
      for (const b of t.body) expect(blockText(b).trim().length, t.id).toBeGreaterThan(0)
    }
  })

  it('les raccourcis de la rubrique dédiée ont une touche et une action', () => {
    const keys = topics.find((t) => t.id === 'shortcuts')!.body.flatMap((b) => ('keys' in b ? b.keys : []))
    expect(keys.length).toBeGreaterThan(10)
    for (const [k, a] of keys) expect(k.trim() && a.trim()).toBeTruthy()
  })

  it('une langue sans traduction retombe sur le français', () => {
    expect(helpContent('de')).toBe(fr)
    expect(helpContent('xx')).toBe(fr)
  })
})

describe('recherche dans l’aide', () => {
  const { topics } = helpContent('fr')

  it('une recherche vide rend tout, dans l’ordre', () => {
    expect(searchHelp(topics, '')).toBe(topics)
    expect(searchHelp(topics, '   ')).toBe(topics)
  })

  it('ignore les accents et la casse', () => {
    expect(fold('Présentation À')).toBe('presentation a')
    expect(searchHelp(topics, 'PRESENTATION').map((t) => t.id)).toContain('present')
  })

  it('tous les mots doivent figurer, le titre passant en premier', () => {
    const r = searchHelp(topics, 'voix off').map((t) => t.id)
    expect(r[0]).toBe('media')
    expect(searchHelp(topics, 'voix zzzzzz')).toEqual([])
  })

  it('trouve par les mots-clés et dans les tableaux de raccourcis', () => {
    expect(searchHelp(topics, 'mp4').map((t) => t.id)).toContain('export')
    expect(searchHelp(topics, 'F1').map((t) => t.id)).toContain('shortcuts')
  })

  it('une recherche absurde ne trouve rien', () => {
    expect(searchHelp(topics, 'qwxzy')).toEqual([])
  })
})
