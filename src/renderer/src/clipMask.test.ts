import { describe, expect, it } from 'vitest'
import type { TrameElement } from '@/types'
import { canBeMask, clipPlan, pageSegments, sanitizeClip, segmentsBounds, segmentsData } from './clipMask'

const el = (over: Partial<TrameElement>): TrameElement => ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#000', ...over })

describe('canBeMask', () => {
  it('accepte rectangles, ellipses et tracés fermés lisibles', () => {
    expect(canBeMask(el({ type: 'rect' }))).toBe(true)
    expect(canBeMask(el({ type: 'ellipse' }))).toBe(true)
    expect(canBeMask(el({ type: 'path', path: 'M0 0L100 0L100 100Z' }))).toBe(true)
  })
  it('refuse trait, texte, image, chemin à arcs ou relatif, formule', () => {
    expect(canBeMask(el({ type: 'path', path: 'M0 0L100 100', open: true }))).toBe(false)
    expect(canBeMask(el({ type: 'text' }))).toBe(false)
    expect(canBeMask(el({ type: 'image' }))).toBe(false)
    expect(canBeMask(el({ type: 'path', path: 'M0 0a10 10 0 0 1 20 0z' }))).toBe(false)
    expect(canBeMask(el({ type: 'path', path: 'M0 0L100 0L100 100Z', formula: { latex: 'x' } as never }))).toBe(false)
  })
})

describe('pageSegments', () => {
  it('place le contour à la position de l\'élément', () => {
    const b = segmentsBounds(pageSegments(el({ x: 50, y: 20, width: 100, height: 40 }))!)!
    expect([b.x, b.y, b.width, b.height]).toEqual([50, 20, 100, 40])
  })
  it('tourne autour du coin haut gauche (comme Konva)', () => {
    const b = segmentsBounds(pageSegments(el({ x: 200, y: 100, width: 100, height: 50, rotation: 90 }))!)!
    expect(b.x).toBeCloseTo(150, 5)
    expect(b.x + b.width).toBeCloseTo(200, 5)
    expect(b.y).toBeCloseTo(100, 5)
    expect(b.y + b.height).toBeCloseTo(200, 5)
  })
  it('étire un tracé de son repère 100 × 100 à sa boîte', () => {
    const b = segmentsBounds(pageSegments(el({ type: 'path', path: 'M0 0L100 0L100 100L0 100Z', x: 10, y: 10, width: 200, height: 50 }))!)!
    expect([b.width, b.height]).toEqual([200, 50])
  })
  it('rend null pour une forme illisible', () => {
    expect(pageSegments(el({ type: 'text' }))).toBeNull()
  })
  it('écrit le contour en données de chemin', () => {
    expect(segmentsData(pageSegments(el({ x: 5, y: 6, width: 10, height: 20 }))!)).toBe('M5 6L15 6L15 26L5 26Z')
  })
})

describe('clipPlan', () => {
  const mask = el({ id: 'm', type: 'ellipse', groupId: 'g', clip: true, width: 50, height: 50 })
  it('le masque découpe les autres membres de son groupe', () => {
    const plan = clipPlan([el({ id: 'x', groupId: 'g' }), mask, el({ id: 'y', groupId: 'g' }), el({ id: 'free' })])
    expect([...plan.masks]).toEqual(['m'])
    expect([...plan.clips.keys()].sort()).toEqual(['x', 'y'])
    expect(plan.clips.get('x')!.maskId).toBe('m')
  })
  it('un masque seul dans son groupe est une forme ordinaire', () => {
    const plan = clipPlan([mask])
    expect(plan.masks.size).toBe(0)
    expect(plan.clips.size).toBe(0)
  })
  it('un groupe n\'a qu\'un masque', () => {
    const plan = clipPlan([mask, el({ id: 'm2', groupId: 'g', clip: true }), el({ id: 'x', groupId: 'g' })])
    expect([...plan.masks]).toEqual(['m'])
    expect(plan.clips.has('m2')).toBe(true) // le second « masque » est découpé comme un membre ordinaire
  })
  it('retient la règle pair-impair du masque', () => {
    const plan = clipPlan([el({ id: 'x', groupId: 'g' }), el({ ...mask, fillRule: 'evenodd' })])
    expect(plan.clips.get('x')!.evenOdd).toBe(true)
  })
  it('n\'agit pas sur les autres groupes', () => {
    const plan = clipPlan([mask, el({ id: 'x', groupId: 'g' }), el({ id: 'z', groupId: 'other' })])
    expect(plan.clips.has('z')).toBe(false)
  })
})

describe('sanitizeClip', () => {
  it('ne garde `clip` que sur une forme d\'un groupe', () => {
    const ok: Record<string, unknown> = { type: 'rect', groupId: 'g', clip: true }
    sanitizeClip(ok)
    expect(ok.clip).toBe(true)
    for (const bad of [{ type: 'rect', clip: true }, { type: 'text', groupId: 'g', clip: true }, { type: 'path', open: true, groupId: 'g', clip: true }, { type: 'rect', groupId: 'g', clip: 'oui' }]) {
      const e: Record<string, unknown> = { ...bad }
      sanitizeClip(e)
      expect('clip' in e).toBe(false)
    }
  })
})
