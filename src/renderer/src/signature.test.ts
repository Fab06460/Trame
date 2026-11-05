import { describe, expect, it } from 'vitest'
import {
  addStroke, extendStroke, inkAspect, inkBounds, inkShape, MAX_IMAGE_CHARS, MAX_SAVED, MAX_STROKES, parseSignatures, removePaper, serializeSignatures,
  signedArea, simplify, smooth, visibleBounds, withSignature, type Ink, type SigStroke, type StoredSignature
} from './signature'

const line: SigStroke = [[10, 10], [60, 10], [110, 40]]
const ink = (over: Partial<Ink> = {}): Ink => ({ strokes: [line], width: 4, color: '#1e1f24', ...over })

describe('tracé', () => {
  it('ignore un point trop proche du précédent', () => {
    expect(extendStroke([[0, 0]], [0.4, 0.4])).toHaveLength(1)
    expect(extendStroke([[0, 0]], [5, 0])).toHaveLength(2)
  })
  it('ne modifie pas le trait reçu', () => {
    const s: SigStroke = [[0, 0]]
    extendStroke(s, [10, 10])
    expect(s).toHaveLength(1)
  })
  it('refuse un trait de trop et un trait vide', () => {
    const full = Array.from({ length: MAX_STROKES }, () => line)
    expect(addStroke(full, line)).toHaveLength(MAX_STROKES)
    expect(addStroke([], [])).toEqual([])
    expect(addStroke([line], line)).toHaveLength(2)
  })
  it('simplify retire les points alignés et garde les extrémités', () => {
    const s = simplify([[0, 0], [5, 0.1], [10, 0], [15, 0.1], [20, 0]], 0.8)
    expect(s).toEqual([[0, 0], [20, 0]])
    expect(simplify([[0, 0], [5, 9], [10, 0]], 0.8)).toHaveLength(3)
  })
  it('smooth garde les extrémités et ajoute des points', () => {
    const s = smooth([[0, 0], [10, 10], [20, 0]])
    expect(s[0]).toEqual([0, 0])
    expect(s[s.length - 1]).toEqual([20, 0])
    expect(s.length).toBeGreaterThan(3)
  })
})

describe('inkShape', () => {
  it('rien à dessiner : null', () => {
    expect(inkShape(ink({ strokes: [] }), 200)).toBeNull()
    expect(inkShape(ink(), 0)).toBeNull()
  })
  it('respecte la largeur demandée et les proportions', () => {
    const shape = inkShape(ink(), 300)!
    expect(shape.width).toBe(300)
    expect(shape.height / shape.width).toBeCloseTo(1 / (inkAspect(ink()) as number), 5)
  })
  it('reste dans le viewBox 100 × 100 (le trait a de la marge)', () => {
    const shape = inkShape(ink(), 300)!
    const nums = shape.path.match(/-?\d+(\.\d+)?/g)!.map(Number)
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(-0.01)
    expect(Math.max(...nums)).toBeLessThanOrEqual(100.01)
  })
  it('un point isolé devient un disque', () => {
    const shape = inkShape(ink({ strokes: [[[50, 50]]] }), 40)!
    expect(shape.path.startsWith('M')).toBe(true)
    expect((shape.path.match(/M/g) ?? []).length).toBe(1)
    expect(shape.height).toBeCloseTo(40, 5)
  })
  it('tous les polygones tournent dans le même sens (le remplissage fait l\'union)', () => {
    const shape = inkShape(ink({ strokes: [line, [[20, 80], [90, 70], [150, 90], [160, 60]]] }), 300)!
    const polys = shape.path.split('Z').filter(Boolean).map((p) => p.slice(1).split('L').map((pt) => pt.split(' ').map(Number) as [number, number]))
    expect(polys.length).toBeGreaterThan(3)
    const signs = new Set(polys.map((p) => Math.sign(signedArea(p))))
    expect(signs.size).toBe(1)
    expect(signs.has(0)).toBe(false)
  })
  it('une épaisseur hors limites est ramenée dans les bornes', () => {
    expect(inkShape(ink({ width: 9999 }), 300)).not.toBeNull()
  })
  it('bornes et proportions', () => {
    expect(inkBounds([])).toBeNull()
    expect(inkBounds([line])).toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 40 })
    expect(inkAspect(ink({ strokes: [] }))).toBeNull()
  })
})

