import { describe, expect, it } from 'vitest'
import { LETTER_SPACING, LINE_HEIGHT, decorationGeometry, decorationOf, displayText, letterSpacingOf, lineHeightOf, sanitizeTextStyle } from '@/textStyle'

describe('displayText', () => {
  it('majuscules à la demande, texte saisi intact', () => {
    const el = { text: 'Bonjour é ß', uppercase: true }
    expect(displayText(el)).toBe('BONJOUR É SS')
    expect(el.text).toBe('Bonjour é ß')
    expect(displayText({ text: 'Bonjour' })).toBe('Bonjour')
    expect(displayText({ text: undefined, uppercase: true })).toBe('')
  })
})

describe('valeurs par défaut', () => {
  it('interlettrage nul et interligne 1', () => {
    expect(letterSpacingOf({})).toBe(0)
    expect(lineHeightOf({})).toBe(1)
    expect(letterSpacingOf({ letterSpacing: 4 })).toBe(4)
    expect(lineHeightOf({ lineHeight: 1.5 })).toBe(1.5)
  })
})

describe('decorationOf', () => {
  it('chaîne attendue par Konva', () => {
    expect(decorationOf({})).toBe('')
    expect(decorationOf({ underline: true })).toBe('underline')
    expect(decorationOf({ strike: true })).toBe('line-through')
    expect(decorationOf({ underline: true, strike: true })).toBe('underline line-through')
  })
})

describe('decorationGeometry (identique à Konva)', () => {
  it('épaisseur taille/15 ; décalage = round(taille/4) sous la ligne de base (souligné) ou au-dessus (barré)', () => {
    expect(decorationGeometry(60)).toEqual({ thickness: 4, underlineOffset: 15, strikeOffset: -15 })
    expect(decorationGeometry(30)).toEqual({ thickness: 2, underlineOffset: 8, strikeOffset: -8 }) // 7,5 arrondi à 8 comme Math.round
  })
})

describe('sanitizeTextStyle', () => {
  it('borne les nombres et retire les valeurs invalides', () => {
    const e: Record<string, unknown> = { letterSpacing: 999, lineHeight: 0.01 }
    sanitizeTextStyle(e)
    expect(e).toEqual({ letterSpacing: LETTER_SPACING.max, lineHeight: LINE_HEIGHT.min })
    const f: Record<string, unknown> = { letterSpacing: 'large', lineHeight: NaN, underline: 'oui', strike: 1, uppercase: false }
    sanitizeTextStyle(f)
    expect(f).toEqual({})
  })
  it('garde les valeurs correctes', () => {
    const e: Record<string, unknown> = { letterSpacing: -2, lineHeight: 1.4, underline: true, strike: true, uppercase: true }
    sanitizeTextStyle(e)
    expect(e).toEqual({ letterSpacing: -2, lineHeight: 1.4, underline: true, strike: true, uppercase: true })
  })
})
