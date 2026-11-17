import { describe, expect, it } from 'vitest'
import { isVertical } from './DrawBar'

describe('disposition de la barre de dessin', () => {
  it('en colonne près d\'un côté, à plat en haut, en bas et au milieu', () => {
    expect(isVertical(20, 300, 1000, 700)).toBe(true)
    expect(isVertical(980, 300, 1000, 700)).toBe(true)
    expect(isVertical(500, 20, 1000, 700)).toBe(false)
    expect(isVertical(500, 680, 1000, 700)).toBe(false)
    expect(isVertical(500, 350, 1000, 700)).toBe(false)
  })
  it('dans un coin, le bord le plus proche décide', () => {
    expect(isVertical(20, 60, 1000, 700)).toBe(true)
    expect(isVertical(60, 20, 1000, 700)).toBe(false)
  })
})
