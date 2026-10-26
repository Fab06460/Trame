import { describe, expect, it } from 'vitest'
import { groupLines, groupParagraphs, lineHeightOf, matchFont, type PdfTextItem } from '@/pdfImport/layout'

const it_ = (text: string, x: number, baseline: number, width = text.length * 8, size = 16, font = 'Inter'): PdfTextItem => ({ text, x, baseline, width, size, font })

describe('groupLines', () => {
  it('assemble des fragments de la même ligne, avec une espace quand il y a un vide', () => {
    const lines = groupLines([it_('Bon', 10, 100), it_('jour', 10 + 24 + 6, 100), it_('!', 10 + 24 + 6 + 32, 100, 8)])
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Bon jour!')
    expect(lines[0].x).toBe(10)
  })
  it('sépare des lignes de base différentes et les range dans l\'ordre de lecture', () => {
    const lines = groupLines([it_('deuxième', 10, 140), it_('première', 10, 100)])
    expect(lines.map((l) => l.text)).toEqual(['première', 'deuxième'])
  })
  it('un grand vide (colonnes) fait deux lignes', () => {
    expect(groupLines([it_('gauche', 10, 100), it_('droite', 400, 100)])).toHaveLength(2)
  })
  it('ignore les fragments vides', () => expect(groupLines([it_('', 0, 10), it_('a', 0, 20)])).toHaveLength(1))
})

describe('groupParagraphs', () => {
  const l = (text: string, x: number, baseline: number, width = 200, size = 16, font = 'Inter') => ({ text, x, baseline, width, size, font })
  it('regroupe des lignes alignées à gauche avec un interligne normal', () => {
    const p = groupParagraphs([l('a', 10, 100), l('b', 10, 120), l('c', 10, 140)])
    expect(p).toHaveLength(1)
    expect(p[0].lines).toHaveLength(3)
    expect(lineHeightOf(p[0])).toBe(1.25)
  })
  it('un grand écart vertical commence un nouveau paragraphe', () => expect(groupParagraphs([l('a', 10, 100), l('b', 10, 200)])).toHaveLength(2))
  it('une autre taille ou une autre police aussi', () => {
    expect(groupParagraphs([l('a', 10, 100), l('b', 10, 120, 200, 24)])).toHaveLength(2)
    expect(groupParagraphs([l('a', 10, 100), l('b', 10, 120, 200, 16, 'Lora')])).toHaveLength(2)
  })
  it('détecte un alignement centré', () => {
    const p = groupParagraphs([l('court', 150, 100, 100), l('un peu plus long', 100, 120, 200)])
    expect(p).toHaveLength(1)
    expect(p[0].align).toBe('center')
  })
  it('deux colonnes restent séparées', () => {
    const p = groupParagraphs([l('g1', 10, 100, 100), l('d1', 300, 100, 100), l('g2', 10, 120, 100), l('d2', 300, 120, 100)])
    expect(p.map((x) => x.lines.map((y) => y.text))).toEqual([['g1', 'g2'], ['d1', 'd2']])
  })
  it('interligne d\'une seule ligne : 1', () => expect(lineHeightOf(groupParagraphs([l('a', 0, 10)])[0])).toBe(1))
})

describe('matchFont', () => {
  it('reconnaît une police embarquée, graisse et italique compris', () => {
    expect(matchFont('ABCDEF+Montserrat-BoldItalic')).toMatchObject({ family: '"Montserrat", sans-serif', fontStyle: 'italic bold', exact: true })
    expect(matchFont('Inter-Regular')).toMatchObject({ fontStyle: 'normal', exact: true })
  })
  it('remplace une police inconnue par une police de même nature', () => {
    expect(matchFont('Arial-BoldMT')).toMatchObject({ family: '"Inter", sans-serif', fontStyle: 'bold', exact: false })
    expect(matchFont('TimesNewRomanPS-ItalicMT')).toMatchObject({ family: '"Lora", serif', fontStyle: 'italic', exact: false })
    expect(matchFont('CourierNewPSMT').family).toContain('JetBrains')
  })
  it('n\'invente pas un style que la police n\'a pas', () => {
    expect(matchFont('Bebas-Bold').fontStyle).toBe('normal')
    expect(matchFont('Oswald-Italic').fontStyle).toBe('normal')
  })
})
