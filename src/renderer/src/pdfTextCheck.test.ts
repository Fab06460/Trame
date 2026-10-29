import { describe, expect, it } from 'vitest'
import { checkText, missingChars, suggestFix } from '@/pdfTextCheck'
import type { FontkitFont } from '@/fontkit'
import type { TrameElement } from '@/types'

const el = (over: Partial<TrameElement> = {}): TrameElement => ({
  id: 'a', type: 'text', x: 0, y: 0, width: 300, height: 40, rotation: 0, opacity: 1, fill: '#000',
  text: 'Bonjour', fontSize: 24, fontFamily: '"Inter", sans-serif', fontStyle: 'normal', align: 'left', ...over
})

/** Police factice : ne connaît que les caractères latins de base et les accents français. */
const latinOnly = (cp: number): boolean => cp <= 0xff || cp === 0x2019
const fakeFont = { hasGlyphForCodePoint: latinOnly } as unknown as FontkitFont
const withFont = async (): Promise<FontkitFont> => fakeFont
const noFont = async (): Promise<null> => null

describe('missingChars', () => {
  it('liste les caractères absents sans doublon, hors retours à la ligne', () => {
    expect(missingChars('a ✓ b ✓\n≈', latinOnly)).toBe('✓≈')
    expect(missingChars('Été à Noël —', latinOnly)).toBe('—') // le tiret cadratin est hors de la fausse police
  })
  it('chaîne vide si tout est couvert', () => {
    expect(missingChars('Bonjour é ç à', latinOnly)).toBe('')
  })
  it('gère les caractères hors du plan de base (emoji) sans les couper en deux', () => {
    expect(missingChars('hop 😀', latinOnly)).toBe('😀')
  })
})

describe('checkText', () => {
  it('null quand le texte sera du vrai texte', async () => {
    expect(await checkText(el(), withFont)).toBeNull()
  })

  it('null pour un texte vide (rien à dessiner), même avec une police système', async () => {
    expect(await checkText(el({ text: '   ', fontFamily: 'Helvetica Neue' }), withFont)).toBeNull()
    expect(await checkText(el({ text: undefined }), withFont)).toBeNull()
  })

  it('police système ou inconnue', async () => {
    expect(await checkText(el({ fontFamily: 'Helvetica Neue, Arial, sans-serif' }), withFont)).toEqual({
      reason: 'unknown-font', family: 'Helvetica Neue', variantStyle: undefined
    })
  })

  it('variante absente', async () => {
    expect(await checkText(el({ fontFamily: '"Bebas Neue", sans-serif', fontStyle: 'bold' }), withFont)).toMatchObject({
      reason: 'missing-variant', family: 'Bebas Neue', variantStyle: 'bold'
    })
  })

  it('caractères absents de la police', async () => {
    expect(await checkText(el({ text: 'Coche ✓ et ≈' }), withFont)).toEqual({ reason: 'missing-glyph', family: 'Inter', chars: '✓≈' })
  })

  it('police illisible', async () => {
    expect(await checkText(el(), noFont)).toEqual({ reason: 'font-unreadable', family: 'Inter' })
  })

  it('ne charge la police que si la famille est connue (pas de lecture pour une police système)', async () => {
    let calls = 0
    await checkText(el({ fontFamily: 'Arial' }), async () => { calls++; return fakeFont })
    expect(calls).toBe(0)
  })
})

describe('suggestFix', () => {
  it('police inconnue → police par défaut, en gardant le style', () => {
    const fix = suggestFix(el({ fontFamily: 'Arial', fontStyle: 'italic bold' }), { reason: 'unknown-font', family: 'Arial' })!
    expect(fix.patch).toEqual({ fontFamily: '"Inter", sans-serif' })
    expect(fix.label).toBe('Utiliser Inter')
  })

  it('gras absent → on retire le gras', () => {
    const fix = suggestFix(el({ fontFamily: '"Bebas Neue", sans-serif', fontStyle: 'bold' }), { reason: 'missing-variant', family: 'Bebas Neue', variantStyle: 'bold' })!
    expect(fix.patch).toEqual({ fontStyle: 'normal' })
    expect(fix.label).toBe('Retirer gras et italique')
  })

  it('italique absent mais gras disponible → on garde le gras', () => {
    const fix = suggestFix(el({ fontFamily: '"Oswald", sans-serif', fontStyle: 'italic bold' }), { reason: 'missing-variant', family: 'Oswald', variantStyle: 'bold italic' })!
    expect(fix.patch).toEqual({ fontStyle: 'bold' })
    expect(fix.label).toBe('Utiliser le style gras')
  })

  it('la correction proposée est toujours exportable en vrai texte', async () => {
    for (const [family, style] of [['Bebas Neue', 'bold'], ['Pacifico', 'italic'], ['Oswald', 'italic'], ['Caveat', 'italic bold']]) {
      const e = el({ fontFamily: `"${family}", sans-serif`, fontStyle: style })
      const issue = (await checkText(e, withFont))!
      const fix = suggestFix(e, issue)!
      expect(await checkText({ ...e, ...fix.patch }, withFont), `${family} ${style} → ${JSON.stringify(fix.patch)}`).toBeNull()
    }
  })

  it('pas de correction automatique pour un caractère absent ou une police illisible', () => {
    expect(suggestFix(el(), { reason: 'missing-glyph', family: 'Inter', chars: '✓' })).toBeNull()
    expect(suggestFix(el(), { reason: 'font-unreadable', family: 'Inter' })).toBeNull()
  })
})
