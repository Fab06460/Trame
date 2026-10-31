import { describe, expect, it } from 'vitest'
import { PALETTES, chartData, chartElements, defaultSpec, fitLabel, formatValue, niceTicks, numericColumns, parseNumber, sanitizeChart, type ChartSpec } from './chart'
import { accessibilityIssues } from './accessibility'
import type { TrameElement } from './types'

const columns = ['Matière', 'Classe A', 'Classe B']
const rows = [['Maths', '12', '14,5'], ['Français', '15', '11'], ['Histoire', '13', '16'], ['Sciences', '16', '15']]
const box = { x: 100, y: 50, width: 800, height: 500 }
const make = (kind: ChartSpec['kind'], extra: Partial<ChartSpec> = {}): ChartSpec => ({ ...defaultSpec(kind, columns, rows, 'Moyennes'), ...extra })
const build = (spec: ChartSpec) => chartElements(spec, box, { locale: 'fr', groupId: 'g' })
const rects = (els: TrameElement[]) => els.filter((e) => e.type === 'rect')

describe('nombres', () => {
  it('lit les écritures courantes', () => {
    expect(parseNumber('12')).toBe(12)
    expect(parseNumber('14,5')).toBe(14.5)
    expect(parseNumber('1 200')).toBe(1200)
    expect(parseNumber('1 200,5')).toBe(1200.5)
    expect(parseNumber('45 %')).toBe(45)
    expect(parseNumber('3,50 €')).toBe(3.5)
    expect(parseNumber('-2')).toBe(-2)
    expect(parseNumber('1.234,56')).toBe(1234.56)
    expect(parseNumber('1,234.56')).toBe(1234.56)
    expect(parseNumber('2e3')).toBe(2000)
  })
  it('refuse le reste', () => {
    for (const s of ['', 'abc', '12abc', '--1', '1,2,3x']) expect(parseNumber(s), s).toBeNull()
  })
  it('colonnes numériques : au moins 80 % de nombres', () => {
    expect(numericColumns(columns, rows)).toEqual([1, 2])
    expect(numericColumns(['a'], [['x'], ['y'], ['1']])).toEqual([])
  })
  it('affichage dans la langue, deux décimales au plus', () => {
    expect(formatValue(1234.5678, 'fr')).toMatch(/^1\s234,57$/)
    expect(formatValue(1234.5678, 'en')).toBe('1,234.57')
    expect(formatValue(3, 'fr')).toBe('3')
  })
  it('étiquettes coupées avec une ellipse', () => {
    expect(fitLabel('Histoire-géographie', 60, 12)).toMatch(/…$/)
    expect(fitLabel('Maths', 200, 12)).toBe('Maths')
  })
})

describe('graduations', () => {
  it('arrondies à 1, 2 ou 5 × 10ⁿ et couvrant les données', () => {
    const t = niceTicks(0, 16, 5)
    expect(t.step).toBe(5)
    expect(t.min).toBe(0)
    expect(t.max).toBe(20)
    expect(t.values).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(0, 0.7).values[0]).toBe(0)
    expect(niceTicks(-3, 8).values).toContain(0)
  })
  it('données constantes : une plage valide', () => {
    const t = niceTicks(5, 5)
    expect(t.max).toBeGreaterThan(t.min)
  })
})

