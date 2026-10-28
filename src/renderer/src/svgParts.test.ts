import { describe, expect, it } from 'vitest'
import { escXml, fontAttrs, gradientDef, n, shadowFilterDef, strokeAttrs } from './svgParts'

describe('éléments SVG', () => {
  it('échappe les caractères XML', () => {
    expect(escXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;')
  })
  it('écrit les nombres sans notation scientifique, à 3 décimales', () => {
    expect(n(1e-7)).toBe('0')
    expect(n(12.34567)).toBe('12.346')
    expect(n(-0.5)).toBe('-0.5')
    expect(n(1080)).toBe('1080')
  })
  it('police : famille échappée, graisse et style depuis fontStyle', () => {
    expect(fontAttrs({ fontFamily: '"Inter", sans-serif', fontSize: 48, fontStyle: 'bold italic' })).toBe('font-family="&quot;Inter&quot;, sans-serif" font-size="48" font-weight="700" font-style="italic"')
    expect(fontAttrs({ fontFamily: 'Georgia', fontSize: 12, fontStyle: 'normal' })).toBe('font-family="Georgia" font-size="12"')
    expect(fontAttrs({})).toContain('font-family="sans-serif"')
  })
  it('contour : absent sans épaisseur, tirets proportionnels à l\'épaisseur', () => {
    expect(strokeAttrs({ stroke: '#f00' })).toBe('')
    expect(strokeAttrs({ stroke: '#f00', strokeWidth: 0 })).toBe('')
    expect(strokeAttrs({ stroke: '#f00', strokeWidth: 6 })).toBe(' stroke="#f00" stroke-width="6"')
    expect(strokeAttrs({ stroke: '#f00', strokeWidth: 6, strokeDashed: true })).toBe(' stroke="#f00" stroke-width="6" stroke-dasharray="18 12"')
  })
  it('dégradé linéaire : même ligne que l\'éditeur (90° = de gauche à droite)', () => {
    const d = gradientDef('g1', { type: 'linear', from: '#000', to: '#fff', angle: 90 }, 200, 100)
    expect(d).toContain('<linearGradient id="g1" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="200" y2="50">')
    expect(d).toContain('stop offset="0" stop-color="#000"')
    expect(d).toContain('stop offset="1" stop-color="#fff"')
  })
  it('dégradé radial : cercle centré jusqu\'au coin le plus éloigné', () => {
    const d = gradientDef('g2', { type: 'radial', from: '#000', to: '#fff', angle: 0 }, 300, 400)
    expect(d).toContain('cx="150" cy="200" r="250"')
  })
  it('ombre : écart-type = flou / 2, zone de filtre assez grande pour le flou et le décalage', () => {
    const f = shadowFilterDef('s1', { width: 100, height: 50, shadow: { color: '#000000', blur: 20, offsetX: 0, offsetY: 10, opacity: 0.35 } })
    expect(f).toContain('stdDeviation="10"')
    expect(f).toContain('dy="10"')
    expect(f).toContain('flood-opacity="0.35"')
    expect(f).toContain('x="-42" y="-42" width="184" height="134"')
  })
})
