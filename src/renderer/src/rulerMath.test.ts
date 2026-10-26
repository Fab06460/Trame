import { describe, expect, it } from 'vitest'
import { rulerTicks } from '@/rulerMath'

describe('rulerTicks', () => {
  it('à 100 % : un libellé tous les 100 px, secondaires tous les 20 px', () => {
    const t = rulerTicks(0, 400, 1)
    expect(t.filter((x) => x.major).map((x) => x.value)).toEqual([0, 100, 200, 300, 400])
    expect(t.filter((x) => !x.major).map((x) => x.value).slice(0, 4)).toEqual([20, 40, 60, 80])
  })

  it('dézoomé : le pas augmente pour garder les libellés lisibles', () => {
    const major = rulerTicks(0, 2000, 0.25).filter((x) => x.major).map((x) => x.value)
    expect(major).toEqual([0, 500, 1000, 1500, 2000]) // 500 px × 0,25 = 125 px écran entre deux libellés
  })

  it('zoomé : le pas diminue, jusqu\'à 1 px', () => {
    const t = rulerTicks(0, 20, 20)
    expect(t.filter((x) => x.major).map((x) => x.value)).toEqual([0, 5, 10, 15, 20])
  })

  it('l\'espacement des libellés n\'est jamais inférieur au minimum demandé', () => {
    for (const scale of [0.05, 0.1, 0.33, 0.5, 0.8, 1, 1.7, 3, 8]) {
      const m = rulerTicks(0, 10000 / scale > 5000 ? 5000 : 10000 / scale, scale).filter((x) => x.major)
      if (m.length > 1) expect((m[1].value - m[0].value) * scale, `échelle ${scale}`).toBeGreaterThanOrEqual(70)
    }
  })

  it('inclut les valeurs négatives (au-delà du bord de la page)', () => {
    const t = rulerTicks(-250, 50, 1)
    expect(t.some((x) => x.major && x.value === -200)).toBe(true)
    expect(t.some((x) => x.value === 0 && x.major)).toBe(true)
  })

  it('pas de graduation secondaire quand elles seraient trop serrées (échelles extrêmes)', () => {
    // à 0,0001 le plus grand pas disponible (50 000) ne laisse que 5 px entre libellés : le cinquième (1 px) serait illisible
    expect(rulerTicks(0, 200000, 0.0001).every((x) => x.major)).toBe(true)
    // à une échelle normale, les graduations secondaires existent bien
    expect(rulerTicks(0, 1000, 0.5).some((x) => !x.major)).toBe(true)
  })

  it('entrées invalides : aucune graduation, jamais de boucle infinie', () => {
    expect(rulerTicks(10, 10, 1)).toEqual([])
    expect(rulerTicks(0, 100, 0)).toEqual([])
    expect(rulerTicks(0, 1e9, 1e-6).length).toBeLessThanOrEqual(2000)
  })
})
