import { describe, expect, it } from 'vitest'
import { backdropOf, contrastIssues } from './accessibility'
import { cssBackground, backgroundColors, sameBackground, sanitizePageGradient, withBackgroundGradient, withBackgroundOf } from './pageBackground'
import { collectColors, recolorDoc, replaceColor } from './recolor'
import { pageToSvg } from './svgExport'
import type { Gradient, TrameDocument, TrameElement, TramePage } from './types'

const G: Gradient = { type: 'linear', from: '#102030', to: '#a0b0c0', angle: 90 }
const page = (extra: Partial<TramePage> = {}): TramePage => ({ id: 'p', background: '#ffffff', elements: [], ...extra })
const text = (fill: string): TrameElement => ({ id: 't', type: 'text', x: 100, y: 100, width: 300, height: 60, rotation: 0, opacity: 1, fill, text: 'Bonjour', fontSize: 30 } as TrameElement)

describe('fond de page en dégradé', () => {
  it('pose un dégradé et garde sa première couleur comme couleur de fond', () => {
    const p = withBackgroundGradient(page(), G)
    expect(p.backgroundGradient).toEqual(G)
    expect(p.background).toBe('#102030')
    const back = withBackgroundGradient(p, undefined)
    expect(back.backgroundGradient).toBeUndefined()
    expect(back.background).toBe('#102030')
    expect('backgroundGradient' in back).toBe(false)
  })
  it('donne les couleurs et le CSS du fond', () => {
    expect(backgroundColors(page())).toEqual(['#ffffff'])
    expect(backgroundColors(withBackgroundGradient(page(), G))).toEqual(['#102030', '#a0b0c0'])
    expect(cssBackground(page())).toBe('#ffffff')
    expect(cssBackground(withBackgroundGradient(page(), G))).toBe('linear-gradient(90deg, #102030, #a0b0c0)')
    expect(cssBackground(withBackgroundGradient(page(), { ...G, type: 'radial' }))).toContain('radial-gradient')
  })
  it('compare deux fonds', () => {
    const a = withBackgroundGradient(page(), G)
    expect(sameBackground(a, withBackgroundGradient(page(), { ...G }))).toBe(true)
    expect(sameBackground(a, withBackgroundGradient(page(), { ...G, angle: 45 }))).toBe(false)
    expect(sameBackground(a, page({ background: '#102030' }))).toBe(false)
    expect(sameBackground(page(), page())).toBe(true)
    expect(sameBackground(page(), page({ background: '#000000' }))).toBe(false)
    // l'angle ne compte pas en radial
    const r = { ...G, type: 'radial' as const }
    expect(sameBackground(withBackgroundGradient(page(), r), withBackgroundGradient(page(), { ...r, angle: 10 }))).toBe(true)
  })
  it('recopie le fond d\'une page sur une autre, sans toucher au reste', () => {
    const src = withBackgroundGradient(page(), G)
    const other = page({ id: 'q', background: '#000000', notes: 'n' })
    const out = withBackgroundOf(other, src)
    expect(out).toMatchObject({ id: 'q', notes: 'n', background: '#102030', backgroundGradient: G })
    expect(out.backgroundGradient).not.toBe(src.backgroundGradient)
    expect('backgroundGradient' in withBackgroundOf(src, page({ background: '#333333' }))).toBe(false)
  })
  it('nettoie à la lecture : retire un dégradé incomplet, remet l\'angle et la couleur de fond', () => {
    const bad = { background: '#ffffff', backgroundGradient: { type: 'cône', from: '#000', to: '#fff' } }
    sanitizePageGradient(bad)
    expect(bad).toEqual({ background: '#ffffff' })
    const ok = { background: '#abcdef', backgroundGradient: { type: 'radial', from: '#112233', to: '#445566' } } as { background: string; backgroundGradient?: Gradient }
    sanitizePageGradient(ok)
    expect(ok.backgroundGradient).toEqual({ type: 'radial', from: '#112233', to: '#445566', angle: 135 })
    expect(ok.background).toBe('#112233')
    const none = { background: '#ffffff' }
    sanitizePageGradient(none)
    expect(none).toEqual({ background: '#ffffff' })
  })
})

describe('fond en dégradé : contraste', () => {
  it('un texte est contrôlé sur les deux couleurs du dégradé', () => {
    const t = text('#ffffff')
    const p = withBackgroundGradient(page({ elements: [t] }), { ...G, from: '#000000', to: '#ffffff' })
    const b = backdropOf(p, t)
    expect(b).toEqual({ colors: [[0, 0, 0], [255, 255, 255]] })
    // blanc sur blanc : le pire cas est insuffisant
    expect(contrastIssues({ pages: [p] }).map((i) => i.kind)).toEqual(['contrast'])
    const ok = withBackgroundGradient(page({ elements: [text('#ffffff')] }), { ...G, from: '#000000', to: '#202020' })
    expect(contrastIssues({ pages: [ok] })).toEqual([])
  })
})

describe('fond en dégradé : recoloration', () => {
  const doc = (p: TramePage): TrameDocument => ({ version: 2, name: 'T', width: 1000, height: 1000, pages: [p] })
  it('relève les deux couleurs du dégradé', () => {
    const colors = collectColors(doc(withBackgroundGradient(page(), G)), new Set(['p'])).map((c) => c.color).sort()
    expect(colors).toEqual(['#102030', '#a0b0c0'])
  })
  it('remplace une couleur du dégradé partout, et la couleur de fond suit', () => {
    const d = doc(withBackgroundGradient(page(), G))
    const { doc: out, changed } = replaceColor(d, '#102030', '#ff0000', false)
    expect(changed).toBe(0) // « changed » ne compte que les éléments
    expect(out.pages[0].backgroundGradient).toEqual({ ...G, from: '#ff0000' })
    expect(out.pages[0].background).toBe('#ff0000')
  })
  it('respecte l\'option « fond » : sans elle le dégradé ne change pas', () => {
    const d = doc(withBackgroundGradient(page(), G))
    const out = recolorDoc(d, new Map([['#102030', '#ff0000']]), { pageIds: new Set(['p']), enforced: false, background: false })
    expect(out.doc).toBe(d)
  })
})

describe('fond en dégradé : SVG', () => {
  it('écrit un vrai dégradé pour la page', async () => {
    const d: TrameDocument = { version: 2, name: 'T', width: 400, height: 300, pages: [withBackgroundGradient(page(), G)] }
    const svg = await pageToSvg(d, d.pages[0], { embedFonts: false })
    expect(svg).toContain('<linearGradient id="page-bg"')
    expect(svg).toContain('fill="url(#page-bg)"')
    const plain = await pageToSvg(d, page(), { embedFonts: false })
    expect(plain).not.toContain('page-bg')
  })
})
