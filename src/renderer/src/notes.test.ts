import { describe, expect, it } from 'vitest'
import { cleanNotes, limitNotes, MAX_NOTES, sanitizeNotes } from './notes'

describe('notes de l\'orateur', () => {
  it('normalise les fins de ligne et retire les caractères de contrôle', () => {
    expect(limitNotes('a\r\nb\rc\u0000d\te')).toBe('a\nb\ncd\te')
  })
  it('un texte vide n\'est pas stocké, mais une espace saisie est conservée en cours de frappe', () => {
    expect(limitNotes('')).toBeUndefined()
    expect(limitNotes(' ')).toBe(' ')
  })
  it('borne la longueur', () => {
    expect(limitNotes('x'.repeat(MAX_NOTES + 50))?.length).toBe(MAX_NOTES)
  })
  it('à la lecture, ignore les valeurs qui ne sont pas du texte ou qui sont blanches', () => {
    for (const v of [undefined, null, 12, {}, [], '', '  \n ']) expect(cleanNotes(v)).toBeUndefined()
    expect(cleanNotes('Dire bonjour')).toBe('Dire bonjour')
  })
  it('sanitizeNotes supprime le champ invalide', () => {
    const p: { notes?: unknown } = { notes: 5 }
    sanitizeNotes(p)
    expect('notes' in p).toBe(false)
  })
})
