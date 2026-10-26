import { describe, expect, it } from 'vitest'
import { boundsOf } from '@/geometry'
import { adaptDocument } from '@/magicResize'
import type { TrameDocument, TrameElement } from '@/types'

const el = (o: Partial<TrameElement>): TrameElement =>
  ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#000', ...o }) as TrameElement
const doc = (elements: TrameElement[], w = 1000, h = 1000): TrameDocument => ({ version: 2, name: 'x', width: w, height: h, pages: [{ id: 'p', background: '#fff', elements }] })
const first = (d: TrameDocument, i = 0): TrameElement => d.pages[0].elements[i]

describe('magicResize', () => {
  it('même format : rien ne bouge', () => {
    const d = adaptDocument(doc([el({ x: 300, y: 200, width: 120, height: 80 })]), 1000, 1000)
    expect(first(d)).toMatchObject({ x: 300, y: 200, width: 120, height: 80 })
  })

  it('format moitié moins grand : tout est divisé par deux', () => {
    const d = adaptDocument(doc([el({ x: 400, y: 200, width: 200, height: 100, fontSize: 40, strokeWidth: 10, cornerRadius: 20, shadow: { color: '#000', blur: 20, offsetX: 4, offsetY: 8, opacity: 1 } })]), 500, 500)
    expect(first(d)).toMatchObject({ x: 200, y: 100, width: 100, height: 50, fontSize: 20, strokeWidth: 5, cornerRadius: 10, shadow: { blur: 10, offsetX: 2, offsetY: 4 } })
  })

  it('carré → portrait : tailles inchangées (échelle min = 1), centres étirés sur la hauteur', () => {
    const d = adaptDocument(doc([el({ x: 450, y: 100, width: 100, height: 100 })]), 1000, 2000)
    const e = first(d)
    expect([e.width, e.height]).toEqual([100, 100])
    expect(e.x).toBeCloseTo(450)
    expect(e.y).toBeCloseTo(250) // centre y 150 → 300, donc y = 250
  })

  it('un fond pleine page suit le nouveau format', () => {
    const d = adaptDocument(doc([el({ id: 'bg', width: 1000, height: 1000 }), el({ id: 'b', x: 450, y: 450 })]), 1920, 1080)
    expect(first(d)).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(first(d, 1)).toMatchObject({ width: 108, height: 108 })
  })

  it('un bandeau pleine largeur reste pleine largeur, sa hauteur suit l\'échelle', () => {
    const d = adaptDocument(doc([el({ x: 0, y: 100, width: 1000, height: 100 })]), 500, 500)
    expect(first(d)).toMatchObject({ x: 0, width: 500, height: 50 })
  })

  it('le centre d\'un élément pivoté suit la page et son angle est conservé', () => {
    const e = el({ x: 500, y: 500, width: 200, height: 100, rotation: 30 })
    const before = boundsOf(e)
    const d = adaptDocument(doc([e]), 500, 500)
    const after = boundsOf(first(d))
    expect(first(d).rotation).toBe(30)
    expect(after.x + after.width / 2).toBeCloseTo((before.x + before.width / 2) / 2)
    expect(after.y + after.height / 2).toBeCloseTo((before.y + before.height / 2) / 2)
  })

  it('un groupe garde ses écarts internes (à l\'échelle) et se déplace d\'un bloc', () => {
    const d = adaptDocument(doc([el({ id: 'g1', groupId: 'G', x: 100, y: 100 }), el({ id: 'g2', groupId: 'G', x: 300, y: 100 })]), 2000, 1000)
    const [a, b] = d.pages[0].elements
    expect(b.x - a.x).toBeCloseTo(200) // s = 1 : écart inchangé
    expect(b.y).toBeCloseTo(a.y)
  })

  it('rien ne sort de la page', () => {
    const d = adaptDocument(doc([el({ x: 950, y: 950, width: 50, height: 50 })]), 1000, 100)
    const b = boundsOf(first(d))
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(1000.0001)
    expect(b.y + b.height).toBeLessThanOrEqual(100.0001)
  })

  it('les repères suivent leur axe, les dimensions sont bornées', () => {
    const base = doc([])
    base.pages[0].guides = [{ orientation: 'v', position: 100 }, { orientation: 'h', position: 100 }]
    const d = adaptDocument(base, 2000, 500)
    expect(d.pages[0].guides).toEqual([{ orientation: 'v', position: 200 }, { orientation: 'h', position: 50 }])
    expect(adaptDocument(base, 1, 99999)).toMatchObject({ width: 16, height: 8000 })
  })

  it('le document d\'origine n\'est pas modifié', () => {
    const base = doc([el({ x: 100 })])
    adaptDocument(base, 500, 500)
    expect(base.pages[0].elements[0].x).toBe(100)
    expect(base.width).toBe(1000)
  })
})
