import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORY_KEYS, FR_WORDS, fromRaw, normalize, searchIcons, type IconLibrary } from '@/iconSearch'

const lib: IconLibrary = fromRaw(JSON.parse(readFileSync(new URL('./iconData.json', import.meta.url), 'utf8')))
const names = (q: string, cat: number | null = null): string[] => searchIcons(lib, q, cat).map((i) => i.name)

describe('bibliothèque d’icônes', () => {
  it('contient plus d’un millier d’icônes, deux variantes chacune, sans marque déposée', () => {
    expect(lib.icons.length).toBeGreaterThan(1000)
    expect(lib.icons.every((i) => i.regular.startsWith('M') && i.fill.startsWith('M'))).toBe(true)
    expect(lib.categories).not.toContain('brands')
    expect(names('logo').filter((n) => /(facebook|google|apple|twitter|github)/.test(n))).toEqual([])
  })

  it('n’utilise que des commandes absolues M L C Z, dans le viewBox 100 × 100', () => {
    for (const i of lib.icons) {
      for (const d of [i.regular, i.fill]) {
        expect(d, i.name).toMatch(/^[MLCZ0-9. -]+$/)
        const nums = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number)
        expect(Math.min(...nums), i.name).toBeGreaterThanOrEqual(-10)
        expect(Math.max(...nums), i.name).toBeLessThanOrEqual(110)
      }
    }
  })

  it('chaque catégorie de la bibliothèque a un libellé traduisible', () => {
    for (const c of lib.categories) expect(CATEGORY_KEYS[c], c).toBeTruthy()
  })

  it('chaque mot français du dictionnaire mène à au moins une icône', () => {
    const missing = Object.entries(FR_WORDS).filter(([fr]) => searchIcons(lib, fr).length === 0).map(([fr]) => fr)
    expect(missing).toEqual([])
  })
})

describe('recherche d’icônes', () => {
  it('sans saisie : toutes les icônes, ou celles de la catégorie', () => {
    expect(searchIcons(lib, '')).toHaveLength(lib.icons.length)
    const cat = lib.categories.indexOf('weather')
    const inCat = searchIcons(lib, '  ', cat)
    expect(inCat.length).toBeGreaterThan(5)
    expect(inCat.length).toBeLessThan(lib.icons.length)
    expect(inCat.every((i) => i.categories.includes(cat))).toBe(true)
  })

  it('trouve par le nom anglais, le nom exact d’abord', () => {
    const r = names('heart')
    expect(r[0]).toBe('heart')
    expect(r).toContain('heart-straight')
  })

  it('trouve par un mot-clé de la bibliothèque', () => {
    expect(names('contacts')).toContain('address-book')
  })

  it('comprend des mots français courants, avec ou sans accents ni pluriel', () => {
    expect(names('maison')).toContain('house')
    expect(names('cœur'.replace('œ', 'oe'))).toContain('heart')
    expect(names('Étoiles')).toContain('star')
    expect(names('flèche')[0]).toMatch(/^arrow/)
    expect(names('ordinateur')).toContain('laptop')
  })

  it('chaque mot saisi doit correspondre', () => {
    const r = names('arrow up')
    expect(r.length).toBeGreaterThan(3)
    expect(names('heart zzzqqq')).toEqual([])
    expect(names('zzzqqq')).toEqual([])
  })

  it('la catégorie restreint la recherche', () => {
    const arrows = lib.categories.indexOf('arrows')
    expect(names('arrow', arrows).length).toBeGreaterThan(50)
    expect(names('heart', arrows)).not.toContain('heart')
  })

  it('cherche aussi dans le libellé traduit de la catégorie', () => {
    const labels = lib.categories.map((c) => (c === 'weather' ? 'Météo' : 'Autre'))
    const r = searchIcons(lib, 'meteo', null, labels).map((i) => i.name)
    expect(r.length).toBeGreaterThan(5)
    expect(r).toContain('cloud-rain')
  })

  it('normalize retire les accents et la casse', () => {
    expect(normalize('  Éléphant Œuf ')).toBe('elephant œuf')
  })
})
