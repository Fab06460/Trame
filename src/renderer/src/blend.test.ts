import { describe, expect, it } from 'vitest'
import { BLEND_MODES, PDF_BLEND, blendOf, compositeOf, cssBlendOf, isBlended, sanitizeBlend } from './blend'

describe('blend', () => {
  it('a un nom PDF pour chaque mode', () => {
    for (const m of BLEND_MODES) expect(PDF_BLEND[m]).toMatch(/^[A-Z][A-Za-z]+$/)
    expect(PDF_BLEND['color-dodge']).toBe('ColorDodge')
  })
  it('le mode normal ne change rien', () => {
    expect(blendOf({})).toBe('normal')
    expect(isBlended({})).toBe(false)
    expect(compositeOf({})).toBeUndefined()
    expect(cssBlendOf({ blend: 'normal' })).toBeUndefined()
  })
  it('donne le mode au canvas et à CSS', () => {
    expect(compositeOf({ blend: 'multiply' })).toBe('multiply')
    expect(cssBlendOf({ blend: 'soft-light' })).toBe('soft-light')
    expect(isBlended({ blend: 'screen' })).toBe(true)
  })
  it('ignore une valeur inconnue', () => {
    expect(blendOf({ blend: 'plouf' as never })).toBe('normal')
  })
  it('nettoie à la lecture : seul un mode connu autre que normal reste', () => {
    const keep = { blend: 'overlay' }
    sanitizeBlend(keep)
    expect(keep.blend).toBe('overlay')
    for (const bad of ['normal', 'plouf', 3, null, undefined]) {
      const e: Record<string, unknown> = { blend: bad }
      sanitizeBlend(e)
      expect('blend' in e).toBe(false)
    }
  })
})
