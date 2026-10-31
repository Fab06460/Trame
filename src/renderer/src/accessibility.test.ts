import { describe, expect, it } from 'vitest'
import { accessibilityIssues, accessibleColor, backdropOf, contrastFix, unverifiedTexts, contrastIssues, contrastRatio, isLargeText, luminance, minTextSize, parseHex, readingOrderIssues, smallTextIssues, toHex, visualOrder } from './accessibility'
import type { TrameElement, TramePage } from './types'

let n = 0
const el = (type: TrameElement['type'], extra: Partial<TrameElement> = {}): TrameElement => ({ id: `e${++n}`, type, x: 0, y: 0, width: 200, height: 50, rotation: 0, opacity: 1, fill: '#000000', ...extra })
const text = (extra: Partial<TrameElement> = {}): TrameElement => el('text', { text: 'Bonjour', fontSize: 30, ...extra })
const page = (elements: TrameElement[], background = '#ffffff'): TramePage => ({ id: `p${++n}`, background, elements })

describe('couleurs', () => {
  it('lit #rgb et #rrggbb, refuse le reste', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#1E90ff')).toEqual([30, 144, 255])
    expect(parseHex('transparent')).toBeNull()
    expect(parseHex('red')).toBeNull()
    expect(parseHex('#12')).toBeNull()
    expect(toHex([255, 128.4, 0])).toBe('#ff8000')
  })
  it('rapports WCAG connus : noir sur blanc 21, gris #767676 sur blanc ≈ 4,54, identiques 1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2)
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBeCloseTo(1, 9)
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 9)
  })
  it('grand texte : 24 px, ou 18,67 px en gras', () => {
    expect(isLargeText({ fontSize: 24 })).toBe(true)
    expect(isLargeText({ fontSize: 20 })).toBe(false)
    expect(isLargeText({ fontSize: 19, fontStyle: 'bold' })).toBe(true)
    expect(isLargeText({ fontSize: 18, fontStyle: 'bold' })).toBe(false)
  })
})

