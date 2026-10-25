import { describe, expect, it } from 'vitest'
import { MAX_RECENTS, parseRecents, pushRecent, removeRecent } from './recents'

const e = (path: string, openedAt = 1): { path: string; openedAt: number } => ({ path, openedAt })

describe('pushRecent', () => {
  it('place le plus récent en tête', () => {
    expect(pushRecent([e('/a.trame')], '/b.trame', 5).map((x) => x.path)).toEqual(['/b.trame', '/a.trame'])
  })

  it('remonte un projet déjà présent sans le dupliquer et met à jour sa date', () => {
    const list = pushRecent([e('/a.trame', 1), e('/b.trame', 2)], '/b.trame', 9)
    expect(list).toEqual([e('/b.trame', 9), e('/a.trame', 1)])
  })

  it('tronque à la limite en retirant les plus anciens', () => {
    let list: ReturnType<typeof pushRecent> = []
    for (let i = 0; i < MAX_RECENTS + 5; i++) list = pushRecent(list, `/p${i}.trame`, i)
    expect(list).toHaveLength(MAX_RECENTS)
    expect(list[0].path).toBe(`/p${MAX_RECENTS + 4}.trame`)
    expect(list.some((x) => x.path === '/p0.trame')).toBe(false)
  })

  it('ne modifie pas la liste d’origine', () => {
    const list = [e('/a.trame')]
    pushRecent(list, '/b.trame', 2)
    expect(list).toHaveLength(1)
  })
})

describe('removeRecent', () => {
  it('retire une entrée', () => {
    expect(removeRecent([e('/a.trame'), e('/b.trame')], '/a.trame')).toEqual([e('/b.trame')])
  })
})

describe('parseRecents', () => {
  it('relit une liste valide', () => {
    expect(parseRecents(JSON.stringify([e('/a.trame', 3)]))).toEqual([e('/a.trame', 3)])
  })

  it('tolère un fichier corrompu ou d’un autre format', () => {
    expect(parseRecents('{pas du json')).toEqual([])
    expect(parseRecents('{"a":1}')).toEqual([])
    expect(parseRecents('null')).toEqual([])
  })

  it('écarte les entrées invalides et les fichiers qui ne sont pas des projets Trame', () => {
    const raw = JSON.stringify([e('/ok.trame'), { path: 42, openedAt: 1 }, { path: '/x.txt', openedAt: 1 }, { path: '/y.trame' }, null])
    expect(parseRecents(raw)).toEqual([e('/ok.trame')])
  })
})
