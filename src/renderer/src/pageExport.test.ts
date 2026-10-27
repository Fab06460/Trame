import { describe, expect, it } from 'vitest'
import { MAX_EXPORT_SIDE, describePages, effectiveScale, pageFileName, parsePageRange } from '@/pageExport'

describe('parsePageRange', () => {
  const ok = (t: string, n = 10) => { const r = parsePageRange(t, n); return r.ok ? r.pages : r.error }
  it('numéros, plages, séparateurs variés, ordre libre, sans doublon', () => {
    expect(ok('1-3, 5')).toEqual([1, 2, 3, 5])
    expect(ok('5;1 ; 3-4')).toEqual([1, 3, 4, 5])
    expect(ok('2,2,2-3')).toEqual([2, 3])
    expect(ok('7')).toEqual([7])
  })
  it('refuse proprement', () => {
    expect(ok('')).toContain('au moins une page')
    expect(ok('a-b')).toContain('pas une page valide')
    expect(ok('0')).toContain('n\'existe pas')
    expect(ok('12', 10)).toContain('La page 12 n\'existe pas')
    expect(ok('3-1')).toContain('doit précéder')
    expect(ok('1-99', 5)).toContain('La page 99')
    expect(ok('1', 1)).toEqual([1])
    expect(ok('2', 1)).toContain('1 page')
  })
})

describe('pageFileName', () => {
  it('complète de zéros selon le nombre de pages', () => {
    expect(pageFileName('Affiche', 3, 9, 'png')).toBe('Affiche-page-3.png')
    expect(pageFileName('Affiche', 3, 12, 'jpg')).toBe('Affiche-page-03.jpg')
    expect(pageFileName('Affiche', 12, 120, 'png')).toBe('Affiche-page-012.png')
  })
})

describe('effectiveScale', () => {
  it('garde l\'échelle demandée tant que la taille reste raisonnable', () => expect(effectiveScale(1080, 1080, 2)).toBe(2))
  it('réduit une échelle qui dépasserait la taille maximale', () => {
    const s = effectiveScale(4000, 3000, 3)
    expect(s).toBeCloseTo(MAX_EXPORT_SIDE / 4000)
    expect(4000 * s).toBeLessThanOrEqual(MAX_EXPORT_SIDE + 1e-9)
  })
})

describe('describePages', () => {
  it('résumé lisible', () => {
    expect(describePages([1])).toBe('1 page : 1')
    expect(describePages([1, 2, 5])).toBe('3 pages : 1, 2, 5')
    expect(describePages([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe('9 pages')
  })
})