describe('fond d\'un texte', () => {
  it('sans forme : la couleur de la page', () => {
    const t = text()
    expect(backdropOf(page([t], '#102030'), t)).toEqual({ colors: [[16, 32, 48]] })
  })
  it('un rectangle sous le texte devient le fond ; l\'opacité se mélange', () => {
    const t = text({ x: 10, y: 10 })
    const p = page([el('rect', { width: 400, height: 400, fill: '#000000', opacity: 0.5 }), t])
    const b = backdropOf(p, t)
    expect('colors' in b && b.colors[0].map(Math.round)).toEqual([128, 128, 128])
  })
  it('une forme qui ne recouvre pas le centre du texte, ou placée au-dessus, ne compte pas', () => {
    const t = text({ x: 10, y: 10 })
    expect(backdropOf(page([el('rect', { x: 300, width: 100, fill: '#000' }), t]), t)).toEqual({ colors: [[255, 255, 255]] })
    expect(backdropOf(page([t, el('rect', { width: 400, height: 400, fill: '#000' })]), t)).toEqual({ colors: [[255, 255, 255]] })
  })
  it('une ellipse : le centre du texte doit être dedans', () => {
    const t = text({ x: 0, y: 0, width: 20, height: 20 })
    const round = el('ellipse', { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' })
    expect(backdropOf(page([round, t]), t)).toEqual({ colors: [[255, 255, 255]] }) // centre (10,10) hors du disque de rayon 50 centré (50,50)
    const t2 = text({ x: 40, y: 40, width: 20, height: 20 })
    expect(backdropOf(page([round, t2]), t2)).toEqual({ colors: [[255, 0, 0]] })
  })
  it('un dégradé donne les deux couleurs ; une image devant le texte rend le fond inconnu', () => {
    const t = text({ x: 10, y: 10 })
    const g = el('rect', { width: 400, height: 400, fill: '#000', gradient: { type: 'linear', from: '#000000', to: '#ffffff', angle: 90 } })
    expect(backdropOf(page([g, t]), t)).toEqual({ colors: [[0, 0, 0], [255, 255, 255]] })
    expect(backdropOf(page([el('image', { width: 400, height: 400, src: 'data:image/png;base64,AA' }), t]), t)).toEqual({ unknown: 'image' })
  })
  it('calque masqué : ignoré', () => {
    const t = text({ x: 10, y: 10 })
    expect(backdropOf(page([el('rect', { width: 400, height: 400, fill: '#000', hidden: true }), t]), t)).toEqual({ colors: [[255, 255, 255]] })
  })
})

describe('contraste', () => {
  const doc = (elements: TrameElement[], background?: string) => ({ pages: [page(elements, background)] })
  it('noir sur blanc : rien à signaler', () => {
    expect(contrastIssues(doc([text()]))).toEqual([])
  })
  it('gris clair sur blanc : signalé, avec le rapport et les couleurs', () => {
    const [i] = contrastIssues(doc([text({ fill: '#cccccc' })]))
    expect(i).toMatchObject({ kind: 'contrast', required: 3, fg: '#cccccc', bg: '#ffffff' })
    expect((i as { ratio: number }).ratio).toBeCloseTo(1.6, 1)
  })
  it('petit texte : 4,5 exigé (un #8c8c8c passe en grand mais pas en petit)', () => {
    expect(contrastIssues(doc([text({ fill: '#8c8c8c', fontSize: 30 })]))).toEqual([])
    expect(contrastIssues(doc([text({ fill: '#8c8c8c', fontSize: 16 })]))).toHaveLength(1)
  })
  it('texte clair sur une forme sombre : bon ; sur la page blanche sans la forme : mauvais', () => {
    const shape = el('rect', { width: 300, height: 300, fill: '#1e1f24' })
    expect(contrastIssues(doc([shape, text({ fill: '#ffffff', x: 10, y: 10 })]))).toEqual([])
    expect(contrastIssues(doc([text({ fill: '#ffffff', x: 10, y: 10 })]))).toHaveLength(1)
  })
  it('dégradé : il faut tenir sur les deux couleurs', () => {
    const g = el('rect', { width: 400, height: 400, fill: '#000', gradient: { type: 'linear', from: '#000000', to: '#ffffff', angle: 90 } })
    expect(contrastIssues(doc([g, text({ fill: '#000000', x: 10, y: 10 })]))).toHaveLength(1)
  })
  it('fond inconnu (image), texte masqué, vide ou transparent : rien d\'affirmé', () => {
    const photo = el('image', { width: 400, height: 400, src: 'data:image/png;base64,AA' })
    expect(contrastIssues(doc([photo, text({ fill: '#cccccc', x: 10, y: 10 })]))).toEqual([])
    expect(contrastIssues(doc([text({ fill: '#ffffff', hidden: true })]))).toEqual([])
    expect(contrastIssues(doc([text({ fill: '#ffffff', text: '  ' })]))).toEqual([])
    expect(contrastIssues(doc([text({ fill: 'transparent' })]))).toEqual([])
  })
  it('l\'opacité du texte compte', () => {
    expect(contrastIssues(doc([text({ fill: '#000000', opacity: 0.2 })]))).toHaveLength(1)
  })
})

describe('correction du contraste', () => {
  it('rend la couleur d\'origine si elle suffit', () => {
    expect(accessibleColor([0, 0, 0], [255, 255, 255], 4.5)).toBe('#000000')
  })
  it('assombrit un gris clair sur blanc jusqu\'au rapport demandé, en gardant la teinte', () => {
    const fixed = accessibleColor([0xcc, 0xaa, 0xaa], [255, 255, 255], 4.5)
    const rgb = parseHex(fixed)!
    expect(contrastRatio(rgb, [255, 255, 255])).toBeGreaterThanOrEqual(4.5)
    expect(rgb[0]).toBeGreaterThan(rgb[2] - 1) // reste rougeâtre
  })
  it('éclaircit sur un fond sombre', () => {
    const rgb = parseHex(accessibleColor([0x33, 0x33, 0x44], [0x10, 0x10, 0x18], 4.5))!
    expect(contrastRatio(rgb, [0x10, 0x10, 0x18])).toBeGreaterThanOrEqual(4.5)
    expect(luminance(rgb)).toBeGreaterThan(0.1)
  })
  it('un dégradé noir → blanc : aucune couleur ne suffit des deux côtés, le meilleur compromis est rendu sans erreur', () => {
    const c = accessibleColor([128, 128, 128], [[0, 0, 0], [255, 255, 255]], 4.5)
    expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('taille du texte', () => {
  it('seuils : 24 px sur une présentation de 1 080 px de haut, 12 px ailleurs', () => {
    expect(minTextSize({ width: 1920, height: 1080 })).toBe(24)
    expect(minTextSize({ width: 794, height: 1123 })).toBe(12)
  })
  it('signale un texte trop petit', () => {
    const d = { width: 1920, height: 1080, pages: [page([text({ fontSize: 16 }), text({ fontSize: 40 })])] }
    const found = smallTextIssues(d)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'small', size: 16, min: 24 })
  })
})

describe('ordre de lecture', () => {
  const t = (id: string, x: number, y: number, extra: Partial<TrameElement> = {}): TrameElement => text({ id, x, y, ...extra })
  it('haut vers bas, puis gauche vers droite ; deux textes à peu près à la même hauteur sont sur la même ligne', () => {
    const order = visualOrder([t('d', 0, 300), t('b', 400, 8), t('a', 0, 0), t('c', 0, 100)]).map((e) => e.id)
    expect(order).toEqual(['a', 'b', 'c', 'd'])
  })
  it('un seul texte, ou déjà dans l\'ordre : rien à signaler', () => {
    expect(readingOrderIssues({ pages: [page([t('a', 0, 0)])] })).toEqual([])
    expect(readingOrderIssues({ pages: [page([t('a', 0, 0), t('b', 0, 100), t('c', 0, 200)])] })).toEqual([])
  })
  it('titre posé après le corps : signalé, avec l\'ordre à adopter', () => {
    const p = page([t('corps', 0, 200), t('titre', 0, 0)])
    const [i] = readingOrderIssues({ pages: [p] })
    expect(i).toMatchObject({ kind: 'order', elementIds: ['titre', 'corps'] })
  })
  it('les formes et les images ne comptent pas', () => {
    const p = page([el('rect', { y: 500 }), t('a', 0, 0), el('rect'), t('b', 0, 100)])
    expect(readingOrderIssues({ pages: [p] })).toEqual([])
  })
})

describe('ensemble', () => {
  it('tout est regroupé, par page', () => {
    const d = { width: 1920, height: 1080, pages: [page([text({ fontSize: 12, fill: '#dddddd' })]), page([text({ id: 'b', y: 200 }), text({ id: 'a', y: 0 })])] }
    const kinds = accessibilityIssues(d).map((i) => `${i.pageIndex}:${i.kind}`)
    expect(kinds).toEqual(['0:contrast', '0:small', '1:order'])
  })
})

describe('corrections et contrôles annexes', () => {
  it('contrastFix : le texte corrigé passe le contrôle', () => {
    const d = { pages: [page([text({ id: 'z', fill: '#cccccc', opacity: 0.6 })])] }
    const [issue] = contrastIssues(d)
    const fix = contrastFix(d, issue as Extract<typeof issue, { kind: 'contrast' }>)!
    expect(fix.elementId).toBe('z')
    expect(fix.patch.opacity).toBe(1)
    const after = { pages: [page([text({ id: 'z', ...fix.patch })])] }
    expect(contrastIssues(after)).toEqual([])
  })
  it('unverifiedTexts : compte les textes posés sur une image', () => {
    const photo = el('image', { width: 400, height: 400, src: 'data:image/png;base64,AA' })
    expect(unverifiedTexts({ pages: [page([photo, text({ x: 10, y: 10 }), text({ x: 900, y: 900 })])] })).toBe(1)
  })
})
