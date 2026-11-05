import { describe, expect, it } from 'vitest'
import { clampNotesSize, formatElapsed, NOTES_SIZE } from './speakerFormat'

describe('écran de l\'orateur : mise en forme', () => {
  it('durée en m:ss puis h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(59_999)).toBe('0:59')
    expect(formatElapsed(61_000)).toBe('1:01')
    expect(formatElapsed(3_599_000)).toBe('59:59')
    expect(formatElapsed(3_600_000)).toBe('1:00:00')
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
  })
  it('une durée négative (horloge reculée) s\'affiche 0:00', () => {
    expect(formatElapsed(-5000)).toBe('0:00')
  })
  it('taille des notes bornée, valeur invalide = défaut', () => {
    expect(clampNotesSize(4)).toBe(NOTES_SIZE.min)
    expect(clampNotesSize(500)).toBe(NOTES_SIZE.max)
    expect(clampNotesSize('x')).toBe(NOTES_SIZE.def)
    expect(clampNotesSize(30.4)).toBe(30)
  })
})
