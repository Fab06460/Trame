import { describe, expect, it } from 'vitest'
import { buildPrintHtml } from './printHtml'

const input = { title: 'Cours <1>', width: 794, height: 1123, pages: ['<svg id="a"></svg>', '<svg id="b"></svg>'], fonts: '' }

describe('buildPrintHtml', () => {
  it('une section par feuille, à la taille de la feuille, sans marge', () => {
    const html = buildPrintHtml(input)
    expect(html.match(/<section class="sheet">/g)).toHaveLength(2)
    expect(html).toMatch(/@page\{size:210mm 297mm;margin:0\}/)
  })

  it('n\'a aucun script et n\'autorise que les données intégrées', () => {
    const html = buildPrintHtml(input)
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('img-src data:')
  })

  it('protège le titre', () => {
    expect(buildPrintHtml(input)).toContain('<title>Cours &lt;1&gt;</title>')
  })

  it('refuse une taille de feuille absurde', () => {
    expect(() => buildPrintHtml({ ...input, width: 1 })).toThrow()
  })
})
