import { describe, expect, it } from 'vitest'
import { clickFraction, CLICK_MIN_GAP_MS, TUTORIAL_MAX_STEPS } from '@shared/capture'
import { fitImage, stepTitle, tutorialDocument, type TutorialStep } from './tutorial'

const step = (over: Partial<TutorialStep> = {}): TutorialStep => ({ src: 'data:image/jpeg;base64,AA', width: 1920, height: 1080, fx: 0.5, fy: 0.5, ...over })

describe('clickFraction', () => {
  const screen = { x: 100, y: 50, width: 1000, height: 500 }
  it('donne la position dans l\'écran en fractions', () => {
    expect(clickFraction({ x: 600, y: 300 }, screen)).toEqual({ fx: 0.5, fy: 0.5 })
    expect(clickFraction({ x: 100, y: 50 }, screen)).toEqual({ fx: 0, fy: 0 })
  })
  it('refuse un clic hors de l\'écran (un autre écran)', () => {
    expect(clickFraction({ x: 50, y: 300 }, screen)).toBeNull()
    expect(clickFraction({ x: 600, y: 600 }, screen)).toBeNull()
  })
  it('refuse un écran sans taille', () => {
    expect(clickFraction({ x: 0, y: 0 }, { x: 0, y: 0, width: 0, height: 0 })).toBeNull()
  })
  it('garde des bornes raisonnables', () => {
    expect(CLICK_MIN_GAP_MS).toBeGreaterThan(300)
    expect(TUTORIAL_MAX_STEPS).toBeGreaterThan(10)
  })
})

describe('fitImage', () => {
  it('garde les proportions et reste dans la page', () => {
    for (const [w, h] of [[1920, 1080], [1280, 1024], [800, 1600], [3000, 500]]) {
      const f = fitImage(w, h)
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.y).toBeGreaterThanOrEqual(0)
      expect(f.x + f.width).toBeLessThanOrEqual(1920)
      expect(f.y + f.height).toBeLessThanOrEqual(1080)
      expect(Math.abs(f.width / f.height - w / h)).toBeLessThan(0.02)
    }
  })
  it('supporte une image sans dimensions', () => {
    expect(fitImage(0, 0).width).toBeGreaterThan(0)
  })
})

describe('stepTitle', () => {
  it('numérote l\'étape, avec le texte proche du clic s\'il y en a un', () => {
    expect(stepTitle(2, 'Étape')).toBe('Étape 2')
    expect(stepTitle(3, 'Étape', '  Enregistrer \n sous ')).toBe('Étape 3 : Enregistrer sous')
    expect(stepTitle(1, 'Étape', '   ')).toBe('Étape 1')
  })
  it('coupe un texte trop long', () => {
    expect(stepTitle(1, 'E', 'x'.repeat(200)).length).toBeLessThan(70)
  })
})

describe('tutorialDocument', () => {
  it('fait une page par étape, avec le numéro, le titre, l\'image et le repère', () => {
    const doc = tutorialDocument([step(), step({ fx: 0.1, fy: 0.9 })], 'Tutoriel', 'Étape')
    expect(doc.pages).toHaveLength(2)
    const p = doc.pages[1]
    expect(p.elements.map((e) => e.type)).toEqual(['ellipse', 'text', 'text', 'image', 'ellipse'])
    expect(p.elements[1].text).toBe('2')
    expect(p.elements[2].text).toBe('Étape 2')
  })
  it('pose le repère sur l\'endroit cliqué', () => {
    const doc = tutorialDocument([step({ fx: 0.5, fy: 0.5 })], 'T', 'Étape')
    const [, , , img, ring] = doc.pages[0].elements
    expect(ring.x + ring.width / 2).toBeCloseTo(img.x + img.width / 2, 0)
    expect(ring.y + ring.height / 2).toBeCloseTo(img.y + img.height / 2, 0)
  })
  it('garde le repère dans l\'image pour un clic au bord', () => {
    const doc = tutorialDocument([step({ fx: 0, fy: 1 }), step({ fx: 1, fy: 0 })], 'T', 'Étape')
    for (const p of doc.pages) {
      const img = p.elements[3]
      const ring = p.elements[4]
      expect(ring.x).toBeGreaterThanOrEqual(img.x)
      expect(ring.y).toBeGreaterThanOrEqual(img.y)
      expect(ring.x + ring.width).toBeLessThanOrEqual(img.x + img.width)
      expect(ring.y + ring.height).toBeLessThanOrEqual(img.y + img.height)
    }
  })
  it('limite le nombre d\'étapes', () => {
    const many = Array.from({ length: TUTORIAL_MAX_STEPS + 5 }, () => step())
    expect(tutorialDocument(many, 'T', 'É').pages).toHaveLength(TUTORIAL_MAX_STEPS)
  })
})
