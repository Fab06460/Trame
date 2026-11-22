import { describe, expect, it } from 'vitest'
import type { OcrParagraph, OcrWord } from '@/ocr/engine'
import { labelCrop, LABEL_MAX, pickLabel } from './tutorialLabel'

const word = (text: string, x0: number, x1: number, y0 = 100, y1 = 120, confidence = 90): OcrWord => ({ text, x0, x1, y0, y1, confidence })
const para = (...lines: OcrWord[][]): OcrParagraph => ({
  text: '',
  confidence: 90,
  x0: 0,
  y0: 0,
  x1: 1000,
  y1: 1000,
  lines: lines.map((words) => ({ text: words.map((w) => w.text).join(' '), x0: words[0].x0, y0: 100, x1: words[words.length - 1].x1, y1: 120, base: 118, words }))
})

describe('pickLabel', () => {
  it('rend le mot cliqué, élargi aux mots voisins séparés par une simple espace', () => {
    const p = para([word('Enregistrer', 100, 200), word('sous', 208, 250), word('Annuler', 400, 470)])
    expect(pickLabel([p], { x: 150, y: 110 }, 50)).toBe('Enregistrer sous')
  })
  it('ne mélange pas deux entrées de menu éloignées', () => {
    const p = para([word('Fichier', 10, 80), word('Édition', 140, 210), word('Affichage', 270, 360)])
    expect(pickLabel([p], { x: 175, y: 110 }, 50)).toBe('Édition')
  })
  it('prend le mot le plus proche quand le clic est à côté', () => {
    const p = para([word('Valider', 100, 180), word('Annuler', 400, 470)])
    expect(pickLabel([p], { x: 420, y: 140 }, 50)).toBe('Annuler')
  })
  it('rend null quand rien de lisible n\'est assez près', () => {
    const p = para([word('Valider', 100, 180)])
    expect(pickLabel([p], { x: 600, y: 600 }, 50)).toBeNull()
    expect(pickLabel([], { x: 0, y: 0 }, 50)).toBeNull()
  })
  it('écarte les mots peu sûrs et les signes', () => {
    const p = para([word('Ok', 100, 130, 100, 120, 20), word('||||', 140, 170), word('~~', 180, 200)])
    expect(pickLabel([p], { x: 110, y: 110 }, 80)).toBeNull()
  })
  it('exige au moins deux lettres de suite', () => {
    expect(pickLabel([para([word('X', 100, 110)])], { x: 105, y: 110 }, 50)).toBeNull()
    expect(pickLabel([para([word('OK', 100, 130)])], { x: 105, y: 110 }, 50)).toBe('OK')
  })
  it('coupe un titre trop long', () => {
    const words = Array.from({ length: 30 }, (_, i) => word('abcdefgh', i * 80, i * 80 + 72))
    const out = pickLabel([para(words)], { x: 20, y: 110 }, 50)!
    expect(out.length).toBeLessThanOrEqual(LABEL_MAX)
    expect(out.endsWith('…')).toBe(true)
  })
  it('ignore une ligne sans mots (moteur sans détail)', () => {
    const p = para([word('Valider', 100, 180)])
    p.lines[0].words = undefined
    expect(pickLabel([p], { x: 120, y: 110 }, 50)).toBeNull()
  })
})

describe('labelCrop', () => {
  it('centre la zone sur le clic', () => {
    const c = labelCrop(1920, 1080, 0.5, 0.5)
    expect(c.x + c.width / 2).toBeCloseTo(960, 0)
    expect(c.y + c.height / 2).toBeCloseTo(540, 0)
  })
  it('reste dans l\'image pour un clic au bord', () => {
    for (const [fx, fy] of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
      const c = labelCrop(1920, 1080, fx, fy)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(1920)
      expect(c.y + c.height).toBeLessThanOrEqual(1080)
    }
  })
  it('s\'adapte à une très petite image', () => {
    const c = labelCrop(200, 100, 0.5, 0.5)
    expect(c.width).toBeLessThanOrEqual(200)
    expect(c.height).toBeLessThanOrEqual(100)
  })
})
