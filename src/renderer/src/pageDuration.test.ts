import { describe, expect, it } from 'vitest'
import { cleanPageSeconds, suggestedSeconds } from './pageDuration'
import type { TrameElement } from './types'

const text = (t: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id: t, type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', text: t, ...extra })

describe('cleanPageSeconds', () => {
  it('garde un nombre de secondes dans les limites, au dixième près', () => {
    expect(cleanPageSeconds(7)).toBe(7)
    expect(cleanPageSeconds(2.46)).toBe(2.5)
    expect(cleanPageSeconds(1)).toBe(1)
    expect(cleanPageSeconds(120)).toBe(120)
  })
  it('ignore ce qui n\'est pas une durée valable', () => {
    for (const bad of [0, 0.5, -3, 121, NaN, Infinity, '5', null, undefined, {}, []]) expect(cleanPageSeconds(bad)).toBeUndefined()
  })
})

describe('suggestedSeconds', () => {
  it('une page sans texte : 3 s', () => {
    expect(suggestedSeconds({ elements: [] })).toBe(3)
  })
  it('3 s plus 0,35 s par mot, arrondi à la seconde', () => {
    expect(suggestedSeconds({ elements: [text('un deux trois quatre cinq six sept huit neuf dix')] })).toBe(7)
  })
  it('les textes de plusieurs éléments s\'additionnent, les masqués et les autres types sont ignorés', () => {
    const e = [text('a b c d e f g h i j'), text('k l m n o p q r s t'), text('caché caché caché caché', { hidden: true }), { ...text('forme forme forme'), type: 'rect' as const }]
    expect(suggestedSeconds({ elements: e })).toBe(10)
  })
  it('reste dans les limites de l\'export vidéo', () => {
    expect(suggestedSeconds({ elements: [text('mot '.repeat(2000))] })).toBe(120)
  })
})
