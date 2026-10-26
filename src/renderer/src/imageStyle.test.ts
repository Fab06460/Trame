import { describe, expect, it } from 'vitest'
import { activeFilters, clampCrop, cropInsets, cssFilter, editKey, hasImageEdits, recrop, sanitizeImageStyle } from '@/imageStyle'

const el = { x: 100, y: 50, width: 400, height: 300, rotation: 0 }

describe('imageStyle', () => {
  it('sans retouche, rien à refaire', () => {
    expect(hasImageEdits({})).toBe(false)
    expect(hasImageEdits({ filters: { blur: 0, sepia: 0 } })).toBe(false)
    expect(hasImageEdits({ flipX: true })).toBe(true)
    expect(hasImageEdits({ crop: { x: 0, y: 0, width: 0.5, height: 1 } })).toBe(true)
    expect(hasImageEdits({ filters: { grayscale: 30 } })).toBe(true)
  })

  it('traduit les réglages en filtre CSS, flou mis à l\'échelle', () => {
    expect(cssFilter({})).toBe('none')
    expect(cssFilter({ filters: { brightness: 20, saturation: -50 } })).toBe('brightness(1.200) saturate(0.500)')
    expect(cssFilter({ filters: { blur: 4 } }, 2.5)).toBe('blur(10.00px)')
    expect(activeFilters({ filters: { contrast: 0, sepia: 10 } })).toEqual({ sepia: 10 })
  })

  it('clé de cache : identique pour des retouches identiques, différente sinon', () => {
    expect(editKey({ filters: { sepia: 0 } })).toBe(editKey({}))
    expect(editKey({ flipX: true })).not.toBe(editKey({}))
    expect(editKey({ filters: { sepia: 10 } })).not.toBe(editKey({ filters: { sepia: 20 } }))
  })

  it('borne un recadrage dans l\'image', () => {
    expect(clampCrop({ x: -1, y: 0.9, width: 5, height: 0.5 })).toEqual({ x: 0, y: 0.5, width: 1, height: 0.5 })
    expect(clampCrop({ x: 0.5, y: 0, width: 0, height: 1 }).width).toBe(0.05)
  })

  it('recadrer garde le contenu visible en place', () => {
    // on retire 25 % à gauche et 50 % en bas : l'échelle (400 px pour 100 %) est conservée
    const p = recrop(el, { x: 0.25, y: 0, width: 0.75, height: 0.5 })
    expect(p).toMatchObject({ x: 200, y: 50, width: 300, height: 150, crop: { x: 0.25, y: 0, width: 0.75, height: 0.5 } })
  })

  it('recadrer un élément pivoté déplace le coin le long de ses axes tournés', () => {
    const p = recrop({ ...el, rotation: 90 }, { x: 0.25, y: 0, width: 0.75, height: 1 })
    expect(p.x).toBeCloseTo(100, 6)
    expect(p.y).toBeCloseTo(150, 6) // 100 px vers la droite de l'élément = vers le bas de la page
  })

  it('recadrer à nouveau repart de la zone déjà recadrée', () => {
    const first = recrop(el, { x: 0.5, y: 0, width: 0.5, height: 1 }) // moitié droite : 200 px de large
    const second = recrop({ ...el, ...first, rotation: 0 }, { x: 0.5, y: 0, width: 0.25, height: 1 })
    expect(second.width).toBeCloseTo(100)
    expect(second.x).toBeCloseTo(300)
  })

  it('rétablir l\'image entière retire le recadrage', () => {
    const first = recrop(el, { x: 0.5, y: 0, width: 0.5, height: 1 })
    const back = recrop({ ...el, ...first, rotation: 0 }, { x: 0, y: 0, width: 1, height: 1 })
    expect(back).toMatchObject({ x: 100, y: 50, width: 400, height: 300 })
    expect(back.crop).toBeUndefined()
  })

  it('marges en % de l\'image d\'origine', () => {
    const i = cropInsets({ crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } })
    expect([i.left, i.top, i.right, i.bottom].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([10, 20, 40, 30])
  })

  it('nettoie les données invalides à la lecture', () => {
    const e: Record<string, unknown> = { crop: { x: 'a' }, flipX: 'oui', flipY: true, filters: { blur: 999, sepia: 0, contrast: 'x', brightness: -250 } }
    sanitizeImageStyle(e)
    expect(e).toEqual({ flipY: true, filters: { blur: 40, brightness: -100 } })
    const whole: Record<string, unknown> = { crop: { x: 0, y: 0, width: 1, height: 1 }, filters: {} }
    sanitizeImageStyle(whole)
    expect(whole).toEqual({})
    const ok: Record<string, unknown> = { crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.5 } }
    sanitizeImageStyle(ok)
    expect(ok.crop).toEqual({ x: 0.2, y: 0.1, width: 0.5, height: 0.5 })
  })
})
