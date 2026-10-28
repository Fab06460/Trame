import { describe, expect, it } from 'vitest'
import { fitStep, MAX_TIER, type FitState } from './toolbarFit'

/** Simule une barre dont le contenu mesure `widths[tier]` px dans une fenêtre de `client` px, jusqu'à stabilité. */
function settle(start: FitState, client: number, widths: number[]): FitState {
  let s = start
  for (let i = 0; i < 20; i++) {
    const next = fitStep(s, client, Math.max(client, widths[s.tier]))
    if (next === s) return s
    s = next
  }
  throw new Error('oscillation')
}

const widths = [1500, 1300, 1100, 950, 800]

describe('repli de la barre d\'outils', () => {
  it('assez large : palier 0', () => {
    expect(settle({ tier: 0, natural: [] }, 1600, widths).tier).toBe(0)
  })
  it('monte d\'autant de paliers que nécessaire', () => {
    expect(settle({ tier: 0, natural: [] }, 1200, widths).tier).toBe(2)
    expect(settle({ tier: 0, natural: [] }, 900, widths).tier).toBe(4)
  })
  it('ne dépasse pas le dernier palier même si ça déborde encore', () => {
    expect(settle({ tier: 0, natural: [] }, 500, widths).tier).toBe(MAX_TIER)
  })
  it('redescend quand la fenêtre grandit, sans osciller à la limite', () => {
    let s = settle({ tier: 0, natural: [] }, 900, widths)
    expect(s.tier).toBe(4)
    s = settle(s, 1150, widths)
    expect(s.tier).toBe(2)
    s = settle(s, 1299, widths) // le palier 1 mesurait 1300 : pas encore
    expect(s.tier).toBe(2)
    s = settle(s, 1300, widths)
    expect(s.tier).toBe(1)
    s = settle(s, 2000, widths)
    expect(s.tier).toBe(0)
  })
  it('un palier jamais traversé (fenêtre ouverte étroite) ne permet pas de redescendre à l\'aveugle', () => {
    // démarrage au palier 3 sans historique : on ne sait pas si le 2 tiendrait, on reste
    expect(fitStep({ tier: 3, natural: [] }, 5000, 5000).tier).toBe(3)
  })
})
