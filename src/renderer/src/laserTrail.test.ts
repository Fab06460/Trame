import { describe, expect, it } from 'vitest'
import { pushTrail, trailAlpha, TRAIL_MS } from './laserTrail'

describe('traînée du pointeur laser', () => {
  it('ajoute les points et retire ceux qui sont trop anciens', () => {
    let t = pushTrail([], { x: 0, y: 0, t: 0 })
    t = pushTrail(t, { x: 50, y: 0, t: 100 })
    expect(t).toHaveLength(2)
    t = pushTrail(t, { x: 100, y: 0, t: TRAIL_MS + 50 })
    expect(t.map((p) => p.x)).toEqual([50, 100])
  })

  it('fusionne les relevés quasi identiques', () => {
    const t = pushTrail(pushTrail([], { x: 10, y: 10, t: 0 }), { x: 11, y: 10, t: 5 })
    expect(t).toEqual([{ x: 11, y: 10, t: 5 }])
  })

  it('plafonne le nombre de points et ne modifie pas son argument', () => {
    let t: ReturnType<typeof pushTrail> = []
    for (let i = 0; i < 500; i++) t = pushTrail(t, { x: i * 10, y: 0, t: i / 10 })
    expect(t.length).toBeLessThanOrEqual(64)
    const frozen = Object.freeze([{ x: 0, y: 0, t: 0 }])
    expect(() => pushTrail(frozen, { x: 40, y: 0, t: 10 })).not.toThrow()
  })

  it("l'opacité décroît de 1 à 0", () => {
    const p = { x: 0, y: 0, t: 1000 }
    expect(trailAlpha(p, 1000)).toBe(1)
    expect(trailAlpha(p, 1000 + TRAIL_MS / 2)).toBeCloseTo(0.5)
    expect(trailAlpha(p, 1000 + TRAIL_MS * 2)).toBe(0)
  })
})
