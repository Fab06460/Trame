import { describe, expect, it } from 'vitest'
import raw from './illustrationData.json'
import { fromRaw, illustrationElements, illustrationWidth, searchIllustrations, type RawIllustrations } from '@/illustrations'
import { scalePath } from '@/strokeStyle'

const all = fromRaw(raw as RawIllustrations)
const names: Record<string, string> = { coffee: 'Café renversé', reading: 'Lecture', 'dog-jump': 'Course avec le chien', doggie: 'Avec le chien' }
const nameOf = (id: string): string => names[id] ?? id

describe('illustrations embarquées', () => {
  it('une trentaine de dessins, chacun en couches de tracés absolus M L C Z', () => {
    expect(all.length).toBeGreaterThanOrEqual(30)
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length)
    for (const ill of all) {
      expect(ill.ratio).toBeCloseTo(1024 / 768, 3)
      expect(ill.layers.length).toBeGreaterThan(0)
      for (const l of ill.layers) {
        expect([0, 1]).toContain(l.color)
        expect(l.d).toMatch(/^M/)
        expect(l.d.replace(/[MLCZ\d.\s-]/g, '')).toBe('') // aucune autre commande : étirable sans déformer un contour
        expect(scalePath(l.d, 2, 3)).not.toBeNull() // et lisible par l'export PDF
      }
    }
  })

  it('les coordonnées restent dans le cadre (à quelques pour cent près)', () => {
    for (const ill of all) {
      for (const l of ill.layers) {
        for (const v of l.d.match(/-?\d*\.?\d+/g)!.map(Number)) expect(v).toBeGreaterThan(-15), expect(v).toBeLessThan(115)
      }
    }
  })

  it('« Bikini » n’est pas dans la bibliothèque', () => {
    expect(all.some((i) => i.id === 'bikini')).toBe(false)
  })
})

describe('recherche', () => {
  it('sans mot, tout est proposé', () => {
    expect(searchIllustrations(all, '  ', nameOf)).toBe(all)
  })

  it('par nom affiché, sans accents ni casse', () => {
    expect(searchIllustrations(all, 'cafe renverse', nameOf).map((i) => i.id)).toEqual(['coffee'])
    expect(searchIllustrations(all, 'LECTURE', nameOf).map((i) => i.id)).toContain('reading')
  })

  it('par mot-clé anglais ou français ; tous les mots doivent correspondre', () => {
    const dogs = searchIllustrations(all, 'chien', nameOf).map((i) => i.id)
    expect(dogs).toEqual(expect.arrayContaining(['dog-jump', 'doggie', 'petting']))
    expect(searchIllustrations(all, 'dog glace', nameOf)).toEqual([])
    expect(searchIllustrations(all, 'dog jump', nameOf).map((i) => i.id)).toEqual(['dog-jump'])
  })

  it('aucun résultat pour un mot inconnu', () => {
    expect(searchIllustrations(all, 'xylophone', nameOf)).toEqual([])
  })
})

describe('insertion', () => {
  const page = { width: 1080, height: 1080 }
  const ill = all.find((i) => i.id === 'coffee')!
  let n = 0
  const els = illustrationElements(ill, page, { ink: '#111111', accent: '#ff0000' }, 'Café', () => `id${n++}`)

  it('70 % de la plus petite dimension, centrée', () => {
    expect(illustrationWidth(page)).toBe(756)
    for (const e of els) expect([e.x, e.y, e.width, e.height]).toEqual([162, 257, 756, 567])
    expect(illustrationWidth({ width: 1920, height: 1080 })).toBe(756)
  })

  it('une couche = un tracé « pair-impair », dans un seul groupe, avec des identifiants distincts', () => {
    expect(els).toHaveLength(ill.layers.length)
    expect(new Set(els.map((e) => e.groupId)).size).toBe(1)
    expect(new Set(els.map((e) => e.id)).size).toBe(els.length)
    expect(els.every((e) => e.type === 'path' && e.fillRule === 'evenodd' && e.rotation === 0 && e.opacity === 1)).toBe(true)
    expect(els[0].groupId).not.toBe(els[0].id)
  })

  it('l’accent et l’encre prennent les couleurs choisies, dans l’ordre de peinture', () => {
    expect(els.map((e) => e.fill)).toEqual(ill.layers.map((l) => (l.color === 0 ? '#ff0000' : '#111111')))
    expect(els.every((e) => e.name === 'Café')).toBe(true)
  })
})
