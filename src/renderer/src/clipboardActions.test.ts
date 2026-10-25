import { describe, expect, it } from 'vitest'
import { parseElements, serializeElements } from '@/clipboardActions'
import type { TrameElement } from '@/types'

const el = (over: Partial<TrameElement> = {}): TrameElement => ({
  id: 'a', type: 'rect', x: 1, y: 2, width: 3, height: 4, rotation: 0, opacity: 1, fill: '#000', ...over
})

describe('presse-papiers Trame', () => {
  it('aller-retour : conserve les éléments, y compris texte accentué et groupes', () => {
    const els = [el({ groupId: 'g' }), el({ id: 'b', type: 'text', text: 'Été ☀︎', fontSize: 40 })]
    expect(parseElements(serializeElements(els))).toEqual(els)
  })

  it('ignore un contenu qui n’est pas du presse-papiers Trame', () => {
    expect(parseElements('pas du json')).toEqual([])
    expect(parseElements('{"autre":1}')).toEqual([])
    expect(parseElements('{"trame":1,"elements":"non"}')).toEqual([])
    expect(parseElements('null')).toEqual([])
  })

  it('filtre les éléments invalides sans rejeter les autres', () => {
    const json = JSON.stringify({ trame: 1, elements: [el(), { id: 'x', type: 'hologramme', x: 0, y: 0, width: 1, height: 1 }, { type: 'rect' }] })
    expect(parseElements(json)).toHaveLength(1)
  })
})