describe('signatures enregistrées', () => {
  const stored: StoredSignature[] = [
    { id: 'a1', kind: 'ink', ink: ink() },
    { id: 'b2', kind: 'image', src: 'data:image/png;base64,AAAA', aspect: 3 }
  ]
  it('aller-retour', () => {
    expect(parseSignatures(serializeSignatures(stored))).toEqual(stored)
  })
  it('fichier absent, illisible ou autre chose : liste vide', () => {
    expect(parseSignatures(null)).toEqual([])
    expect(parseSignatures('pas du json')).toEqual([])
    expect(parseSignatures('{"signatures":3}')).toEqual([])
    expect(parseSignatures('[]')).toEqual([])
  })
  it('ignore les entrées invalides, garde les autres', () => {
    const bad = [
      { id: 'x', kind: 'ink', ink: { strokes: [[[0, 0]]], width: 4, color: 'rouge' } },
      { id: 'y', kind: 'ink', ink: { strokes: [[['a', 0]]], width: 4, color: '#000000' } },
      { id: '../z', kind: 'image', src: 'data:image/png;base64,AA', aspect: 2 },
      { id: 'w', kind: 'image', src: 'data:image/svg+xml;base64,AA', aspect: 2 },
      { id: 'v', kind: 'image', src: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_CHARS)}`, aspect: 2 },
      { id: 'u', kind: 'image', src: 'data:image/png;base64,AA', aspect: 0 },
      { id: 'a1', kind: 'ink', ink: ink() },
      { id: 'a1', kind: 'ink', ink: ink() },
      'texte'
    ]
    expect(parseSignatures(JSON.stringify({ signatures: bad })).map((s) => s.id)).toEqual(['a1'])
  })
  it('plafonne le nombre de signatures', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, kind: 'ink', ink: ink() }))
    expect(parseSignatures(JSON.stringify({ signatures: many }))).toHaveLength(MAX_SAVED)
  })
  it('withSignature met la nouvelle en tête et fait partir la plus ancienne', () => {
    let list: StoredSignature[] = []
    for (let i = 0; i < MAX_SAVED + 3; i++) list = withSignature(list, { id: `s${i}`, kind: 'ink', ink: ink() })
    expect(list).toHaveLength(MAX_SAVED)
    expect(list[0].id).toBe(`s${MAX_SAVED + 2}`)
  })
})

describe('papier retiré', () => {
  // 4 × 1 pixels : papier blanc, papier blanc, encre noire, gris moyen
  const px = (): Uint8ClampedArray => new Uint8ClampedArray([255, 255, 255, 255, 250, 250, 250, 255, 0, 0, 0, 255, 255, 255, 255, 255])
  it('le papier devient transparent, l\'encre reste opaque', () => {
    const d = px()
    removePaper(d, { recolor: null, tolerance: 0.5 })
    expect(d[3]).toBe(0)
    expect(d[7]).toBe(0)
    expect(d[11]).toBe(255)
    expect([d[8], d[9], d[10]]).toEqual([0, 0, 0])
  })
  it('recolore l\'encre', () => {
    const d = px()
    removePaper(d, { recolor: '#1f3a93', tolerance: 0.5 })
    expect([d[8], d[9], d[10], d[11]]).toEqual([0x1f, 0x3a, 0x93, 255])
  })
  it('un pixel déjà transparent compte comme du papier', () => {
    const d = new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255])
    removePaper(d, { recolor: null, tolerance: 0.5 })
    expect(d[3]).toBe(0)
  })
  it('plus de tolérance garde davantage de gris', () => {
    const grey = (): Uint8ClampedArray => new Uint8ClampedArray([...Array(9).fill([255, 255, 255, 255]).flat(), 150, 150, 150, 255])
    const strict = grey()
    const loose = grey()
    removePaper(strict, { recolor: null, tolerance: 0 })
    removePaper(loose, { recolor: null, tolerance: 1 })
    expect(loose[39]).toBeGreaterThan(strict[39])
  })
  it('visibleBounds : cadre l\'encre avec une marge, null si vide', () => {
    const w = 10
    const h = 6
    const d = new Uint8ClampedArray(w * h * 4)
    expect(visibleBounds(d, w, h)).toBeNull()
    d[(2 * w + 3) * 4 + 3] = 255
    d[(3 * w + 6) * 4 + 3] = 255
    expect(visibleBounds(d, w, h, 24, 1)).toEqual({ x: 2, y: 1, width: 6, height: 4 })
  })
})
