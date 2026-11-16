import { describe, expect, it } from 'vitest'
import type { OcrLine, OcrParagraph } from './engine'
import { MIN_CONFIDENCE, paperAndInk, scanBlocks, toHex } from './scan'

const line = (text: string, y0: number, y1: number, base = y1 - 6): OcrLine => ({ text, x0: 100, x1: 700, y0, y1, base })
const para = (lines: OcrLine[], confidence = 90): OcrParagraph => ({
  text: lines.map((l) => l.text).join('\n'),
  confidence,
  x0: 100,
  x1: 700,
  y0: Math.min(...lines.map((l) => l.y0)),
  y1: Math.max(...lines.map((l) => l.y1)),
  lines
})

describe('paragraphes d\'une page scannée', () => {
  it('une ligne : le corps vient de la hauteur de la ligne', () => {
    const [b] = scanBlocks([para([line('Bonjour', 100, 142)])])
    expect(b.text).toBe('Bonjour')
    expect(b.fontSize).toBe(40)
    expect(b.lineHeight).toBe(1.2)
    expect(b.baseline).toBe(136)
  })
  it('plusieurs lignes : le corps vient de l\'écart entre les lignes de base, l\'interligne aussi', () => {
    const [b] = scanBlocks([para([line('un', 100, 140, 134), line('deux', 160, 200, 194), line('trois', 220, 260, 254)])])
    expect(b.text).toBe('un\ndeux\ntrois')
    expect(b.fontSize).toBe(50) // écart 60 / 1,2
    expect(b.lineHeight).toBe(1.2)
  })
  it('laisse dans l\'image le bruit : peu sûr, sans lettre, minuscule', () => {
    expect(scanBlocks([para([line('texte', 100, 140)], MIN_CONFIDENCE - 1)])).toEqual([])
    expect(scanBlocks([para([line('— • —', 100, 140)])])).toEqual([])
    expect(scanBlocks([para([line('petit', 100, 104)])])).toEqual([])
    expect(scanBlocks([para([line('   ', 100, 140)])])).toEqual([])
  })
  it('une ligne de base absurde est remplacée par le bas du cadre', () => {
    const [b] = scanBlocks([para([line('texte', 100, 140, 900)])])
    expect(b.baseline).toBe(140)
  })
})

describe('papier et encre', () => {
  const zone = (w: number, h: number, paper: number[], ink: number[], inkShare: number): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const c = i % 10 < inkShare * 10 ? ink : paper
      d.set([c[0], c[1], c[2], 255], i * 4)
    }
    return d
  }
  it('le papier est la couleur dominante, l\'encre la plus éloignée', () => {
    const r = paperAndInk(zone(60, 40, [250, 245, 230], [20, 20, 120], 0.15), 60, 40)
    expect(r.paper).toEqual([250, 245, 230])
    expect(r.ink[2]).toBeGreaterThan(100)
    expect(r.ink[0]).toBeLessThan(40)
  })
  it('hexadécimal et zone vide', () => {
    expect(toHex([255, 0, 16])).toBe('#ff0010')
    expect(paperAndInk(new Uint8ClampedArray(0), 0, 0)).toEqual({ paper: [255, 255, 255], ink: [0, 0, 0] })
  })
})
