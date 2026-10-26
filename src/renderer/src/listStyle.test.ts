import { describe, expect, it } from 'vitest'
import { listIndent, markerChars, markersFor, sanitizeList } from '@/listStyle'

describe('listStyle', () => {
  it('puces : un marqueur par paragraphe non vide', () => expect(markersFor('bullet', ['a', '', 'b'])).toEqual(['•', '', '•']))
  it('numéros : un paragraphe vide ne consomme pas de numéro', () => expect(markersFor('number', ['a', '', 'b', 'c'])).toEqual(['1.', '', '2.', '3.']))
  it('le retrait suit la taille de police', () => {
    expect(listIndent(40)).toBe(56)
    expect(listIndent(undefined)).toBe(45)
  })
  it('caractères à vérifier dans la police', () => {
    expect(markerChars({})).toBe('')
    expect(markerChars({ list: 'bullet' })).toBe('•')
    expect(markerChars({ list: 'number' })).toContain('9')
  })
  it('nettoyage : valeur inconnue ou autre type que texte retirée', () => {
    const a: Record<string, unknown> = { type: 'text', list: 'bullet' }
    sanitizeList(a)
    expect(a.list).toBe('bullet')
    const b: Record<string, unknown> = { type: 'text', list: 'roman' }
    sanitizeList(b)
    expect(b.list).toBeUndefined()
    const c: Record<string, unknown> = { type: 'rect', list: 'bullet' }
    sanitizeList(c)
    expect(c.list).toBeUndefined()
  })
})
