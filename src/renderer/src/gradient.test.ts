import { describe, expect, it } from 'vitest'
import { cssGradient, defaultGradient, konvaGradientProps, lighten, linearGradientLine, radialGradientCircle, sanitizeGradient } from '@/gradient'

/** Position (0 à 1) d'un point le long de la ligne du dégradé. */
const t = (l: ReturnType<typeof linearGradientLine>, x: number, y: number): number => {
  const vx = l.x1 - l.x0, vy = l.y1 - l.y0
  return ((x - l.x0) * vx + (y - l.y0) * vy) / (vx * vx + vy * vy)
}

describe('linearGradientLine', () => {
  it('angles cardinaux', () => {
    const r = (a: number): number[] => Object.values(linearGradientLine(200, 100, a)).map((v) => Math.round(v * 1000) / 1000 + 0)
    expect(r(90)).toEqual([0, 50, 200, 50]) // vers la droite
    expect(r(180)).toEqual([100, 0, 100, 100]) // vers le bas
    expect(r(0)).toEqual([100, 100, 100, 0]) // vers le haut
    expect(r(270)).toEqual([200, 50, 0, 50]) // vers la gauche
  })

  it('un carré à 135° va du coin haut-gauche au coin bas-droit', () => {
    const l = linearGradientLine(100, 100, 135)
    expect([l.x0, l.y0, l.x1, l.y1].map((v) => Math.round(v) + 0)).toEqual([0, 0, 100, 100])
  })

  it('quelle que soit la boîte et l\'angle, les coins extrêmes tombent sur 0 et 1 et tout le reste entre les deux', () => {
    for (const [w, h] of [[100, 100], [300, 80], [40, 500], [1, 1000]])
      for (const angle of [0, 17, 45, 90, 135, 200, 271, 359]) {
        const l = linearGradientLine(w, h, angle)
        const ts = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => t(l, x, y))
        expect(Math.min(...ts), `${w}×${h} ${angle}°`).toBeCloseTo(0, 6)
        expect(Math.max(...ts), `${w}×${h} ${angle}°`).toBeCloseTo(1, 6)
      }
  })

  it('passe toujours par le centre', () => {
    const l = linearGradientLine(300, 120, 63)
    expect(t(l, 150, 60)).toBeCloseTo(0.5, 9)
  })
})

describe('radialGradientCircle', () => {
  it('centré, rayon jusqu\'au coin le plus éloigné', () => {
    expect(radialGradientCircle(300, 400)).toEqual({ cx: 150, cy: 200, r: 250 })
  })
})

describe('lighten', () => {
  it('mélange avec du blanc', () => {
    expect(lighten('#000000', 0.5)).toBe('#808080')
    expect(lighten('#7c5cff', 0)).toBe('#7c5cff')
    expect(lighten('#7c5cff', 1)).toBe('#ffffff')
  })
  it('format inattendu : inchangé', () => {
    expect(lighten('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)')
  })
})

describe('defaultGradient', () => {
  it('part de la couleur actuelle vers une version plus claire, en diagonale', () => {
    const g = defaultGradient('#336699')
    expect(g).toMatchObject({ type: 'linear', from: '#336699', angle: 135 })
    expect(g.to).not.toBe(g.from)
  })
})

describe('konvaGradientProps', () => {
  it('aucun dégradé : rien', () => expect(konvaGradientProps(undefined, 100, 100)).toEqual({}))
  it('linéaire : priorité, points et arrêts', () => {
    const p = konvaGradientProps({ type: 'linear', from: '#f00', to: '#00f', angle: 90 }, 200, 100)
    expect(p.fillPriority).toBe('linear-gradient')
    const s = p.fillLinearGradientStartPoint as { x: number; y: number }
    const e = p.fillLinearGradientEndPoint as { x: number; y: number }
    expect([s.x, s.y, e.x, e.y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 50, 200, 50])
    expect(p.fillLinearGradientColorStops).toEqual([0, '#f00', 1, '#00f'])
  })
  it('radial : cercle centré', () => {
    const p = konvaGradientProps({ type: 'radial', from: '#f00', to: '#00f', angle: 0 }, 200, 100)
    expect(p.fillPriority).toBe('radial-gradient')
    expect(p.fillRadialGradientStartRadius).toBe(0)
    expect(p.fillRadialGradientEndRadius).toBeCloseTo(Math.hypot(200, 100) / 2)
  })
})

describe('cssGradient', () => {
  it('même sémantique d\'angle que CSS', () => {
    expect(cssGradient({ type: 'linear', from: '#a', to: '#b', angle: 45 })).toBe('linear-gradient(45deg, #a, #b)')
    expect(cssGradient({ type: 'radial', from: '#a', to: '#b', angle: 0 })).toBe('radial-gradient(circle farthest-corner, #a, #b)')
  })
})

describe('sanitizeGradient', () => {
  it('garde un dégradé valide et ramène l\'angle dans [0, 360[', () => {
    const e: Record<string, unknown> = { gradient: { type: 'linear', from: '#fff', to: '#000', angle: -90 } }
    sanitizeGradient(e)
    expect(e.gradient).toEqual({ type: 'linear', from: '#fff', to: '#000', angle: 270 })
  })
  it('angle absent ou invalide : valeur par défaut', () => {
    const e: Record<string, unknown> = { gradient: { type: 'radial', from: '#fff', to: '#000', angle: 'x' } }
    sanitizeGradient(e)
    expect((e.gradient as { angle: number }).angle).toBe(135)
  })
  it('retire tout dégradé incomplet ou de type inconnu', () => {
    for (const bad of [null, 5, 'x', {}, { type: 'conic', from: '#f', to: '#0' }, { type: 'linear', from: '', to: '#0' }, { type: 'linear', from: '#f' }]) {
      const e: Record<string, unknown> = { gradient: bad }
      sanitizeGradient(e)
      expect(e, JSON.stringify(bad)).not.toHaveProperty('gradient')
    }
  })
  it('sans dégradé : ne touche à rien', () => {
    const e: Record<string, unknown> = { fill: '#fff' }
    sanitizeGradient(e)
    expect(e).toEqual({ fill: '#fff' })
  })
})
