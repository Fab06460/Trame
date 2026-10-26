import { describe, expect, it } from 'vitest'
import { SHADOW_LIMITS, cssShadow, dropShadow, glow, hasShadow, sanitizeShadow, shadowMargin, shadowProps } from '@/shadowStyle'

const sh = { color: '#112233', blur: 10, offsetX: 4, offsetY: -6, opacity: 0.5 }

describe('hasShadow', () => {
  it('exige une ombre visible : opacité > 0 et (flou ou décalage)', () => {
    expect(hasShadow({})).toBe(false)
    expect(hasShadow({ shadow: sh })).toBe(true)
    expect(hasShadow({ shadow: { ...sh, opacity: 0 } })).toBe(false)
    expect(hasShadow({ shadow: { ...sh, blur: 0, offsetX: 0, offsetY: 0 } })).toBe(false)
    expect(hasShadow({ shadow: { ...sh, blur: 0, offsetX: 0, offsetY: 3 } })).toBe(true) // ombre dure décalée
    expect(hasShadow({ shadow: { ...sh, blur: 8, offsetX: 0, offsetY: 0 } })).toBe(true) // lueur
  })
})

describe('préréglages', () => {
  it('ombre portée : décalée vers le bas ; lueur : sans décalage, de la couleur donnée', () => {
    expect(dropShadow()).toMatchObject({ offsetX: 0, offsetY: 10, color: '#000000' })
    expect(glow('#ffd166')).toMatchObject({ offsetX: 0, offsetY: 0, color: '#ffd166' })
    expect(hasShadow({ shadow: dropShadow() })).toBe(true)
    expect(hasShadow({ shadow: glow('#fff') })).toBe(true)
  })
})

describe('shadowProps', () => {
  it('désactivée sans ombre visible', () => {
    expect(shadowProps({})).toEqual({ shadowEnabled: false })
    expect(shadowProps({ shadow: { ...sh, opacity: 0 } })).toEqual({ shadowEnabled: false })
  })
  it('propriétés Konva', () => {
    expect(shadowProps({ shadow: sh })).toEqual({ shadowEnabled: true, shadowColor: '#112233', shadowBlur: 10, shadowOffsetX: 4, shadowOffsetY: -6, shadowOpacity: 0.5 })
  })
})

describe('shadowMargin', () => {
  it('1,5 × le flou + le plus grand décalage + 2', () => {
    expect(shadowMargin({ shadow: { ...sh, blur: 20, offsetX: 3, offsetY: -12 } })).toBe(44) // 30 + 12 + 2
    expect(shadowMargin({})).toBe(0)
  })
})

describe('cssShadow', () => {
  it('drop-shadow équivalent', () => {
    expect(cssShadow({ shadow: sh })).toBe('drop-shadow(4px -6px 10px rgba(17, 34, 51, 0.5))')
    expect(cssShadow({})).toBeUndefined()
  })
})

describe('sanitizeShadow', () => {
  it('borne les valeurs', () => {
    const e: Record<string, unknown> = { shadow: { color: '#000', blur: 9999, offsetX: -9999, offsetY: 9999, opacity: 7 } }
    sanitizeShadow(e)
    expect(e.shadow).toEqual({ color: '#000', blur: SHADOW_LIMITS.blur.max, offsetX: SHADOW_LIMITS.offset.min, offsetY: SHADOW_LIMITS.offset.max, opacity: 1 })
  })
  it('retire toute ombre incomplète ou invalide', () => {
    for (const bad of [null, 3, 'x', {}, { ...sh, color: '' }, { ...sh, blur: 'x' }, { ...sh, offsetX: NaN }, { color: '#000', blur: 1, offsetX: 0, offsetY: 0 }]) {
      const e: Record<string, unknown> = { shadow: bad }
      sanitizeShadow(e)
      expect(e, JSON.stringify(bad)).not.toHaveProperty('shadow')
    }
  })
  it('sans ombre : ne touche à rien', () => {
    const e: Record<string, unknown> = { fill: '#fff' }
    sanitizeShadow(e)
    expect(e).toEqual({ fill: '#fff' })
  })
})
