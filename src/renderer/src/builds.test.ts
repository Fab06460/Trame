import { describe, expect, it } from 'vitest'
import { buildChoices, buildNumbers, endOf, MAX_BUILD, nextPosition, pageAtStep, prevPosition, sanitizeBuild, stepsOf, withGroupMates } from './builds'
import type { TrameDocument, TrameElement, TramePage } from './types'

const el = (id: string, extra: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, fill: '#000', ...extra })
const page = (id: string, elements: TrameElement[]): TramePage => ({ id, background: '#fff', elements })
const doc = (...pages: TramePage[]): Pick<TrameDocument, 'pages'> => ({ pages })

const built = page('p', [el('a'), el('b', { build: 1 }), el('c', { build: 1 }), el('d', { build: 3 }), el('h', { build: 2, hidden: true })])

describe('apparition pas à pas', () => {
  it('numéros utilisés : triés, sans doublon, sans calque masqué', () => {
    expect(buildNumbers(built)).toEqual([1, 3])
    expect(buildNumbers(page('x', [el('a')]))).toEqual([])
  })
  it('nombre de clics : des numéros troués comptent pour un clic chacun', () => {
    expect(stepsOf(built)).toBe(2)
    expect(stepsOf(page('x', [el('a')]))).toBe(0)
  })
  it('pageAtStep : la page elle-même sans apparition', () => {
    const p = page('x', [el('a')])
    expect(pageAtStep(p, 0)).toBe(p)
    expect(pageAtStep(p, 5)).toBe(p)
  })
  it('pageAtStep : seuls les éléments déjà apparus sont gardés', () => {
    const ids = (n: number): string[] => pageAtStep(built, n).elements.map((e) => e.id)
    expect(ids(0)).toEqual(['a', 'h'])
    expect(ids(1)).toEqual(['a', 'b', 'c', 'h'])
    expect(ids(2)).toEqual(['a', 'b', 'c', 'd', 'h'])
    expect(ids(99)).toEqual(['a', 'b', 'c', 'd', 'h'])
    expect(ids(-3)).toEqual(['a', 'h'])
  })
  it('pageAtStep ne modifie pas la page reçue', () => {
    pageAtStep(built, 0)
    expect(built.elements).toHaveLength(5)
  })
})

describe('navigation', () => {
  const d = doc(built, page('q', [el('z')]), page('r', [el('y', { build: 1 })]))
  it('suivant : les clics de la page, puis la page suivante au début', () => {
    expect(nextPosition(d, { index: 0, step: 0 })).toEqual({ index: 0, step: 1 })
    expect(nextPosition(d, { index: 0, step: 1 })).toEqual({ index: 0, step: 2 })
    expect(nextPosition(d, { index: 0, step: 2 })).toEqual({ index: 1, step: 0 })
    expect(nextPosition(d, { index: 1, step: 0 })).toEqual({ index: 2, step: 0 })
  })
  it('suivant : on s\'arrête au bout de la dernière page', () => {
    expect(nextPosition(d, { index: 2, step: 1 })).toEqual({ index: 2, step: 1 })
  })
  it('précédent : un clic de moins, puis la page précédente entièrement montrée', () => {
    expect(prevPosition(d, { index: 2, step: 1 })).toEqual({ index: 2, step: 0 })
    expect(prevPosition(d, { index: 2, step: 0 })).toEqual({ index: 1, step: 0 })
    expect(prevPosition(d, { index: 1, step: 0 })).toEqual({ index: 0, step: 2 })
  })
  it('précédent : on s\'arrête avant la première page', () => {
    expect(prevPosition(d, { index: 0, step: 0 })).toEqual({ index: 0, step: 0 })
  })
  it('endOf : la page entièrement montrée', () => {
    expect(endOf(d, 0)).toEqual({ index: 0, step: 2 })
    expect(endOf(d, 1)).toEqual({ index: 1, step: 0 })
    expect(endOf(d, 9)).toEqual({ index: 9, step: 0 })
  })
  it('un document sans apparition se parcourt comme avant', () => {
    const plain = doc(page('a', [el('1')]), page('b', [el('2')]))
    expect(nextPosition(plain, { index: 0, step: 0 })).toEqual({ index: 1, step: 0 })
    expect(prevPosition(plain, { index: 1, step: 0 })).toEqual({ index: 0, step: 0 })
  })
})

describe('réglage', () => {
  it('un groupe apparaît d\'un seul bloc', () => {
    const els = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c'), el('d', { groupId: 'h' })]
    expect(withGroupMates(els, ['a'])).toEqual(['a', 'b'])
    expect(withGroupMates(els, ['c'])).toEqual(['c'])
    expect(withGroupMates(els, ['a', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('choix : dès l\'ouverture, les clics existants, et un nouveau clic', () => {
    expect(buildChoices(page('x', [el('a')]))).toEqual([0, 1])
    expect(buildChoices(built)).toEqual([0, 1, 2, 3, 4])
  })
  it('choix : plafonné', () => {
    expect(buildChoices(page('x', [el('a', { build: MAX_BUILD })])).at(-1)).toBe(MAX_BUILD)
  })
  it('sanitizeBuild : entier de 1 à 30 seulement', () => {
    const keep = { build: 3 }
    sanitizeBuild(keep)
    expect(keep).toEqual({ build: 3 })
    for (const bad of [0, -1, 31, 1.5, '2', null, NaN, Infinity]) {
      const e: Record<string, unknown> = { build: bad }
      sanitizeBuild(e)
      expect('build' in e).toBe(false)
    }
  })
})
