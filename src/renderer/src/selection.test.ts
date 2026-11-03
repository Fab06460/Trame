import { describe, expect, it } from 'vitest'
import { hitStack, pointHits, sameTypeIds, tabTarget, throughTarget } from '@/selection'
import type { TrameElement } from '@/types'

const el = (id: string, o: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#000', ...o })

describe('pointHits', () => {
  it('rectangle', () => {
    const e = el('a', { x: 10, y: 10, width: 50, height: 20 })
    expect(pointHits(e, { x: 30, y: 20 })).toBe(true)
    expect(pointHits(e, { x: 70, y: 20 })).toBe(false)
  })
  it('suit la rotation autour du coin haut-gauche', () => {
    const e = el('a', { x: 100, y: 100, width: 100, height: 10, rotation: 90 }) // devient un trait vertical vers le bas
    expect(pointHits(e, { x: 105, y: 150 })).toBe(false)
    expect(pointHits(e, { x: 95, y: 150 })).toBe(true)
  })
  it('une ellipse ne couvre pas les coins de sa boîte', () => {
    const e = el('a', { type: 'ellipse' })
    expect(pointHits(e, { x: 50, y: 50 })).toBe(true)
    expect(pointHits(e, { x: 3, y: 3 })).toBe(false)
  })
})

describe('hitStack', () => {
  it('du plus haut au plus bas, sans les masqués', () => {
    const els = [el('bas'), el('milieu', { hidden: true }), el('haut'), el('loin', { x: 500 })]
    expect(hitStack(els, { x: 10, y: 10 }).map((e) => e.id)).toEqual(['haut', 'bas'])
  })
})

describe('throughTarget', () => {
  const stack = [el('a'), el('b'), el('c')]
  it('sans sélection dans la pile : le premier', () => {
    expect(throughTarget(stack, [])).toBe('a')
    expect(throughTarget(stack, ['ailleurs'])).toBe('a')
  })
  it('descend à chaque clic puis revient en haut', () => {
    expect(throughTarget(stack, ['a'])).toBe('b')
    expect(throughTarget(stack, ['b'])).toBe('c')
    expect(throughTarget(stack, ['c'])).toBe('a')
  })
  it('un groupe compte pour un seul niveau', () => {
    const s = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c')]
    expect(throughTarget(s, ['a', 'b'])).toBe('c')
  })
  it('rien sous le pointeur', () => {
    expect(throughTarget([], ['a'])).toBeNull()
  })
})

describe('tabTarget', () => {
  const els = [el('a'), el('b'), el('c')]
  it('sans sélection : le premier, ou le dernier avec Maj', () => {
    expect(tabTarget(els, [], 1)).toEqual(['a'])
    expect(tabTarget(els, [], -1)).toEqual(['c'])
  })
  it('avance et recule dans l’ordre des calques', () => {
    expect(tabTarget(els, ['a'], 1)).toEqual(['b'])
    expect(tabTarget(els, ['c'], -1)).toEqual(['b'])
  })
  it('sort de la liste aux deux bouts (le focus reprend son cours)', () => {
    expect(tabTarget(els, ['c'], 1)).toBeNull()
    expect(tabTarget(els, ['a'], -1)).toBeNull()
  })
  it('saute les éléments masqués', () => {
    expect(tabTarget([el('a'), el('b', { hidden: true }), el('c')], ['a'], 1)).toEqual(['c'])
  })
  it('sélectionne un groupe en entier', () => {
    const g = [el('a'), el('b', { groupId: 'g' }), el('c', { groupId: 'g' }), el('d')]
    expect(tabTarget(g, ['a'], 1)).toEqual(['b', 'c'])
    expect(tabTarget(g, ['b', 'c'], 1)).toEqual(['d'])
    expect(tabTarget(g, ['d'], -1)).toEqual(['b', 'c'])
  })
  it('dans un groupe (un membre seul), passe de membre en membre', () => {
    const g = [el('a'), el('b', { groupId: 'g' }), el('c', { groupId: 'g' }), el('d')]
    expect(tabTarget(g, ['b'], 1)).toEqual(['c'])
    expect(tabTarget(g, ['c'], 1)).toEqual(['d'])
  })
})

describe('sameTypeIds', () => {
  it('tous les éléments visibles du même type', () => {
    const els = [el('a'), el('t', { type: 'text' }), el('b'), el('h', { hidden: true })]
    expect(sameTypeIds(els, els[0])).toEqual(['a', 'b'])
  })
  it('rien pour un graphique ou un QR code, et ils ne sont pas repris', () => {
    const qr = el('q', { type: 'path', groupId: 'g', qr: { content: 'x' } as never })
    const part = el('p', { groupId: 'g' })
    const free = el('f')
    expect(sameTypeIds([qr, part, free], qr)).toEqual([])
    expect(sameTypeIds([qr, part, free], free)).toEqual(['f'])
  })
})
