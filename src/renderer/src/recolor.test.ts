import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex } from '@/accessibility'
import { buildMapping, collectColors, normalizeHex, recolorDoc, replaceColor } from '@/recolor'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

const el = (over: Partial<TrameElement> = {}): TrameElement => ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#d62828', ...over })
const page = (id: string, elements: TrameElement[], background = '#ffffff'): TramePage => ({ id, background, elements })
const doc = (pages: TramePage[]): TrameDocument => ({ version: 2, name: 'T', width: 1000, height: 1000, pages })
const all = (d: TrameDocument): Set<string> => new Set(d.pages.map((p) => p.id))
const OPTS = { enforced: false, background: true }
const ratio = (a: string, b: string): number => contrastRatio(parseHex(a)!, parseHex(b)!)

describe('couleurs d’un design', () => {
  it('relève fonds, remplissages, contours, dégradés et ombres, la plus employée d’abord', () => {
    const d = doc([
      page('p', [
        el({ id: '1', width: 500, height: 500, fill: '#d62828' }),
        el({ id: '2', fill: '#003049', stroke: '#F77F00', strokeWidth: 4, shadow: { color: '#111111', blur: 5, offsetX: 1, offsetY: 1, opacity: 0.5 } }),
        el({ id: '3', gradient: { type: 'linear', from: '#fcbf49', to: '#eae2b7', angle: 90 } }),
        el({ id: '4', type: 'image', fill: '#123456', src: 'data:image/png;base64,AA' })
      ])
    ])
    const colors = collectColors(d, all(d)).map((c) => c.color)
    expect(colors[0]).toBe('#ffffff') // le fond de page est la plus grande aire
    expect(colors).toContain('#d62828')
    expect(colors).toContain('#f77f00') // normalisé en minuscules
    expect(colors).toContain('#fcbf49')
    expect(colors).toContain('#111111')
    expect(colors).not.toContain('#123456') // une image n'a pas de couleur de remplissage
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('ignore transparent et les valeurs illisibles', () => {
    const d = doc([page('p', [el({ fill: 'transparent' }), el({ id: 'b', fill: 'rouge' })])])
    expect(collectColors(d, all(d)).map((c) => c.color)).toEqual(['#ffffff'])
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('nope')).toBeNull()
  })

  it('ne regarde que les pages demandées', () => {
    const d = doc([page('p1', [el({ fill: '#d62828' })]), page('p2', [el({ id: 'b', fill: '#2a9d8f' })])])
    expect(collectColors(d, new Set(['p2'])).map((c) => c.color)).not.toContain('#d62828')
  })

  it('laisse de côté les formes d’un graphique ou d’un QR code (régénérées)', () => {
    const d = doc([page('p', [el({ id: 'q', groupId: 'g', qr: { text: 'x', ecc: 'M', dark: '#000000', light: '#ffffff' }, fill: '#ffffff' }), el({ id: 'm', groupId: 'g', fill: '#ff00ff' })])])
    expect(collectColors(d, all(d)).map((c) => c.color)).not.toContain('#ff00ff')
  })
})

describe('correspondance des couleurs', () => {
  const sources = [
    { color: '#ffffff', weight: 10 },
    { color: '#111111', weight: 5 },
    { color: '#d62828', weight: 4 },
    { color: '#fcbf49', weight: 3 },
    { color: '#003049', weight: 2 }
  ]
  const palette = ['#2a9d8f', '#264653', '#e9c46a']

  it('garde blanc, noir et gris quand on le demande', () => {
    const m = buildMapping(sources, palette, true)
    expect(m.has('#ffffff')).toBe(false)
    expect(m.has('#111111')).toBe(false)
    expect([...m.keys()].sort()).toEqual(['#003049', '#d62828', '#fcbf49'])
  })

  it('range du plus clair au plus sombre : le clair reste clair', () => {
    const m = buildMapping(sources, palette, true)
    expect(m.get('#003049')).toBe('#264653') // le plus sombre → le plus sombre
    expect(m.get('#fcbf49')).toBe('#e9c46a') // le plus clair → le plus clair
  })

  it('sans « garder les neutres », le blanc et le noir sont recolorés aussi', () => {
    const m = buildMapping(sources, palette, false)
    expect(m.get('#ffffff')).toBe('#e9c46a')
    expect(m.get('#111111')).toBe('#264653')
  })

  it('une seule couleur reçoit la dominante de la palette ; rien à faire sans palette ni couleur', () => {
    expect(buildMapping([{ color: '#d62828', weight: 1 }], ['#2a9d8f', '#264653'], true).get('#d62828')).toBe('#2a9d8f')
    expect(buildMapping(sources, [], true).size).toBe(0)
    expect(buildMapping([{ color: '#ffffff', weight: 1 }], palette, true).size).toBe(0)
  })
})

describe('recoloriage', () => {
  const mapping = new Map([['#d62828', '#2a9d8f'], ['#003049', '#264653'], ['#fcbf49', '#e9c46a'], ['#111111', '#222222']])

  it('change fond de page, remplissage, contour, dégradé et ombre', () => {
    const d = doc([
      page('p', [
        el({ id: '1', fill: '#d62828', stroke: '#003049', strokeWidth: 3 }),
        el({ id: '2', gradient: { type: 'radial', from: '#fcbf49', to: '#abcdef', angle: 0 }, fill: '#ffffff' }),
        el({ id: '3', fill: '#ffffff', shadow: { color: '#111111', blur: 4, offsetX: 0, offsetY: 0, opacity: 1 } })
      ], '#d62828')
    ])
    const r = recolorDoc(d, mapping, { pageIds: all(d), ...OPTS })
    const [a, b, c] = r.doc.pages[0].elements
    expect(r.doc.pages[0].background).toBe('#2a9d8f')
    expect([a.fill, a.stroke]).toEqual(['#2a9d8f', '#264653'])
    expect(b.gradient).toEqual({ type: 'radial', from: '#e9c46a', to: '#abcdef', angle: 0 }) // seule la couleur connue change
    expect(c.shadow?.color).toBe('#222222')
    expect(r.changed).toBe(3)
    expect(d.pages[0].elements[0].fill).toBe('#d62828') // le document d'origine n'est pas modifié
  })

  it('ne change que les pages demandées, et le fond seulement si on le demande', () => {
    const d = doc([page('p1', [el({ fill: '#d62828' })], '#d62828'), page('p2', [el({ id: 'b', fill: '#d62828' })])])
    const r = recolorDoc(d, mapping, { pageIds: new Set(['p1']), enforced: false, background: false })
    expect(r.doc.pages[0].elements[0].fill).toBe('#2a9d8f')
    expect(r.doc.pages[0].background).toBe('#d62828')
    expect(r.doc.pages[1]).toBe(d.pages[1])
  })

  it('respecte les éléments figés d’un modèle de marque', () => {
    const d = doc([page('p', [el({ id: 'f', fill: '#d62828', protect: 'fixed' }), el({ id: 'r', fill: '#d62828', protect: 'fill' })])])
    const r = recolorDoc(d, mapping, { pageIds: all(d), enforced: true, background: false })
    expect(r.doc.pages[0].elements.map((e) => e.fill)).toEqual(['#d62828', '#2a9d8f'])
    const free = recolorDoc(d, mapping, { pageIds: all(d), enforced: false, background: false })
    expect(free.doc.pages[0].elements.map((e) => e.fill)).toEqual(['#2a9d8f', '#2a9d8f'])
  })

  it('ne touche ni aux images ni aux graphiques et QR codes', () => {
    const d = doc([page('p', [el({ id: 'i', type: 'image', fill: '#d62828', src: 'data:image/png;base64,AA' }), el({ id: 'q', groupId: 'g', fill: '#d62828', chart: { kind: 'bar' } as never }), el({ id: 'm', groupId: 'g', fill: '#d62828' })])])
    const r = recolorDoc(d, mapping, { pageIds: all(d), ...OPTS })
    expect(r.doc.pages[0].elements.map((e) => e.fill)).toEqual(['#d62828', '#d62828', '#d62828'])
    expect(r.changed).toBe(0)
  })

  it('rend le même document quand rien ne correspond', () => {
    const d = doc([page('p', [el({ fill: '#abcdef' })])])
    expect(recolorDoc(d, mapping, { pageIds: all(d), ...OPTS }).doc).toBe(d)
  })

  it('un texte lisible le reste : sa couleur est éclaircie ou assombrie si le nouveau fond l’aurait rendu illisible', () => {
    // texte sombre sur un fond clair (jaune) ; le jaune devient un vert foncé, le texte resterait quasi invisible
    const dark = new Map([['#fcbf49', '#1b4332'], ['#003049', '#1d4a38']])
    const d = doc([page('p', [el({ id: 't', type: 'text', text: 'Bonjour', fontSize: 40, fill: '#003049', x: 10, y: 10, width: 300, height: 60 })], '#fcbf49')])
    expect(ratio('#003049', '#fcbf49')).toBeGreaterThan(4.5)
    const r = recolorDoc(d, dark, { pageIds: all(d), ...OPTS })
    const text = r.doc.pages[0].elements[0]
    expect(ratio(text.fill, r.doc.pages[0].background)).toBeGreaterThanOrEqual(3) // grand texte : 3
    expect(text.fill).not.toBe('#1d4a38')
  })

  it('ne « corrige » pas un texte qui n’était pas lisible au départ', () => {
    const m = new Map([['#fcbf49', '#1b4332'], ['#f5c040', '#1d4a38']])
    const d = doc([page('p', [el({ id: 't', type: 'text', text: 'Pâle', fontSize: 40, fill: '#f5c040', x: 10, y: 10, width: 300, height: 60 })], '#fcbf49')])
    const r = recolorDoc(d, m, { pageIds: all(d), ...OPTS })
    expect(r.doc.pages[0].elements[0].fill).toBe('#1d4a38')
  })
})

describe('remplacer une couleur partout', () => {
  it('change remplissages, contours, dégradés, ombres et fonds de toutes les pages', () => {
    const d = doc([
      page('p', [el({ id: '1', fill: '#D62828', stroke: '#d62828', strokeWidth: 2 }), el({ id: '2', fill: '#003049' })], '#d62828'),
      page('q', [el({ id: '3', gradient: { type: 'linear', from: '#d62828', to: '#003049', angle: 0 } }), el({ id: '4', fill: '#003049', shadow: { color: '#d62828', blur: 4, offsetX: 1, offsetY: 1, opacity: 0.5 } })])
    ])
    const r = replaceColor(d, '#d62828', '#00ff00', false)
    expect(r.doc.pages[0].background).toBe('#00ff00')
    expect(r.doc.pages[0].elements.map((e) => e.fill)).toEqual(['#00ff00', '#003049'])
    expect(r.doc.pages[0].elements[0].stroke).toBe('#00ff00')
    expect(r.doc.pages[1].elements[0].gradient).toMatchObject({ from: '#00ff00', to: '#003049' })
    expect(r.doc.pages[1].elements[1].shadow?.color).toBe('#00ff00')
    expect(collectColors(r.doc, all(r.doc)).map((c) => c.color)).not.toContain('#d62828')
  })

  it('même couleur, couleur invalide ou absente : document inchangé', () => {
    const d = doc([page('p', [el({ fill: '#d62828' })])])
    expect(replaceColor(d, '#d62828', '#D62828', false).doc).toBe(d)
    expect(replaceColor(d, '#d62828', 'rouge', false).doc).toBe(d)
    expect(replaceColor(d, '#123456', '#00ff00', false).doc).toBe(d)
  })
})
