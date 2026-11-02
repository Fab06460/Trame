import { describe, expect, it } from 'vitest'
import { applyZone, applyZones, blurRadius, DEFAULT_REDACT, pixelCells, sanitizeRedact, zoneFromDrag, type Pixels, type RedactSettings } from './redact'

/** Image `w` × `h` en damier noir et blanc d'un pixel : le pire cas pour un masque (aucune zone uniforme). */
function checker(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 ? 255 : 0
      data.set([v, v, v, 255], (y * w + x) * 4)
    }
  return { data, width: w, height: h }
}
const at = (p: Pixels, x: number, y: number): number[] => [...p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)]
const copy = (p: Pixels): Pixels => ({ ...p, data: new Uint8ClampedArray(p.data) })
const set = (over: Partial<RedactSettings>): RedactSettings => ({ ...DEFAULT_REDACT, ...over })

describe('zoneFromDrag', () => {
  it('normalise le sens du tracé et borne à l\'image', () => {
    const z = zoneFromDrag({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.1 })!
    expect([z.x, z.y, z.width, z.height].map((v) => Math.round(v * 100) / 100)).toEqual([0.2, 0.1, 0.4, 0.7])
    expect(zoneFromDrag({ x: -0.5, y: 0.5 }, { x: 0.5, y: 1.7 })).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 })
  })
  it('ignore un simple clic', () => {
    expect(zoneFromDrag({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.9 })).toBeNull()
  })
})

describe('niveaux', () => {
  it('plus fort = moins de cases, flou plus large', () => {
    expect(pixelCells(1)).toBe(16)
    expect(pixelCells(10)).toBe(3)
    expect(pixelCells(7)).toBeLessThan(pixelCells(3))
    expect(blurRadius(10, 100)).toBeGreaterThan(blurRadius(1, 100))
    expect(blurRadius(1, 5)).toBeGreaterThanOrEqual(1)
  })
})

describe('pixellisation', () => {
  it('chaque case prend la couleur moyenne : le détail disparaît', () => {
    const img = checker(40, 40)
    applyZone(img, { x: 0, y: 0, width: 1, height: 1 }, set({ mode: 'pixelate', level: 10 }))
    // 3 cases sur 40 px : 14 px par case, un damier d'un pixel donne partout du gris moyen
    for (const [x, y] of [[0, 0], [1, 0], [5, 7], [13, 13]]) {
      const [r] = at(img, x, y)
      expect(r).toBeGreaterThan(100)
      expect(r).toBeLessThan(155)
    }
    expect(at(img, 0, 0)).toEqual(at(img, 1, 0))
  })
  it('ne touche pas ce qui est hors de la zone', () => {
    const img = checker(40, 40)
    const before = copy(img)
    applyZone(img, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, set({ mode: 'pixelate' }))
    expect(at(img, 5, 5)).toEqual(at(before, 5, 5))
    expect(at(img, 34, 34)).toEqual(at(before, 34, 34))
    expect(at(img, 20, 20)).not.toEqual(at(before, 20, 20))
  })
})

describe('flou', () => {
  it('lisse le damier vers le gris et ne touche pas le reste', () => {
    const img = checker(60, 60)
    const before = copy(img)
    applyZone(img, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, set({ mode: 'blur', level: 7 }))
    const [r] = at(img, 30, 30)
    expect(r).toBeGreaterThan(110)
    expect(r).toBeLessThan(145)
    expect(at(img, 2, 2)).toEqual(at(before, 2, 2))
    expect(at(img, 57, 3)).toEqual(at(before, 57, 3))
  })
  it('un aplat reste un aplat (rien ne vient de l\'extérieur de la zone)', () => {
    const img: Pixels = { data: new Uint8ClampedArray(30 * 30 * 4).fill(255), width: 30, height: 30 }
    // bande noire hors zone : ne doit pas déteindre sur la zone
    for (let y = 0; y < 30; y++) for (let x = 0; x < 5; x++) img.data.set([0, 0, 0, 255], (y * 30 + x) * 4)
    applyZone(img, { x: 0.5, y: 0.2, width: 0.4, height: 0.6 }, set({ mode: 'blur', level: 10 }))
    expect(at(img, 20, 15)).toEqual([255, 255, 255, 255])
  })
})

describe('forme', () => {
  it('l\'ellipse laisse intacts les coins de la zone', () => {
    const img = checker(40, 40)
    const before = copy(img)
    applyZone(img, { x: 0, y: 0, width: 1, height: 1 }, set({ shape: 'ellipse', mode: 'pixelate', level: 10 }))
    expect(at(img, 0, 0)).toEqual(at(before, 0, 0))
    expect(at(img, 39, 39)).toEqual(at(before, 39, 39))
    expect(at(img, 20, 20)).not.toEqual(at(before, 20, 20))
  })
})

describe('applyZones', () => {
  it('applique plusieurs zones et ignore celle qui ne couvre aucun pixel', () => {
    const img = checker(40, 40)
    expect(applyZone(img, { x: 2, y: 2, width: 0.1, height: 0.1 }, DEFAULT_REDACT)).toBe(false)
    const before = copy(img)
    applyZones(img, [{ x: 0, y: 0, width: 0.3, height: 0.3 }, { x: 0.6, y: 0.6, width: 0.3, height: 0.3 }], set({ level: 10 }))
    expect(at(img, 3, 3)).not.toEqual(at(before, 3, 3))
    expect(at(img, 30, 30)).not.toEqual(at(before, 30, 30))
    expect(at(img, 20, 3)).toEqual(at(before, 20, 3))
  })
})

describe('sanitizeRedact', () => {
  it('remplace les valeurs inconnues', () => {
    expect(sanitizeRedact(undefined)).toEqual(DEFAULT_REDACT)
    expect(sanitizeRedact({ mode: 'blur', shape: 'ellipse', level: 99 })).toEqual({ mode: 'blur', shape: 'ellipse', level: 10 })
    expect(sanitizeRedact({ mode: 'x' as never, level: Number.NaN })).toEqual(DEFAULT_REDACT)
  })
})