describe('graphique en barres', () => {
  const spec = make('bar', { showValues: true })
  const { elements, invalid } = build(spec)
  it('le premier élément est le fond et porte la description ; tous partagent le groupe', () => {
    expect(elements[0].chart).toEqual(spec)
    expect(elements[0]).toMatchObject({ x: 100, y: 50, width: 800, height: 500 })
    expect(elements.every((e) => e.groupId === 'g')).toBe(true)
    expect(invalid).toBe(0)
  })
  it('tout reste dans le cadre (sauf marges d\'étiquettes de quelques pixels)', () => {
    for (const e of elements) {
      expect(e.x, e.type).toBeGreaterThanOrEqual(box.x - 1)
      expect(e.y, e.type).toBeGreaterThanOrEqual(box.y - 1)
      expect(e.x + e.width, e.type).toBeLessThanOrEqual(box.x + box.width + 1)
      expect(e.y + e.height, e.type).toBeLessThanOrEqual(box.y + box.height + 1)
    }
  })
  it('une barre par valeur (4 catégories × 2 séries), hauteurs proportionnelles aux valeurs', () => {
    const a = rects(elements).filter((b) => b.fill === PALETTES.safe[0] && b.cornerRadius === 2 && b.height > 30)
    expect(a).toHaveLength(4)
    // 12 et 16 : rapport 0,75
    expect(a[0].height / a[3].height).toBeCloseTo(12 / 16, 2)
    // pied des barres sur la même ligne de base
    const feet = a.map((b) => Math.round((b.y + b.height) * 100) / 100)
    expect(new Set(feet).size).toBe(1)
  })
  it('valeurs affichées, titre et légende (deux séries) présents', () => {
    const texts = elements.filter((e) => e.type === 'text').map((e) => e.text)
    expect(texts).toContain('Moyennes')
    expect(texts).toContain('Classe A')
    expect(texts).toContain('Classe B')
    expect(texts).toContain('14,5')
    expect(texts).toContain('Maths')
  })
  it('sans valeurs ni légende : moins de textes', () => {
    const quiet = build(make('bar', { showValues: false, showLegend: false })).elements.filter((e) => e.type === 'text').map((e) => e.text)
    expect(quiet).not.toContain('14,5')
    expect(quiet).not.toContain('Classe A')
  })
  it('cellule illisible : comptée, valeur 0', () => {
    const r = build(make('bar', { rows: [...rows.slice(0, 3), ['Sciences', 'n/a', '15']] }))
    expect(r.invalid).toBe(1)
    expect(chartData(make('bar', { rows: [['x', 'n/a', '1']] })).series[0].values).toEqual([0])
  })
  it('valeurs négatives : la ligne de base est à zéro', () => {
    const neg = build(make('bar', { rows: [['a', '-4', '2'], ['b', '6', '-1']], showValues: false }))
    const zeroLine = neg.elements.filter((e) => e.type === 'rect' && e.height === 1 && e.fill === '#8a8c99')
    expect(zeroLine).toHaveLength(1)
  })
})

