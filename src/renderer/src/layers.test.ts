import { describe, expect, it } from 'vitest'
import { displayToIndex, dropIndex, layerLabel } from '@/layers'

describe('layerLabel', () => {
  it('nom choisi en priorité, espaces ignorés', () => {
    expect(layerLabel({ type: 'rect', name: '  Fond  ' })).toBe('Fond')
    expect(layerLabel({ type: 'text', name: 'Titre', text: 'autre chose' })).toBe('Titre')
  })
  it('texte : son début, sur une ligne et abrégé', () => {
    expect(layerLabel({ type: 'text', text: 'Bonjour\n\nle   monde' })).toBe('Bonjour le monde')
    expect(layerLabel({ type: 'text', text: 'x'.repeat(60) })).toHaveLength(28)
    expect(layerLabel({ type: 'text', text: 'x'.repeat(60) }).endsWith('…')).toBe(true)
  })
  it('sinon le type', () => {
    expect(layerLabel({ type: 'text', text: '   ' })).toBe('Texte')
    expect(layerLabel({ type: 'ellipse' })).toBe('Ellipse')
    expect(layerLabel({ type: 'path', name: '' })).toBe('Forme')
    expect(layerLabel({ type: 'image' })).toBe('Image')
  })
})

describe('ordre d’affichage', () => {
  it('la ligne du haut est le dernier élément du tableau', () => {
    expect(displayToIndex(0, 4)).toBe(3)
    expect(displayToIndex(3, 4)).toBe(0)
  })
  it('dropIndex : prend la place de la ligne visée, ou null si rien ne change', () => {
    const els = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] // affiché : c, b, a
    expect(dropIndex(els, 'a', 0)).toBe(2) // a lâché sur la ligne du haut → devant
    expect(dropIndex(els, 'c', 2)).toBe(0) // c lâché sur la ligne du bas → au fond
    expect(dropIndex(els, 'b', 1)).toBeNull() // sa propre ligne
    expect(dropIndex(els, 'zzz', 0)).toBeNull()
  })
})
