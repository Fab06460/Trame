import { describe, expect, it } from 'vitest'
import { bubblePosition } from './Tour'

const vw = 1400
const vh = 900
const h = 190

describe('position de la bulle de la visite guidée', () => {
  it('sans cible, au milieu de l’écran', () => {
    const p = bubblePosition(null, h, vw, vh)
    expect(p.left).toBeCloseTo((vw - 330) / 2)
    expect(p.top).toBeCloseTo((vh - h) / 2)
  })

  it('à droite d’une cible étroite à gauche (la colonne d’onglets)', () => {
    const p = bubblePosition({ left: 0, top: 50, right: 60, bottom: 800 }, h, vw, vh)
    expect(p.left).toBe(60 + 14)
    expect(p.top).toBe(50)
  })

  it('à gauche d’une cible collée au bord droit', () => {
    const p = bubblePosition({ left: 1100, top: 50, right: 1400, bottom: 850 }, h, vw, vh)
    expect(p.left + 330).toBeLessThanOrEqual(1100 - 14)
  })

  it('au-dessus d’une cible en bas de l’écran, sans sortir de la fenêtre', () => {
    const p = bubblePosition({ left: 100, top: 820, right: 1300, bottom: 890 }, h, vw, vh)
    expect(p.top + h).toBeLessThanOrEqual(820 - 14)
    expect(p.left).toBeGreaterThanOrEqual(12)
  })

  it('une cible qui remplit l’écran : la bulle reste entièrement visible', () => {
    const p = bubblePosition({ left: 0, top: 0, right: vw, bottom: vh }, h, vw, vh)
    expect(p.left).toBeGreaterThanOrEqual(12)
    expect(p.top).toBeGreaterThanOrEqual(12)
    expect(p.left + 330).toBeLessThanOrEqual(vw - 12)
    expect(p.top + h).toBeLessThanOrEqual(vh - 12)
  })
})
