import { describe, expect, it } from 'vitest'
import { lineFromPoints, simplify, smoothPath, snapAngle, strokeFromPoints } from './freehand'

describe('simplify', () => {
  it('garde les extrémités et retire les points alignés', () => {
    const line = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }))
    expect(simplify(line, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
  })
  it('garde un coude qui dépasse la tolérance', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0.2 }, { x: 100, y: 50 }]
    expect(simplify(pts, 1)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0.2 }, { x: 100, y: 50 }])
  })
  it('moins de trois points : tels quels', () => {
    expect(simplify([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }])
  })
})

describe('smoothPath', () => {
  it('un segment pour deux points, une courbe par intervalle au-delà', () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe('M0 0 L10 10')
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }])
    expect(d.startsWith('M0 0 C')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(2)
    expect(d.endsWith('20 0')).toBe(true)
  })
})

describe('strokeFromPoints', () => {
  it('rend la boîte du trait et un chemin dans le viewBox 100 × 100', () => {
    const d = strokeFromPoints([{ x: 100, y: 200 }, { x: 150, y: 250 }, { x: 200, y: 300 }], 1)!
    expect(d).toMatchObject({ x: 100, y: 200, width: 100, height: 100 })
    expect(d.path.startsWith('M0 0')).toBe(true)
    expect(d.path.endsWith('100 100')).toBe(true)
  })
  it('un clic sans mouvement : une boîte de 1 px, centrée sur le point', () => {
    const d = strokeFromPoints([{ x: 40, y: 60 }], 1)!
    expect(d.x).toBeCloseTo(39.5, 1)
    expect(d.y).toBeCloseTo(59.5, 1)
    expect([d.width, d.height]).toEqual([1, 1])
  })
  it('un trait horizontal garde une hauteur de 1 px, centré', () => {
    const d = strokeFromPoints([{ x: 0, y: 10 }, { x: 100, y: 10 }], 1)!
    expect(d).toMatchObject({ x: 0, y: 9.5, width: 100, height: 1 })
    expect(d.path).toBe('M0 50 L100 50')
  })
  it('aucun point : rien', () => {
    expect(strokeFromPoints([], 1)).toBeNull()
    expect(strokeFromPoints([{ x: NaN, y: 0 }], 1)).toBeNull()
  })
})

describe('lineFromPoints / snapAngle', () => {
  it('garde le sens : le début reste le premier point', () => {
    expect(lineFromPoints({ x: 0, y: 0 }, { x: 100, y: 50 }).path).toBe('M0 0 L100 100')
    expect(lineFromPoints({ x: 100, y: 0 }, { x: 0, y: 50 }).path).toBe('M100 0 L0 100')
    expect(lineFromPoints({ x: 0, y: 50 }, { x: 100, y: 0 }).path).toBe('M0 100 L100 0')
  })
  it('ramène à un multiple de 15°', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 100, y: 3 })
    expect(p.y).toBeCloseTo(0, 5)
    expect(p.x).toBeCloseTo(Math.hypot(100, 3), 5)
    const q = snapAngle({ x: 0, y: 0 }, { x: 100, y: 95 }, 45)
    expect(q.x).toBeCloseTo(q.y, 5)
  })
})
