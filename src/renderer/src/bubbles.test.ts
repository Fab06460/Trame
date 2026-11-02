import { describe, expect, it } from 'vitest'
import { svgPathToSegments } from '@/pdfMath'
import { BUBBLES, bubbleDrafts, bubbleElements, BUBBLE_IDS } from './bubbles'

const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('tracés des bulles', () => {
  it('ont des identifiants uniques et commencent par M', () => {
    expect(new Set(BUBBLE_IDS).size).toBe(BUBBLES.length)
    for (const b of BUBBLES) expect(b.path.startsWith('M'), b.id).toBe(true)
  })
  it('restent dans le viewBox 100 × 100', () => {
    for (const b of BUBBLES) for (const n of numbers(b.path)) expect(n >= 0 && n <= 100, `${b.id} ${n}`).toBe(true)
  })
  it('sont compris par les exports vectoriels (PDF)', () => {
    for (const b of BUBBLES) expect(svgPathToSegments(b.path), b.id).not.toBeNull()
  })
  it('la queue gauche et la queue droite sont symétriques', () => {
    for (const [l, r] of [['speech-l', 'speech-r'], ['thought-l', 'thought-r']]) {
      const a = numbers(BUBBLES.find((b) => b.id === l)!.path)
      const b = numbers(BUBBLES.find((b2) => b2.id === r)!.path)
      expect(a.length).toBe(b.length)
      // x et y alternent : x' = 100 - x, y inchangé
      for (let i = 0; i < a.length; i += 2) {
        expect(Math.abs(a[i] + b[i] - 100), `${l} x${i}`).toBeLessThan(0.02)
        expect(b[i + 1]).toBe(a[i + 1])
      }
    }
  })
  it('la queue d\'une bulle de parole descend sous l\'ellipse, du côté choisi', () => {
    const left = numbers(BUBBLES[0].path)
    const right = numbers(BUBBLES[1].path)
    const tipL = [left.length - 4, left.length - 3].map((i) => left[i]) // pointe : le « L » avant le retour à la base
    expect(tipL).toEqual([10, 96])
    expect(right[right.length - 4]).toBe(90)
  })
  it('la bulle de pensée a le nuage et deux petites bulles (trois sous-chemins)', () => {
    expect((BUBBLES.find((b) => b.id === 'thought-l')!.path.match(/M/g) ?? []).length).toBe(3)
  })
  it('le cri a des pointes alternées (32 sommets)', () => {
    expect((BUBBLES.find((b) => b.id === 'shout')!.path.match(/[ML]/g) ?? []).length).toBe(32)
  })
})

describe('bubbleDrafts', () => {
  it('donne le chemin puis le texte, réunis dans un groupe, le texte dans la bulle', () => {
    for (const id of BUBBLE_IDS) {
      const [shape, text] = bubbleDrafts(id, { x: 100, y: 50, width: 400 }, 'Salut', 'g1')
      expect([shape.type, text.type], id).toEqual(['path', 'text'])
      expect(shape.groupId).toBe('g1')
      expect(text.groupId).toBe('g1')
      expect(text.text).toBe('Salut')
      expect(text.x).toBeGreaterThanOrEqual(shape.x)
      expect(text.x + text.width).toBeLessThanOrEqual(shape.x + shape.width)
      expect(text.y).toBeGreaterThanOrEqual(shape.y)
      expect(text.y + text.height).toBeLessThanOrEqual(shape.y + shape.height)
      expect(shape.stroke).toBeTruthy()
      expect(shape.strokeWidth).toBeGreaterThan(0)
    }
  })
  it('la hauteur suit le rapport de la bulle et le texte la largeur', () => {
    const [big] = bubbleDrafts('speech-l', { x: 0, y: 0, width: 400 }, 'x', 'g')
    const [small, smallText] = bubbleDrafts('speech-l', { x: 0, y: 0, width: 200 }, 'x', 'g')
    expect(big.height).toBe(Math.round(400 * 0.85))
    expect(small.height).toBe(Math.round(200 * 0.85))
    expect(smallText.fontSize).toBeLessThan(bubbleDrafts('speech-l', { x: 0, y: 0, width: 400 }, 'x', 'g')[1].fontSize!)
  })
})

describe('bubbleElements', () => {
  it('ajoute des identifiants et un groupe commun', () => {
    const els = bubbleElements('shout', { x: 0, y: 0, width: 300 }, 'Aïe !')
    expect(els).toHaveLength(2)
    expect(els[0].id).not.toBe(els[1].id)
    expect(els[0].groupId).toBeTruthy()
    expect(els[0].groupId).toBe(els[1].groupId)
  })
})
