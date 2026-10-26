import { describe, expect, it } from 'vitest'
import { DEFAULT_STROKE_COLOR, STROKE_WIDTH, dashPattern, hasStroke, sanitizeStroke, scalePath, strokeProps } from '@/strokeStyle'
import { SHAPES } from '@/shapes'

describe('hasStroke / strokeProps', () => {
  it('exige une couleur et une épaisseur positive', () => {
    expect(hasStroke({})).toBe(false)
    expect(hasStroke({ stroke: '#000' })).toBe(false)
    expect(hasStroke({ strokeWidth: 4 })).toBe(false)
    expect(hasStroke({ stroke: '#000', strokeWidth: 0 })).toBe(false)
    expect(hasStroke({ stroke: '#000', strokeWidth: 3 })).toBe(true)
  })
  it('désactive le trait sans contour (même avec une couleur résiduelle)', () => {
    expect(strokeProps({})).toEqual({ strokeWidth: 0, strokeEnabled: false })
    expect(strokeProps({ stroke: '#f00', strokeWidth: 0 })).toEqual({ strokeWidth: 0, strokeEnabled: false })
  })
  it('contour plein ou en tirets proportionnels à l\'épaisseur', () => {
    expect(strokeProps({ stroke: '#f00', strokeWidth: 4 })).toEqual({ stroke: '#f00', strokeWidth: 4, strokeEnabled: true })
    expect(strokeProps({ stroke: '#f00', strokeWidth: 4, strokeDashed: true }).dash).toEqual(dashPattern(4))
    expect(dashPattern(4)).toEqual([12, 8])
  })
  it('couleur par défaut exportée', () => expect(DEFAULT_STROKE_COLOR).toMatch(/^#[0-9a-f]{6}$/))
})

describe('sanitizeStroke', () => {
  it('retire un contour incomplet ou invalide', () => {
    for (const bad of [{ stroke: '#000' }, { strokeWidth: 3 }, { stroke: '', strokeWidth: 3 }, { stroke: '#000', strokeWidth: -2 }, { stroke: '#000', strokeWidth: 'x' }, { stroke: 5, strokeWidth: 3 }]) {
      const e: Record<string, unknown> = { ...bad, strokeDashed: true }
      sanitizeStroke(e)
      expect(e).toEqual({})
    }
  })
  it('borne l\'épaisseur et ne garde strokeDashed que s\'il est vrai', () => {
    const e: Record<string, unknown> = { stroke: '#000', strokeWidth: 9999, strokeDashed: 'oui' }
    sanitizeStroke(e)
    expect(e).toEqual({ stroke: '#000', strokeWidth: STROKE_WIDTH.max })
    const f: Record<string, unknown> = { stroke: '#000', strokeWidth: 3, strokeDashed: true }
    sanitizeStroke(f)
    expect(f).toEqual({ stroke: '#000', strokeWidth: 3, strokeDashed: true })
  })
})

describe('scalePath', () => {
  it('étire chaque axe indépendamment (absolu)', () => {
    expect(scalePath('M10 20 L30 40 Z', 2, 3)).toBe('M20 60 L60 120 Z')
  })
  it('H et V ne touchent que leur axe', () => {
    expect(scalePath('M0 0 H10 V20 Z', 2, 5)).toBe('M0 0 H20 V100 Z')
  })
  it('courbes : toutes les paires', () => {
    expect(scalePath('M0 0 C10 10 20 20 30 30 Q5 6 7 8', 2, 10)).toBe('M0 0 C20 100 40 200 60 300 Q10 60 14 80')
  })
  it('commandes répétées sans relettrage (« L1 2 3 4 »)', () => {
    expect(scalePath('M0 0 L1 2 3 4', 10, 100)).toBe('M0 0 L10 200 30 400')
  })
  it('relatif : mêmes facteurs', () => {
    expect(scalePath('m1 2 l3 4 h5 v6 z', 2, 3)).toBe('m2 6 l6 12 h10 v18 z')
  })
  it('nombres négatifs, décimaux et exposants', () => {
    expect(scalePath('M-1.5 .5 L2e1 -3', 2, 2)).toBe('M-3 1 L40 -6')
  })
  it('arcs et commandes inconnues : null (on ne les déforme pas)', () => {
    expect(scalePath('M0 0 A5 5 0 0 1 10 10', 2, 3)).toBeNull()
    expect(scalePath('M0 0 X1 1', 2, 3)).toBeNull()
    expect(scalePath('', 2, 3)).toBeNull()
  })
  it('entrée malformée (arguments incomplets) : null', () => {
    expect(scalePath('M10 L5 5', 2, 2)).toBeNull()
  })
  it('toutes les formes intégrées sont étirables, et le résultat est identique à un étirement du dessin', () => {
    for (const shape of SHAPES) {
      const scaled = scalePath(shape.path, 2.4, 0.6)
      expect(scaled, shape.id).not.toBeNull()
      // mêmes nombres de coordonnées : rien n'a été perdu
      expect((scaled!.match(/-?\d*\.?\d+/g) ?? []).length, shape.id).toBe((shape.path.match(/-?\d*\.?\d+/g) ?? []).length)
    }
  })
})