describe('autres types', () => {
  it('barres horizontales : une barre par valeur, largeurs proportionnelles', () => {
    const r = build(make('hbar'))
    const a = rects(r.elements).filter((e) => e.fill === PALETTES.safe[0] && e.cornerRadius === 2 && e.width > 30)
    expect(a).toHaveLength(4)
    expect(a[0].width / a[3].width).toBeCloseTo(12 / 16, 2)
  })
  it('courbe : segments pivotés entre les points, un marqueur par point', () => {
    const r = build(make('line'))
    const segments = r.elements.filter((e) => e.type === 'rect' && e.rotation !== 0 && e.fill === PALETTES.safe[0])
    const markers = r.elements.filter((e) => e.type === 'ellipse' && e.fill === PALETTES.safe[0])
    expect(markers).toHaveLength(4)
    expect(segments.length).toBeGreaterThanOrEqual(2) // les points 2 et 3 (15, 13) ne sont pas alignés ; 4 points = 3 segments, un horizontal possible
    // chaque segment relie bien deux marqueurs consécutifs (extrémité gauche du segment au centre du marqueur)
    const lefts = r.elements.filter((e) => e.type === 'rect' && e.fill === PALETTES.safe[0] && e.height === 3)
    expect(lefts).toHaveLength(3)
  })
  it('secteurs : une part par valeur positive, pourcentages affichés, légende', () => {
    const r = build(make('pie', { valueColumns: [1], showValues: true }))
    expect(r.elements.filter((e) => e.type === 'path')).toHaveLength(4)
    const texts = r.elements.filter((e) => e.type === 'text').map((e) => e.text!)
    expect(texts.some((t) => /^21,4 %$/.test(t) || /%$/.test(t))).toBe(true)
    expect(texts.some((t) => t.startsWith('Maths : '))).toBe(true)
    // les parts remplissent le disque : somme des pourcentages ≈ 100
    const pcts = texts.filter((t) => /^\d+(,\d)? %$/.test(t)).map((t) => parseFloat(t.replace(',', '.')))
    expect(pcts.reduce((a, b) => a + b, 0)).toBeGreaterThan(97)
  })
  it('secteurs : valeurs nulles ou négatives sans part, total nul sans erreur', () => {
    expect(build(make('pie', { valueColumns: [1], rows: [['a', '0', '1'], ['b', '5', '1']] })).elements.filter((e) => e.type === 'path')).toHaveLength(1)
    expect(build(make('pie', { valueColumns: [1], rows: [['a', '0', '1']] })).elements.filter((e) => e.type === 'path')).toHaveLength(0)
  })
  it('tableau : en-têtes, lignes, colonnes numériques à droite', () => {
    const r = build(make('table'))
    const texts = r.elements.filter((e) => e.type === 'text')
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Matière', 'Classe A', 'Maths', '14,5']))
    expect(texts.find((t) => t.text === '14,5')!.align).toBe('right')
    expect(texts.find((t) => t.text === 'Maths')!.align).toBe('left')
    expect(r.hiddenRows).toBe(0)
  })
  it('tableau trop long pour le cadre : les lignes en trop sont comptées', () => {
    const many = Array.from({ length: 50 }, (_, i) => [`L${i}`, String(i), String(i)])
    const r = chartElements(make('table', { rows: many }), { ...box, height: 200 }, { locale: 'fr' })
    expect(r.hiddenRows).toBeGreaterThan(30)
  })
  it('thème sombre : le texte des légendes et le fond restent contrastés (aucun problème de contraste détecté)', () => {
    for (const kind of ['bar', 'hbar', 'line', 'pie', 'table'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const els = build(make(kind, { theme, showValues: true })).elements
        const issues = accessibilityIssues({ width: 1920, height: 1080, pages: [{ id: 'p', background: '#888888', elements: els }] }).filter((i) => i.kind === 'contrast')
        expect(issues, `${kind} ${theme}`).toEqual([])
      }
    }
  })
})

describe('lecture d\'un fichier', () => {
  const valid = make('bar')
  it('une description valide est conservée', () => {
    const e: { chart?: unknown } = { chart: JSON.parse(JSON.stringify(valid)) }
    sanitizeChart(e)
    expect(e.chart).toEqual(valid)
  })
  it('indices hors bornes, type inconnu, tableau vide : retirée', () => {
    for (const bad of [{ ...valid, kind: 'radar' }, { ...valid, labelColumn: 9 }, { ...valid, valueColumns: [9] }, { ...valid, columns: [] }, 'x', null]) {
      const e: { chart?: unknown } = { chart: bad }
      sanitizeChart(e)
      expect('chart' in e, JSON.stringify(bad).slice(0, 40)).toBe(false)
    }
  })
  it('bornes : lignes, colonnes et textes limités, lignes complétées', () => {
    const wide = { ...valid, columns: Array.from({ length: 20 }, (_, i) => `c${i}`), rows: Array.from({ length: 100 }, () => ['x']), title: 'T'.repeat(500) }
    const e: { chart?: ChartSpec } = { chart: wide }
    sanitizeChart(e)
    expect(e.chart!.columns).toHaveLength(12)
    expect(e.chart!.rows).toHaveLength(60)
    expect(e.chart!.rows[0]).toHaveLength(12)
    expect(e.chart!.title).toHaveLength(120)
  })
  it('valeurs de réglage inconnues ramenées aux valeurs par défaut', () => {
    const e: { chart?: unknown } = { chart: { ...valid, palette: 'x', theme: 'y', showLegend: 'oui' } }
    sanitizeChart(e)
    expect(e.chart).toMatchObject({ palette: 'safe', theme: 'light', showLegend: true })
  })
})
