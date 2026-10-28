import { describe, expect, it } from 'vitest'
import { clampSize, dragSize, isCompact, LIMITS, MIN_CENTER, overlayWidth, sanitizeLayout, stripHeight, thumbBox } from './layout'

const prefs = { leftOpen: true, rightOpen: true, leftWidth: 280, rightWidth: 240 }

describe('tailles des zones', () => {
  it('borne les valeurs et ignore ce qui n\'est pas un nombre', () => {
    expect(clampSize('left', 10)).toBe(LIMITS.left.min)
    expect(clampSize('left', 9999)).toBe(LIMITS.left.max)
    expect(clampSize('right', 'x')).toBe(LIMITS.right.def)
    expect(clampSize('strip', NaN)).toBe(LIMITS.strip.def)
    expect(clampSize('left', 300.6)).toBe(301)
  })
  it('le glissement agit dans le bon sens pour chaque poignée', () => {
    expect(dragSize('left', 280, 40)).toBe(320)
    expect(dragSize('right', 240, 40)).toBe(200)
    expect(dragSize('strip', 150, -30)).toBe(180)
    expect(dragSize('left', 280, -500)).toBe(LIMITS.left.min)
  })
})

describe('mode compact', () => {
  it('fenêtre large : panneaux ancrés', () => {
    expect(isCompact(1400, prefs)).toBe(false)
    expect(isCompact(280 + 240 + MIN_CENTER, prefs)).toBe(false)
  })
  it('fenêtre étroite : les panneaux ouverts passent en recouvrement', () => {
    expect(isCompact(280 + 240 + MIN_CENTER - 1, prefs)).toBe(true)
    expect(isCompact(900, prefs)).toBe(true)
  })
  it('un panneau fermé ne compte pas ; sans panneau ouvert, jamais compact', () => {
    expect(isCompact(800, { ...prefs, rightOpen: false })).toBe(false)
    expect(isCompact(300, { ...prefs, leftOpen: false, rightOpen: false })).toBe(false)
  })
  it('le recouvrement ne dépasse pas 85 % de la fenêtre', () => {
    expect(overlayWidth(400, 800)).toBe(400)
    expect(overlayWidth(480, 500)).toBe(425)
    expect(overlayWidth(480, 100)).toBe(160)
  })
})

describe('bande des pages', () => {
  it('cède la place au canevas quand la fenêtre est basse', () => {
    expect(stripHeight(150, 900)).toBe(150)
    expect(stripHeight(300, 600)).toBe(180)
    expect(stripHeight(150, 200)).toBe(LIMITS.strip.min)
  })
  it('les miniatures suivent la hauteur', () => {
    expect(thumbBox(150)).toEqual({ maxW: 141, maxH: 88 })
    expect(thumbBox(84).maxH).toBe(36)
    expect(thumbBox(320).maxH).toBe(240)
  })
})

describe('préférences enregistrées', () => {
  it('une valeur absente ou invalide retombe sur le défaut', () => {
    expect(sanitizeLayout(null)).toEqual({ leftOpen: true, rightOpen: true, stripOpen: true, leftWidth: 280, rightWidth: 240, stripHeight: 150 })
    expect(sanitizeLayout({ leftOpen: false, leftWidth: 'a', rightWidth: 5000 })).toMatchObject({ leftOpen: false, leftWidth: 280, rightWidth: LIMITS.right.max })
  })
})
