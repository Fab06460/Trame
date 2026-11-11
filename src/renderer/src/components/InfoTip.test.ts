import { describe, expect, it } from 'vitest'
import { tipPosition } from './InfoTip'

const r = (left: number, top: number) => ({ left, top, right: left + 16, bottom: top + 16 })

describe('position de la bulle d’info', () => {
  it('se place sous la pastille, centrée', () => {
    const p = tipPosition(r(400, 100), 60, 1200, 800)
    expect(p.top).toBe(122)
    expect(p.left).toBe(408 - 130)
  })
  it('passe au-dessus quand il n’y a pas la place dessous', () => {
    const p = tipPosition(r(400, 760), 80, 1200, 800)
    expect(p.top).toBe(760 - 6 - 80)
  })
  it('reste dans la fenêtre à gauche et à droite', () => {
    expect(tipPosition(r(2, 100), 60, 1200, 800).left).toBe(8)
    expect(tipPosition(r(1190, 100), 60, 1200, 800).left).toBe(1200 - 260 - 8)
  })
  it('reste dans la fenêtre si elle est très petite', () => {
    const p = tipPosition(r(10, 10), 500, 200, 300)
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })
})
