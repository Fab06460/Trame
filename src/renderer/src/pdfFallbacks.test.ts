import { describe, expect, it } from 'vitest'
import { describeFallbacks, explain, type PdfFallback } from '@/pdfFallbacks'
import { diagnoseFont } from '@/pdfFonts'

const fb = (over: Partial<PdfFallback> = {}): PdfFallback => ({ page: 1, text: 'Bonjour', reason: 'unknown-font', family: 'Helvetica Neue', ...over })

describe('describeFallbacks', () => {
  it('ne dit rien quand tout est en vrai texte', () => {
    expect(describeFallbacks([], 3)).toBeNull()
  })

  it('un seul texte : singulier et cause', () => {
    const d = describeFallbacks([fb()], 1)!
    expect(d.message).toBe("PDF enregistré — 1 texte exporté sous forme d'image")
    expect(d.detail).toContain("Il s'affiche correctement")
    expect(d.detail).toContain("n'est pas sélectionnable")
    expect(d.detail).toContain('« Bonjour »')
    expect(d.detail).toContain('Helvetica Neue')
    expect(d.detail).toContain('menu « Police »')
  })

  it('plusieurs textes : pluriel', () => {
    const d = describeFallbacks([fb(), fb({ text: 'Autre' })], 1)!
    expect(d.message).toBe("PDF enregistré — 2 textes exportés sous forme d'image")
    expect(d.detail).toContain('Ils s\'affichent correctement')
    expect(d.detail).toContain('ne sont pas sélectionnables')
  })

  it('indique la page seulement s’il y en a plusieurs', () => {
    expect(describeFallbacks([fb({ page: 2 })], 1)!.detail).not.toContain('Page 2')
    expect(describeFallbacks([fb({ page: 2 })], 3)!.detail).toContain('Page 2 ·')
  })

  it('abrège les longs textes et les retours à la ligne', () => {
    const d = describeFallbacks([fb({ text: 'ligne un\n\nligne deux ' + 'x'.repeat(80) })], 1)!
    expect(d.detail).toContain('« ligne un ligne deux')
    expect(d.detail).toContain('…')
    expect(d.detail).not.toContain('\n\nligne deux')
  })

  it('limite la liste et compte le reste', () => {
    const many = Array.from({ length: 9 }, (_, i) => fb({ text: `texte ${i}` }))
    const d = describeFallbacks(many, 1)!
    expect(d.message).toContain('9 textes')
    expect(d.detail).toContain('« texte 5 »')
    expect(d.detail).not.toContain('« texte 6 »')
    expect(d.detail).toContain('… et 3 autres.')
  })
})

describe('explain', () => {
  it('une cause par type', () => {
    expect(explain(fb({ reason: 'missing-variant', family: 'Bebas Neue', variantStyle: 'bold' }))).toBe(
      "« Bebas Neue » n'existe pas en gras : retirez ce style ou choisissez une autre police"
    )
    expect(explain(fb({ reason: 'missing-glyph', chars: '✓≈' }))).toBe(
      'caractère(s) absent(s) de la police : ✓ ≈ (seuls les caractères latins sont embarqués : remplacez-les pour obtenir du texte sélectionnable)'
    )
    expect(explain(fb({ reason: 'font-unreadable', family: 'Inter' }))).toContain('n\'a pas pu être lue')
  })
})

describe('diagnoseFont', () => {
  it('police connue → choix ; sinon la raison', () => {
    expect(diagnoseFont('"Inter", sans-serif', 'bold')).toMatchObject({ ok: true })
    expect(diagnoseFont('Helvetica Neue, Arial, sans-serif', 'normal')).toEqual({ ok: false, reason: 'unknown-font', family: 'Helvetica Neue' })
    expect(diagnoseFont(undefined, undefined)).toEqual({ ok: false, reason: 'unknown-font', family: '' })
  })

  it('variante absente : libellé du style demandé', () => {
    expect(diagnoseFont('"Bebas Neue", sans-serif', 'bold')).toMatchObject({ reason: 'missing-variant', family: 'Bebas Neue', variantStyle: 'bold' })
    expect(diagnoseFont('"Pacifico", cursive', 'italic')).toMatchObject({ reason: 'missing-variant', variantStyle: 'italic' })
    expect(diagnoseFont('"Oswald", sans-serif', 'italic bold')).toMatchObject({ reason: 'missing-variant', variantStyle: 'bold italic' })
  })
})
