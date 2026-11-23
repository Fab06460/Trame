import { describe, expect, it } from 'vitest'
import type { TrameElement } from '@/types'
import { applyPatches, layoutStack, planStack, reflowPage, sanitizeStack, stackContent, stackSpecOf, type Measure, type StackSpec } from './stackLayout'

const el = (id: string, over: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#000', groupId: 'g', ...over })
/** mesure « idéale » : un texte fait 20 px de haut par ligne (une ligne tous les 10 caractères de large) */
const measure: Measure = (e) => (e.type === 'text' ? { width: e.width, height: 20 * Math.max(1, Math.ceil((e.text ?? '').length / 10)) } : { width: e.width, height: e.height })
const spec = (over: Partial<StackSpec> = {}): StackSpec => ({ dir: 'v', gap: 10, align: 'start', pad: 0, ...over })
const stable = (members: TrameElement[], s: StackSpec): TrameElement[] => applyPatches(members, layoutStack(members, s, measure))

describe('layoutStack : pile verticale', () => {
  const members = [el('a', { x: 40, y: 40 }), el('b', { x: 300, y: 500 }), el('c', { x: 5, y: 5, height: 30 })]
  it('range les membres sous l\'ancre avec l\'espacement', () => {
    const out = stable(members, spec())
    const [a, b, c] = out
    expect([a.x, a.y]).toEqual([40, 40]) // l'ancre ne bouge pas
    expect([b.x, b.y]).toEqual([40, 100]) // 40 + 50 + 10
    expect([c.x, c.y]).toEqual([40, 160]) // 100 + 50 + 10
  })
  it('est stable : un second calcul ne change plus rien', () => {
    const once = stable(members, spec())
    expect(layoutStack(once, spec(), measure).size).toBe(0)
  })
  it('aligne au centre et à la fin sur l\'ancre', () => {
    const wide = [el('a', { x: 100, y: 0, width: 200 }), el('b', { width: 100 })]
    expect(stable(wide, spec({ align: 'center' }))[1].x).toBe(150)
    expect(stable(wide, spec({ align: 'end' }))[1].x).toBe(200)
  })
  it('étire les membres à la largeur de l\'ancre', () => {
    const out = stable([el('a', { width: 300 }), el('b', { width: 100 })], spec({ align: 'stretch' }))
    expect(out[1].width).toBe(300)
    expect(out[0].width).toBe(300)
  })
  it('un texte qui s\'allonge repousse les suivants', () => {
    const t = (text: string): TrameElement[] => [el('t', { type: 'text', text, width: 200, height: 20, x: 10, y: 10 }), el('b', { x: 10, y: 0 })]
    const short = stable(t('court'), spec())
    expect(short[1].y).toBe(10 + 20 + 10)
    const long = stable(t('x'.repeat(35)), spec()) // 4 lignes = 80 px
    expect(long[0].height).toBe(80)
    expect(long[1].y).toBe(10 + 80 + 10)
  })
  it('retient la hauteur mesurée d\'un texte dans l\'élément', () => {
    const out = stable([el('t', { type: 'text', text: 'x'.repeat(25), width: 100, height: 5 })], spec())
    expect(out[0].height).toBe(60)
  })
  it('un texte étiré se remesure à sa nouvelle largeur', () => {
    const members = [el('a', { width: 300 }), el('t', { type: 'text', text: 'x'.repeat(5), width: 100, height: 20 })]
    const out = stable(members, spec({ align: 'stretch' }))
    expect(out[1].width).toBe(300)
  })
  it('ignore les éléments masqués et les masques d\'écrêtage', () => {
    const out = stable([el('a'), el('h', { hidden: true, y: 300 }), el('m', { clip: true, y: 400 }), el('b', { y: 900 })], spec())
    expect(out[1].y).toBe(300) // le masqué ne bouge pas
    expect(out[2].y).toBe(400)
    expect(out[3].y).toBe(60)
  })
  it('suit stackAt, puis l\'ordre dans la page', () => {
    const m = [el('a', { stackAt: 2 }), el('b', { stackAt: 0 }), el('c', { stackAt: 1 }), el('d')]
    expect(stackContent(m).map((e) => e.id)).toEqual(['b', 'c', 'a', 'd'])
  })
  it('garde la boîte d\'un élément pivoté dans la pile', () => {
    const out = stable([el('a', { x: 0, y: 0 }), el('r', { x: 0, y: 0, width: 100, height: 50, rotation: 90 })], spec())
    // tourné de 90° autour de son coin : la boîte occupe x de −50 à 0, y de 0 à 100 ; elle est alignée sur le bord gauche de l'ancre et sous elle
    const r = out[1]
    expect(r.x).toBeCloseTo(50, 5)
    expect(r.y).toBeCloseTo(60, 5)
  })
})

describe('layoutStack : pile horizontale', () => {
  it('range de gauche à droite', () => {
    const out = stable([el('a', { x: 10, y: 10, width: 80 }), el('b', { x: 500, y: 500, width: 60 }), el('c', { x: 0, y: 0 })], spec({ dir: 'h', gap: 20 }))
    expect([out[1].x, out[1].y]).toEqual([110, 10])
    expect([out[2].x, out[2].y]).toEqual([190, 10])
  })
  it('centre sur l\'axe horizontal de l\'ancre', () => {
    const out = stable([el('a', { x: 0, y: 0, height: 100 }), el('b', { height: 40 })], spec({ dir: 'h', align: 'center' }))
    expect(out[1].y).toBe(30)
  })
  it('étire en hauteur (sauf un texte)', () => {
    const out = stable([el('a', { height: 100 }), el('b', { height: 20 }), el('t', { type: 'text', text: 'hello', height: 20 })], spec({ dir: 'h', align: 'stretch' }))
    expect(out[1].height).toBe(100)
    expect(out[2].height).toBe(20)
  })
})

describe('layoutStack : fond', () => {
  it('le fond épouse le contenu, avec la marge', () => {
    const members = [el('bg', { stackBg: true, x: 0, y: 0, width: 999, height: 999 }), el('a', { x: 50, y: 60 }), el('b')]
    const out = stable(members, spec({ pad: 20 }))
    // contenu : x 50 → 150, y 60 → 60 + 50 + 10 + 50 = 170
    expect([out[0].x, out[0].y, out[0].width, out[0].height]).toEqual([30, 40, 140, 150])
  })
  it('le fond n\'est pas un membre du contenu et reste droit', () => {
    const out = stable([el('bg', { stackBg: true, rotation: 30 }), el('a')], spec())
    expect(out[0].rotation).toBe(0)
    expect(stackContent([el('bg', { stackBg: true }), el('a')]).map((e) => e.id)).toEqual(['a'])
  })
  it('grandit avec le contenu', () => {
    const base = (text: string): TrameElement[] => [el('bg', { stackBg: true }), el('t', { type: 'text', text, width: 100, height: 20, x: 10, y: 10 })]
    expect(stable(base('court'), spec({ pad: 5 }))[0].height).toBe(30)
    expect(stable(base('x'.repeat(30)), spec({ pad: 5 }))[0].height).toBe(70)
  })
})

describe('reflowPage', () => {
  it('ne touche que les groupes qui sont des piles', () => {
    const els = [el('a', { stack: spec() }), el('b', { stack: spec(), y: 500 }), el('free', { groupId: undefined, y: 7 }), el('other', { groupId: 'h', y: 9 })]
    const patches = reflowPage(els, measure)
    expect([...patches.keys()]).toEqual(['b'])
  })
  it('sans pile, ne calcule rien', () => {
    expect(reflowPage([el('a'), el('b')], measure).size).toBe(0)
  })
  it('les réglages viennent du premier membre qui en porte', () => {
    expect(stackSpecOf([el('a'), el('b', { stack: spec({ gap: 3 }) })])?.gap).toBe(3)
    expect(stackSpecOf([el('a')])).toBeNull()
  })
})

describe('planStack', () => {
  const rectBg = (e: TrameElement): boolean => e.type === 'rect'
  it('range par position, avec l\'écart médian et l\'alignement existants', () => {
    const plan = planStack([el('b', { x: 0, y: 200 }), el('a', { x: 0, y: 0 }), el('c', { x: 0, y: 400 })], 'v', measure, () => false)!
    expect(plan.order).toEqual(['a', 'b', 'c'])
    expect(plan.spec).toEqual({ dir: 'v', gap: 150, align: 'start', pad: 0 })
  })
  it('reconnaît des éléments centrés', () => {
    const plan = planStack([el('a', { x: 100, y: 0, width: 200 }), el('b', { x: 150, y: 80, width: 100 })], 'v', measure, () => false)!
    expect(plan.spec.align).toBe('center')
  })
  it('prend pour fond la plus grande forme qui contient les autres', () => {
    const plan = planStack([el('card', { x: 0, y: 0, width: 300, height: 300 }), el('t', { type: 'text', text: 'hello', x: 20, y: 30, width: 200, height: 20 }), el('b', { x: 20, y: 100, width: 100, height: 50 })], 'v', measure, rectBg)!
    expect(plan.backgroundId).toBe('card')
    expect(plan.order).toEqual(['t', 'b'])
    expect(plan.spec.pad).toBe(20)
  })
  it('sans forme qui contienne tout, pas de fond', () => {
    const plan = planStack([el('a', { x: 0, y: 0 }), el('b', { x: 0, y: 100 })], 'v', measure, rectBg)!
    expect(plan.backgroundId).toBeUndefined()
  })
  it('demande au moins deux éléments', () => {
    expect(planStack([el('a')], 'v', measure, () => false)).toBeNull()
  })
  it('horizontale : par abscisse', () => {
    expect(planStack([el('b', { x: 300 }), el('a', { x: 0 })], 'h', measure, () => false)!.order).toEqual(['a', 'b'])
  })
})

describe('sanitizeStack', () => {
  it('garde des réglages valides et borne les nombres', () => {
    const e: Record<string, unknown> = { groupId: 'g', stack: { dir: 'h', gap: 9999, align: 'center', pad: -4 }, stackAt: 2.4, stackBg: true }
    sanitizeStack(e)
    expect(e.stack).toEqual({ dir: 'h', gap: 500, align: 'center', pad: 0 })
    expect(e.stackAt).toBe(2)
    expect(e.stackBg).toBe(true)
  })
  it('retire tout ce qui n\'est pas une pile valide', () => {
    for (const bad of [{ stack: { dir: 'x', gap: 1, align: 'start', pad: 0 } }, { stack: { dir: 'v', gap: 'a', align: 'start', pad: 0 } }, { stack: { dir: 'v', gap: 1, align: 'plouf', pad: 0 } }, { stack: { dir: 'v', gap: 1, align: 'start', pad: 0 }, groupId: undefined }]) {
      const e: Record<string, unknown> = { groupId: 'g', stackAt: 1, stackBg: true, ...bad }
      sanitizeStack(e)
      expect('stack' in e || 'stackAt' in e || 'stackBg' in e).toBe(false)
    }
  })
})
