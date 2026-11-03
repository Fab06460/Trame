import { describe, expect, it } from 'vitest'
import { chromaOf, extractPalette, labOf, labToRgb, rgbToLab } from '@/palette'

/** Pixels RVBA : `parts` = [[r, g, b, nombre de pixels], …]. */
const pixels = (parts: Array<[number, number, number, number]>): number[] => parts.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat())

describe('L*a*b*', () => {
  it('aller-retour : retrouve la couleur de départ', () => {
    for (const c of [[0, 0, 0], [255, 255, 255], [200, 30, 90], [12, 140, 250], [128, 128, 128]] as Array<[number, number, number]>) {
      const back = labToRgb(rgbToLab(c))
      c.forEach((v, i) => expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(1))
    }
  })

  it('le blanc est clair (≈ 100) et le noir sombre (≈ 0) ; un gris n’a pas de chroma, un rouge en a', () => {
    expect(labOf('#ffffff')![0]).toBeGreaterThan(99)
    expect(labOf('#000000')![0]).toBeLessThan(1)
    expect(chromaOf(labOf('#808080')!)).toBeLessThan(1)
    expect(chromaOf(labOf('#d62828')!)).toBeGreaterThan(50)
  })
})

describe('palette d’une image', () => {
  it('retrouve les trois couleurs d’une image à trois couleurs, la plus présente d’abord', () => {
    const p = extractPalette(pixels([[220, 30, 40, 600], [30, 60, 200, 300], [40, 180, 70, 100]]), 3)
    expect(p).toHaveLength(3)
    expect(p[0].color).toBe('#dc1e28')
    expect(p[0].share).toBeCloseTo(0.6, 2)
    expect(p[1].color).toBe('#1e3cc8')
    expect(p[2].color).toBe('#28b446')
  })

  it('rend moins de couleurs que demandé quand l’image n’en a pas davantage', () => {
    expect(extractPalette(pixels([[10, 20, 30, 50], [250, 240, 230, 50]]), 6)).toHaveLength(2)
  })

  it('ignore les pixels transparents', () => {
    const data = [...pixels([[200, 0, 0, 10]]), ...Array.from({ length: 500 }, () => [0, 255, 0, 0]).flat()]
    const p = extractPalette(data, 3)
    expect(p).toHaveLength(1)
    expect(p[0].share).toBe(1)
  })

  it('fond deux nuances très proches en une seule couleur', () => {
    const p = extractPalette(pixels([[200, 30, 40, 300], [204, 32, 42, 300], [30, 60, 200, 300]]), 4)
    expect(p).toHaveLength(2)
  })

  it('écarte le bruit (un pixel isolé)', () => {
    const p = extractPalette(pixels([[200, 30, 40, 2000], [0, 255, 255, 1]]), 4)
    expect(p).toHaveLength(1)
  })

  it('est déterministe, et vide pour une image vide', () => {
    const data = pixels([[220, 30, 40, 600], [30, 60, 200, 300], [40, 180, 70, 100], [250, 220, 60, 80]])
    expect(extractPalette(data, 4)).toEqual(extractPalette(data, 4))
    expect(extractPalette([], 5)).toEqual([])
  })
})
