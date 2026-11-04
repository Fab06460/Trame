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

import { coverCrop } from '@/imageStyle'

describe('coverCrop', () => {
  it('image plus large que la boîte : on garde le milieu en largeur', () => {
    const c = coverCrop(100, 100, 400, 200)!
    expect(c.height).toBe(1)
    expect(c.width).toBeCloseTo(0.5)
    expect(c.x).toBeCloseTo(0.25)
  })
  it('image plus haute que la boîte : on garde le milieu en hauteur', () => {
    const c = coverCrop(200, 100, 100, 300)!
    expect(c.width).toBe(1)
    expect(c.height).toBeCloseTo(1 / 6) // 100 px de large pour une boîte deux fois plus large que haute : 50 px de haut sur 300
    expect(c.y).toBeCloseTo((1 - 1 / 6) / 2)
  })
  it('mêmes proportions : pas de recadrage ; valeurs invalides aussi', () => {
    expect(coverCrop(200, 100, 400, 200)).toBeUndefined()
    expect(coverCrop(0, 100, 400, 200)).toBeUndefined()
  })
  it('le recadrage couvre exactement la boîte (mêmes proportions que la boîte)', () => {
    const c = coverCrop(300, 200, 1000, 1000)!
    expect((c.width * 1000) / (c.height * 1000)).toBeCloseTo(300 / 200)
  })
})

import { MASKS, STRAIGHTEN_LIMIT, hasMask, hasStraighten, isMask, straightenScale } from '@/imageStyle'

describe('cadre et redressement', () => {
  it('un cadre ou un redressement comptent comme une retouche', () => {
    expect(hasImageEdits({})).toBe(false)
    expect(hasImageEdits({ mask: 'ellipse' })).toBe(true)
    expect(hasImageEdits({ straighten: 3 })).toBe(true)
    expect(hasImageEdits({ mask: 'inconnu' })).toBe(false)
    expect(hasImageEdits({ straighten: 0 })).toBe(false)
  })
  it('la clé de cache change avec le cadre et l’angle', () => {
    expect(editKey({ mask: 'ellipse' })).not.toBe(editKey({}))
    expect(editKey({ mask: 'ellipse' })).not.toBe(editKey({ mask: 'star' }))
    expect(editKey({ straighten: 2 })).not.toBe(editKey({ straighten: 3 }))
    expect(editKey({ mask: 'inconnu' })).toBe(editKey({}))
  })
  it('les cadres proposés sont l’ellipse, l’arrondi et les formes de Trame', () => {
    expect(MASKS.slice(0, 2)).toEqual(['ellipse', 'rounded'])
    expect(MASKS).toContain('heart')
    expect(isMask('star')).toBe(true)
    expect(isMask('nimporte')).toBe(false)
    expect(hasMask({ mask: 'rounded' })).toBe(true)
    expect(hasStraighten({ straighten: -2 })).toBe(true)
  })
  it('l’agrandissement du redressement garde la boîte remplie', () => {
    expect(straightenScale(100, 100, 0)).toBeCloseTo(1)
    // 10° sur un carré : cos + sin
    expect(straightenScale(100, 100, 10)).toBeCloseTo(Math.cos((10 * Math.PI) / 180) + Math.sin((10 * Math.PI) / 180))
    // symétrique en angle
    expect(straightenScale(200, 100, -7)).toBeCloseTo(straightenScale(200, 100, 7))
    // vérifié par construction : les quatre coins de la boîte restent dans l'image tournée et agrandie
    for (const [w, h, deg] of [[200, 100, 12], [100, 300, -20], [150, 150, 45]] as const) {
      const s = straightenScale(w, h, deg)
      const r = (deg * Math.PI) / 180
      for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
        // coin de la boîte exprimé dans le repère de l'image (rotation inverse, échelle inverse)
        const ix = (cx * Math.cos(r) + cy * Math.sin(r)) / s
        const iy = (-cx * Math.sin(r) + cy * Math.cos(r)) / s
        expect(Math.abs(ix)).toBeLessThanOrEqual(w / 2 + 1e-6)
        expect(Math.abs(iy)).toBeLessThanOrEqual(h / 2 + 1e-6)
      }
    }
  })
  it('lecture : un cadre inconnu et un angle nul sont retirés, l’angle est borné', () => {
    const e: Record<string, unknown> = { mask: 'nimporte', straighten: 0 }
    sanitizeImageStyle(e)
    expect(e).toEqual({})
    const f: Record<string, unknown> = { mask: 'heart', straighten: 99.37 }
    sanitizeImageStyle(f)
    expect(f).toEqual({ mask: 'heart', straighten: STRAIGHTEN_LIMIT })
    const g: Record<string, unknown> = { straighten: 'x' }
    sanitizeImageStyle(g)
    expect(g).toEqual({})
  })
})

import { cropByEdges } from '@/imageStyle'

describe('cropByEdges', () => {
  const box = { x: 100, y: 50, width: 400, height: 300, rotation: 0 }
  it('un bord qui rentre masque de l’image et garde le reste en place', () => {
    const p = cropByEdges(box, { l: 100 }) // 100 px = 25 % de l'image
    expect(p.crop).toEqual({ x: 0.25, y: 0, width: 0.75, height: 1 })
    expect(p.x).toBeCloseTo(200)
    expect(p.width).toBeCloseTo(300)
    expect(p.y).toBeCloseTo(50)
  })
  it('un bord qui sort révèle l’image jusqu’à ses limites', () => {
    const cropped = { ...box, width: 300, crop: { x: 0.25, y: 0, width: 0.75, height: 1 } }
    const p = cropByEdges(cropped, { l: -500 }) // bien au-delà : bloqué à x = 0
    expect(p.crop).toBeUndefined() // image entière
    expect(p.x).toBeCloseTo(0) // le bord gauche recule de 100 px (25 % de 400)
    expect(p.width).toBeCloseTo(400)
  })
  it('tirer un bord au-delà de la limite ne déplace pas le bord opposé', () => {
    const p = cropByEdges(box, { l: 10_000 })
    expect(p.crop!.x + p.crop!.width).toBeCloseTo(1)
    expect(p.crop!.width).toBeCloseTo(0.05)
  })
  it('le coin haut-gauche suit le bord déplacé, rotation comprise', () => {
    const p = cropByEdges({ ...box, rotation: 90 }, { l: 100 })
    expect(p.x).toBeCloseTo(100) // 90° : l'axe x de l'image pointe vers le bas
    expect(p.y).toBeCloseTo(150)
  })
  it('deux bords à la fois', () => {
    const p = cropByEdges(box, { r: -200, b: -150 })
    expect(p.crop).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 })
    expect(p.width).toBeCloseTo(200)
    expect(p.height).toBeCloseTo(150)
  })
})
