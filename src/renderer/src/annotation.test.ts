import { describe, expect, it } from 'vitest'
import { addStroke, extend, MAX_POINTS, MAX_STROKES, pageRect, toPage, type Stroke } from '@/annotation'

const stroke = (n = 1): Stroke => ({ tool: 'pen', color: '#f00', points: Array.from({ length: n }, (_, i) => [i / 10, 0] as const) })

describe('pageRect', () => {
  it('page plus large que la fenêtre : bandes en haut et en bas', () => {
    expect(pageRect(1000, 1000, 1600, 900)).toEqual({ x: 0, y: 218.75, w: 1000, h: 562.5 })
  })
  it('page plus haute : bandes à gauche et à droite', () => {
    const r = pageRect(1600, 900, 900, 1600)
    expect(r.h).toBe(900)
    expect(r.x).toBeCloseTo((1600 - r.w) / 2)
  })
})

describe('toPage', () => {
  it('coins et centre', () => {
    const r = pageRect(1000, 1000, 1600, 900)
    expect(toPage(r, r.x, r.y)).toEqual([0, 0])
    expect(toPage(r, r.x + r.w, r.y + r.h)).toEqual([1, 1])
    expect(toPage(r, 500, 500)).toEqual([0.5, 0.5])
  })
})

describe('extend', () => {
  it('ajoute un point éloigné, sans modifier le trait reçu', () => {
    const s = stroke()
    const next = extend(s, [0.5, 0.5], 1)
    expect(next.points).toHaveLength(2)
    expect(s.points).toHaveLength(1)
  })
  it('ignore un point presque identique', () => {
    const s = stroke()
    expect(extend(s, [0.0001, 0], 1)).toBe(s)
  })
  it('plafonne le nombre de points', () => {
    const s = stroke(MAX_POINTS)
    expect(extend(s, [0.9, 0.9], 1)).toBe(s)
  })
})

describe('addStroke', () => {
  it('garde les plus récents au-delà du plafond', () => {
    let list: Stroke[] = []
    for (let i = 0; i < MAX_STROKES + 5; i++) list = addStroke(list, { ...stroke(), color: `c${i}` })
    expect(list).toHaveLength(MAX_STROKES)
    expect(list[0].color).toBe('c5')
    expect(list.at(-1)!.color).toBe(`c${MAX_STROKES + 4}`)
  })
})
