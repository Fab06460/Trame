import { describe, expect, it } from 'vitest'
import { fitText, MIN_FIT } from './mergeFit'
import { fillText, mergeDocument } from './mailMerge'
import type { TrameDocument, TrameElement } from './types'

// mesure simulée : 10 px de large par caractère × taille / 10, boîte de 300 px
const el = (text: string, fontSize = 40, extra: Partial<TrameElement> = {}): TrameElement => ({ id: 'a', type: 'text', x: 0, y: 0, width: 300, height: 48, rotation: 0, opacity: 1, fill: '#000', text, fontSize, mergeFit: true, ...extra })
const lines = (e: TrameElement): number => {
  const perLine = Math.max(1, Math.floor(300 / ((e.fontSize ?? 12) * 0.5)))
  return (e.text ?? '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0)
}

describe('texte qui s\'ajuste au publipostage', () => {
  it('un texte qui tient ne change pas', () => {
    const t = el('{{prénom}}')
    const f = el('Ada')
    expect(fitText(t, f, lines)).toBe(f)
  })
  it('un nom trop long rétrécit jusqu\'à tenir sur autant de lignes que le modèle', () => {
    const t = el('{{prénom}}')
    const f = el('Maximilien-Alexandre')
    expect(lines(f)).toBeGreaterThan(1)
    const out = fitText(t, f, lines)
    expect(lines(out)).toBe(1)
    expect(out.fontSize!).toBeLessThan(40)
    expect(out.fontSize!).toBeGreaterThanOrEqual(40 * MIN_FIT)
  })
  it('jamais plus petit que la moitié : au-delà, le texte passe à la ligne', () => {
    const out = fitText(el('{{x}}'), el('x'.repeat(200)), lines)
    expect(out.fontSize).toBe(20)
    expect(lines(out)).toBeGreaterThan(1)
  })
  it('un modèle de deux lignes accepte deux lignes', () => {
    const t = el('{{a}}\n{{b}}')
    const f = el('Ada\nLovelace')
    expect(fitText(t, f, lines)).toBe(f)
  })
  it('l\'interlettrage suit la réduction', () => {
    const out = fitText(el('{{x}}', 40, { letterSpacing: 4 }), el('Maximilien-Alexandre', 40, { letterSpacing: 4 }), lines)
    expect(out.letterSpacing!).toBeLessThan(4)
  })
  it('mergeDocument ajuste seulement les textes marqués et remplis', () => {
    const doc = { version: 2, name: 'd', width: 400, height: 300, pages: [{ id: 'p', background: '#fff', elements: [el('{{prénom}}'), { ...el('{{prénom}}'), id: 'b', mergeFit: undefined }, { ...el('Titre fixe'), id: 'c' }] }] } as unknown as TrameDocument
    const data = { columns: ['prénom'], rows: [['Maximilien-Alexandre']] }
    const out = mergeDocument(doc, data, [0], (tpl, filled) => fitText(tpl, filled, lines))
    const [a, b, c] = out.pages[0].elements
    expect(a.fontSize!).toBeLessThan(40)
    expect(b.fontSize).toBe(40)
    expect(c.fontSize).toBe(40)
    expect(fillText('{{prénom}}', data.columns, data.rows[0])).toBe('Maximilien-Alexandre')
  })
})
