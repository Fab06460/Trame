import { describe, expect, it } from 'vitest'
import { COLOR_VISIONS, colorVisionFilter, colorVisionMatrix, easyReadingPatch } from './readability'
import type { TrameElement } from './types'

const t = (extra: Partial<TrameElement> = {}): TrameElement => ({ id: 'a', type: 'text', x: 0, y: 0, width: 300, height: 40, rotation: 0, opacity: 1, fill: '#000', text: 'x', fontSize: 40, fontFamily: '"Inter", sans-serif', fontStyle: 'italic', ...extra })

describe('lecture facilitée', () => {
  const font = '"Atkinson Hyperlegible", sans-serif'
  it('police lisible, plus d\'italique, interligne 1,5, interlettrage 5 % de la taille', () => {
    expect(easyReadingPatch(t(), font)).toEqual({ fontFamily: font, fontStyle: 'normal', lineHeight: 1.5, letterSpacing: 2 })
  })
  it('le gras est gardé, les majuscules forcées retirées', () => {
    const p = easyReadingPatch(t({ fontStyle: 'italic bold', uppercase: true }), font)!
    expect(p.fontStyle).toBe('bold')
    expect('uppercase' in p && p.uppercase === undefined).toBe(true)
  })
  it('un réglage déjà plus généreux est conservé', () => {
    const p = easyReadingPatch(t({ lineHeight: 2, letterSpacing: 5, fontStyle: 'normal' }), font)!
    expect(p.lineHeight).toBeUndefined()
    expect(p.letterSpacing).toBeUndefined()
  })
  it('déjà conforme ou pas un texte : rien', () => {
    expect(easyReadingPatch(t({ fontFamily: font, fontStyle: 'bold', lineHeight: 1.6, letterSpacing: 3 }), font)).toBeNull()
    expect(easyReadingPatch(t({ type: 'rect' }), font)).toBeNull()
  })
})

describe('simulation de la vision des couleurs', () => {
  it('une matrice 4 × 5 par simulation, sauf « normale »', () => {
    for (const v of COLOR_VISIONS) {
      if (v === 'none') expect(colorVisionFilter(v)).toBeUndefined()
      else {
        expect(colorVisionMatrix(v).trim().split(/\s+/)).toHaveLength(20)
        expect(colorVisionFilter(v)).toBe(`url(#trame-cv-${v})`)
      }
    }
  })
})
