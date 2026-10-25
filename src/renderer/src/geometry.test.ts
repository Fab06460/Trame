import { describe, expect, it } from 'vitest'
import { alignDeltas, boundsOf, distributeDeltas, intersects, unionBox } from '@/geometry'
import type { TrameElement } from '@/types'

const el = (id: string, x: number, y: number, width: number, height: number, rotation = 0): TrameElement => ({
  id, type: 'rect', x, y, width, height, rotation, opacity: 1, fill: '#000'
})

const dx = (m: Map<string, { dx: number; dy: number }>, id: string): number => m.get(id)!.dx
const dy = (m: Map<string, { dx: number; dy: number }>, id: string): number => m.get(id)!.dy

describe('boundsOf', () => {
  it('renvoie la boîte telle quelle sans rotation', () => {
    expect(boundsOf(el('a', 10, 20, 100, 50))).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('tourne autour du coin haut-gauche : 90° bascule la boîte à gauche du point d’ancrage', () => {
    const b = boundsOf(el('a', 100, 100, 40, 10, 90))
    expect(b.x).toBeCloseTo(90)
    expect(b.y).toBeCloseTo(100)
    expect(b.width).toBeCloseTo(10)
    expect(b.height).toBeCloseTo(40)
  })

  it('180° place la boîte en haut-gauche de l’ancrage', () => {
    const b = boundsOf(el('a', 100, 100, 40, 10, 180))
    expect(b.x).toBeCloseTo(60)
    expect(b.y).toBeCloseTo(90)
    expect(b.width).toBeCloseTo(40)
    expect(b.height).toBeCloseTo(10)
  })

  it('45° d’un carré : la diagonale devient la largeur', () => {
    const b = boundsOf(el('a', 0, 0, 100, 100, 45))
    expect(b.width).toBeCloseTo(100 * Math.SQRT2)
    expect(b.height).toBeCloseTo(100 * Math.SQRT2)
  })
})

describe('unionBox / intersects', () => {
  it('englobe plusieurs boîtes', () => {
    expect(unionBox([{ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 20, width: 10, height: 30 }])).toEqual({
      x: 0, y: 0, width: 60, height: 50
    })
  })

  it('détecte le chevauchement', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(intersects(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(intersects(a, { x: 20, y: 0, width: 10, height: 10 })).toBe(false)
  })

  it('deux boîtes qui se touchent seulement par un bord ne se chevauchent pas', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(intersects(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false)
  })
})

describe('alignDeltas', () => {
  const target = { x: 0, y: 0, width: 200, height: 100 }
  const a = el('a', 20, 30, 40, 10)

  it.each([
    ['left', -20, 0],
    ['hcenter', 60, 0],
    ['right', 140, 0],
    ['top', 0, -30],
    ['vcenter', 0, 15],
    ['bottom', 0, 60]
  ] as const)('%s', (mode, ex, ey) => {
    const m = alignDeltas([a], mode, target)
    expect(dx(m, 'a')).toBeCloseTo(ex)
    expect(dy(m, 'a')).toBeCloseTo(ey)
  })

  it('tient compte de la rotation (boîte englobante)', () => {
    // 90° : la boîte occupe x ∈ [90, 100] ; aligner à gauche de x=0 → dx = -90
    const m = alignDeltas([el('r', 100, 0, 40, 10, 90)], 'left', target)
    expect(dx(m, 'r')).toBeCloseTo(-90)
  })
})

describe('distributeDeltas', () => {
  it('égalise les écarts horizontaux, sans dépendre de l’ordre d’entrée', () => {
    const els = [el('c', 100, 0, 10, 10), el('a', 0, 0, 10, 10), el('b', 15, 0, 10, 10)]
    const m = distributeDeltas(els, 'h')
    expect(dx(m, 'a')).toBeCloseTo(0)
    expect(dx(m, 'b')).toBeCloseTo(35) // b passe de 15 à 50 : écart 40 de chaque côté
    expect(dx(m, 'c')).toBeCloseTo(0)
    expect(dy(m, 'b')).toBe(0)
  })

  it('gère des largeurs différentes et l’axe vertical', () => {
    const els = [el('a', 0, 0, 10, 10), el('b', 0, 12, 10, 30), el('c', 0, 100, 10, 20)]
    const m = distributeDeltas(els, 'v')
    // étendue 0..120, hauteurs 10+30+20=60 → écart 30
    expect(dy(m, 'a')).toBeCloseTo(0)
    expect(dy(m, 'b')).toBeCloseTo(40 - 12)
    expect(dy(m, 'c')).toBeCloseTo(0)
    expect(dx(m, 'b')).toBe(0)
  })
})
