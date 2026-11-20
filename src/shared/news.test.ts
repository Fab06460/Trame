import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareVersions, newsBetween, newsLines, NEWS, parseVersion, type NewsEntry } from './news'

const entry = (version: string): NewsEntry => ({ version, fr: ['a'], en: ['b'] })

describe('nouveautés', () => {
  it('lit et compare les versions', () => {
    expect(parseVersion('v0.12.0')).toEqual([0, 12, 0])
    expect(parseVersion('1.2.3-beta')).toEqual([1, 2, 3])
    expect(parseVersion('abc')).toBeNull()
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.9')).toBeGreaterThan(0)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
  })

  it('rend ce qui est nouveau depuis la dernière version vue, jusqu\'à la version installée, du plus récent au plus ancien', () => {
    const news = [entry('0.10.0'), entry('0.12.0'), entry('0.11.0'), entry('0.13.0')]
    expect(newsBetween('0.10.0', '0.12.0', news).map((n) => n.version)).toEqual(['0.12.0', '0.11.0'])
    expect(newsBetween('0.12.0', '0.12.0', news)).toEqual([])
    expect(newsBetween('0.9.0', '0.10.0', news).map((n) => n.version)).toEqual(['0.10.0'])
  })

  it('une langue sans texte retombe sur l\'anglais', () => {
    const e = entry('1.0.0')
    expect(newsLines(e, 'de')).toEqual(['b'])
    expect(newsLines({ ...e, de: ['c'] }, 'de')).toEqual(['c'])
    expect(newsLines(e, 'fr')).toEqual(['a'])
  })

  it('la version du paquet a ses nouveautés (à écrire avant de numéroter une version)', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(NEWS.some((n) => n.version === version)).toBe(true)
  })

  it('chaque entrée a des lignes en français et en anglais, sans doublon de version', () => {
    for (const n of NEWS) {
      expect(parseVersion(n.version)).not.toBeNull()
      expect(n.fr.length).toBeGreaterThan(0)
      expect(n.en.length).toBe(n.fr.length)
    }
    expect(new Set(NEWS.map((n) => n.version)).size).toBe(NEWS.length)
  })
})
