import { describe, expect, it } from 'vitest'
import { isDuplex, pxToMm, sheetGeometry } from './printSheet'

describe('sheetGeometry', () => {
  it('A4 portrait : 794 × 1123 px font 210 × 297 mm', () => {
    const g = sheetGeometry(794, 1123)!
    expect(g.landscape).toBe(false)
    expect(g.widthMm).toBe(210)
    expect(Math.round(g.heightMm)).toBe(297)
    expect(g.portraitMicrons).toEqual({ width: Math.round(g.widthMm * 1000), height: Math.round(g.heightMm * 1000) })
  })

  it('A4 paysage : demande la feuille portrait avec l\'indicateur paysage', () => {
    const g = sheetGeometry(1123, 794)!
    expect(g.landscape).toBe(true)
    expect(g.portraitMicrons.width).toBeLessThan(g.portraitMicrons.height)
  })

  it('ramène une feuille voisine d\'un format courant à sa taille exacte (A4, Lettre), sans toucher aux autres', () => {
    expect(sheetGeometry(794, 1123)).toMatchObject({ widthMm: 210, heightMm: 297 })
    expect(sheetGeometry(1123, 794)).toMatchObject({ widthMm: 297, heightMm: 210, landscape: true })
    expect(sheetGeometry(816, 1056)).toMatchObject({ widthMm: 215.9, heightMm: 279.4 })
    expect(sheetGeometry(1080, 1080)).toMatchObject({ widthMm: 285.75, heightMm: 285.75 })
  })

  it('refuse les dimensions absurdes ou qui ne sont pas des nombres', () => {
    expect(sheetGeometry(10, 500)).toBeNull()
    expect(sheetGeometry(500, 99999)).toBeNull()
    expect(sheetGeometry('800', 600)).toBeNull()
    expect(sheetGeometry(NaN, 600)).toBeNull()
  })

  it('pxToMm : 96 px = 25,4 mm', () => {
    expect(pxToMm(96)).toBeCloseTo(25.4, 6)
  })

  it('isDuplex n\'accepte que les trois modes connus', () => {
    expect(['simplex', 'shortEdge', 'longEdge'].every(isDuplex)).toBe(true)
    expect(isDuplex('both')).toBe(false)
  })
})
