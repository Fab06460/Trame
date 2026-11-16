import { describe, expect, it } from 'vitest'
import { lineEndPoints, lineEndsOf, openGeometry, sanitizeOpen } from './openPath'

describe('lineEndPoints', () => {
  it('reconnaît une ligne droite', () => {
    expect(lineEndPoints('M0 0 L100 100')).toEqual([0, 0, 100, 100])
    expect(lineEndPoints('M0,100 L100,0')).toEqual([0, 100, 100, 0])
  })
  it('refuse une courbe ou un polygone', () => {
    expect(lineEndPoints('M0 0 C1 1 2 2 3 3')).toBeNull()
    expect(lineEndPoints('M0 0 L1 1 L2 2')).toBeNull()
    expect(lineEndPoints(undefined)).toBeNull()
  })
})

describe('lineEndsOf', () => {
  it('seulement sur une ligne droite ouverte avec une extrémité', () => {
    expect(lineEndsOf({ open: true, path: 'M0 0 L100 0', ends: { end: 'arrow' } })).toEqual({ end: 'arrow' })
    expect(lineEndsOf({ open: true, path: 'M0 0 L100 0', ends: {} })).toBeNull()
    expect(lineEndsOf({ open: true, path: 'M0 0 C1 1 2 2 3 3', ends: { end: 'arrow' } })).toBeNull()
    expect(lineEndsOf({ path: 'M0 0 L100 0', ends: { end: 'arrow' } })).toBeNull()
  })
})

describe('openGeometry', () => {
  const base = { open: true as const, width: 200, height: 1, strokeWidth: 4 }
  it('sans extrémité : le chemin étiré, sans marque', () => {
    expect(openGeometry({ ...base, path: 'M0 50 L100 50' })).toEqual({ stroke: 'M0 0.5 L200 0.5', marks: [] })
  })
  it('une flèche : la ligne s\'arrête avant la pointe, qui est pleine', () => {
    const g = openGeometry({ ...base, path: 'M0 50 L100 50', ends: { end: 'arrow' } })
    expect(g.marks).toHaveLength(1)
    expect(g.marks[0].startsWith('M200 0.5')).toBe(true)
    // pointe de 16 px (4 × l'épaisseur) ; la ligne s'arrête à 70 % de sa longueur
    expect(g.stroke).toBe(`M0 0.5 L${200 - 16 * 0.7} 0.5`)
  })
  it('un rond au début : le trait reste entier', () => {
    const g = openGeometry({ ...base, path: 'M0 50 L100 50', ends: { start: 'dot' } })
    expect(g.stroke).toBe('M0 0.5 L200 0.5')
    expect(g.marks).toHaveLength(1)
  })
  it('une ligne oblique : la pointe suit la direction', () => {
    const g = openGeometry({ open: true, width: 100, height: 100, strokeWidth: 4, path: 'M0 0 L100 100', ends: { end: 'arrow' } })
    expect(g.marks[0].startsWith('M100 100')).toBe(true)
    const [, a, b] = g.marks[0].split(' L')
    // la base de la pointe est perpendiculaire à la ligne : les deux coins sont de part et d'autre de la diagonale
    const [ax, ay] = a.split(' ').map(Number)
    const [bx, by] = b.replace(' Z', '').split(' ').map(Number)
    expect(ax + ay).toBeCloseTo(bx + by, 2)
    expect(ax - ay).toBeCloseTo(-(bx - by), 2)
  })
  it('une ligne trop courte : pas de pointe', () => {
    expect(openGeometry({ open: true, width: 0.5, height: 0.5, strokeWidth: 4, path: 'M0 0 L100 100', ends: { end: 'arrow' } }).marks).toEqual([])
  })
})

describe('sanitizeOpen', () => {
  it('retire open et ends d\'un élément qui n\'est pas un tracé', () => {
    const e: Record<string, unknown> = { type: 'rect', open: true, ends: { end: 'arrow' } }
    sanitizeOpen(e)
    expect(e.open).toBeUndefined()
    expect(e.ends).toBeUndefined()
  })
  it('garde un tracé ouvert, nettoie ses extrémités et lui donne un contour s\'il n\'en a pas', () => {
    const e: Record<string, unknown> = { type: 'path', path: 'M0 0 L1 1', open: true, fill: '#ff0000', ends: { start: 'dot', end: 'laser' } }
    sanitizeOpen(e)
    expect(e.open).toBe(true)
    expect(e.ends).toEqual({ start: 'dot' })
    expect(e.stroke).toBe('#ff0000')
    expect(e.strokeWidth).toBe(4)
  })
  it('open autre que true : retiré', () => {
    const e: Record<string, unknown> = { type: 'path', path: 'M0 0 L1 1', open: 'oui', ends: { end: 'arrow' } }
    sanitizeOpen(e)
    expect(e.open).toBeUndefined()
    expect(e.ends).toBeUndefined()
  })
})
