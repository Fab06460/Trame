import { describe, expect, it } from 'vitest'
import type { TrameElement } from '@/types'
import { dashRuns, outlinable, outlinedElements, strokePieces, strokeShape } from './strokeOutline'

const el = (over: Partial<TrameElement>): TrameElement => ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#fff', ...over })

/** Surface réelle (px²) du résultat : le chemin est dans un repère 100 × 100 étiré à la boîte. */
async function area(path: string, width: number, height: number): Promise<number> {
  const lib = ((await import('paper/dist/paper-core.js')) as unknown as { default?: typeof paper }).default ?? ((await import('paper/dist/paper-core.js')) as unknown as typeof paper)
  const s = new lib.PaperScope()
  s.setup(new lib.Size(10, 10))
  return Math.abs(new s.CompoundPath({ pathData: path, insert: false, fillRule: 'evenodd' }).area) * (width / 100) * (height / 100)
}

const line = (over: Partial<TrameElement> = {}): TrameElement => el({ type: 'path', path: 'M0 50 L100 50', open: true, width: 200, height: 0, stroke: '#ff0000', strokeWidth: 10, ...over })

describe('outlinable', () => {
  it('demande un contour visible', () => {
    expect(outlinable(el({ stroke: '#000', strokeWidth: 4 }))).toBe(true)
    expect(outlinable(el({}))).toBe(false)
    expect(outlinable(el({ stroke: '#000', strokeWidth: 0 }))).toBe(false)
  })
  it('refuse le texte, les images, les masques et les piles', () => {
    expect(outlinable(el({ type: 'text', stroke: '#000', strokeWidth: 4 }))).toBe(false)
    expect(outlinable(el({ type: 'image', stroke: '#000', strokeWidth: 4 }))).toBe(false)
    expect(outlinable(el({ stroke: '#000', strokeWidth: 4, clip: true }))).toBe(false)
    expect(outlinable(el({ stroke: '#000', strokeWidth: 4, stack: { dir: 'v', gap: 0, align: 'start', pad: 0 } }))).toBe(false)
  })
})

describe('dashRuns', () => {
  it('découpe une ligne en tirets', () => {
    const runs = dashRuns({ pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false }, 30, 20)
    expect(runs.map((r) => [r.pts[0].x, r.pts[r.pts.length - 1].x])).toEqual([[0, 30], [50, 80]])
  })
  it('suit les coins et reboucle un tracé fermé', () => {
    const runs = dashRuns({ pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], closed: true }, 30, 10)
    const length = runs.reduce((sum, r) => sum + r.pts.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - r.pts[i].x, p.y - r.pts[i].y), 0), 0)
    expect(length).toBeCloseTo(120, 3) // 160 de périmètre, 4 tirets de 30 et 4 vides de 10
  })
})

describe('strokePieces', () => {
  it('un segment : un rectangle, plus un disque à chaque bout si les bouts sont ronds', () => {
    const run = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false }
    expect(strokePieces(run, 2, false)).toHaveLength(1)
    expect(strokePieces(run, 2, true)).toHaveLength(3)
  })
  it('un point isolé : un rond seulement avec des bouts ronds', () => {
    expect(strokePieces({ pts: [{ x: 1, y: 1 }], closed: false }, 2, true)).toHaveLength(1)
    expect(strokePieces({ pts: [{ x: 1, y: 1 }], closed: false }, 2, false)).toHaveLength(0)
  })
})

describe('strokeShape', () => {
  it('une ligne : un rectangle plus deux bouts ronds', async () => {
    const r = await strokeShape(line())
    expect(r).not.toBeNull()
    const a = await area(r!.outline.path, r!.outline.width, r!.outline.height)
    expect(a).toBeGreaterThan((200 * 10 + Math.PI * 25) * 0.99)
    expect(a).toBeLessThan((200 * 10 + Math.PI * 25) * 1.01)
    expect(r!.outline.x).toBeCloseTo(-5, 1)
    expect(r!.outline.width).toBeCloseTo(210, 1)
  })

  it('une ligne en tirets : deux tirets arrondis', async () => {
    const r = await strokeShape(line({ strokeDashed: true, width: 100 }))
    const a = await area(r!.outline.path, r!.outline.width, r!.outline.height)
    const dash = 30 * 10 + Math.PI * 25
    expect(a).toBeGreaterThan(2 * dash * 0.98)
    expect(a).toBeLessThan(2 * dash * 1.02)
  })

  it('un rectangle : un cadre aux angles à pointe', async () => {
    const r = await strokeShape(el({ width: 100, height: 60, stroke: '#000', strokeWidth: 10 }))
    const a = await area(r!.outline.path, r!.outline.width, r!.outline.height)
    expect(a).toBeCloseTo(110 * 70 - 90 * 50, -1) // 3200
    expect(r!.outline).toMatchObject({ x: -5, y: -5, width: 110, height: 70 })
  })

  it('une ellipse : un anneau', async () => {
    const r = await strokeShape(el({ type: 'ellipse', x: 50, y: 20, stroke: '#000', strokeWidth: 10 }))
    const a = await area(r!.outline.path, r!.outline.width, r!.outline.height)
    expect(a).toBeGreaterThan(Math.PI * 1000 * 0.99)
    expect(a).toBeLessThan(Math.PI * 1000 * 1.01)
    expect(r!.outline.x).toBeCloseTo(45, 1)
  })

  it('la rotation est appliquée au résultat', async () => {
    const r = await strokeShape(line({ rotation: 90, x: 100, y: 0 }))
    // la ligne de 200 devient verticale, de (100, 0) à (100, 200), épaisseur 10 + bouts
    expect(r!.outline.width).toBeCloseTo(10, 1)
    expect(r!.outline.height).toBeCloseTo(210, 1)
  })

  it('une flèche : le trait raccourci et la pointe', async () => {
    const plain = await strokeShape(line())
    const arrow = await strokeShape(line({ ends: { end: 'arrow' } }))
    expect(arrow!.outline.width).toBeGreaterThan(0)
    expect(arrow!.outline.height).toBeGreaterThan(plain!.outline.height) // la pointe est plus large que le trait
  })

  it('un long tracé courbe se convertit en un temps raisonnable', async () => {
    let d = 'M0 50'
    for (let i = 1; i <= 120; i++) d += ` C${i - 0.7} ${i % 2 ? 10 : 90} ${i - 0.3} ${i % 2 ? 10 : 90} ${i} 50`
    const started = Date.now()
    const r = await strokeShape(el({ type: 'path', path: d, open: true, width: 2400, height: 400, stroke: '#00f', strokeWidth: 6 }))
    expect(r).not.toBeNull()
    expect(Date.now() - started).toBeLessThan(15000)
  }, 30000)

  it('sans contour, rien', async () => {
    expect(await strokeShape(el({}))).toBeNull()
  })
})

describe('outlinedElements', () => {
  const c = { path: 'M0 0L100 0L100 100Z', x: 1, y: 2, width: 30, height: 40 }
  it('un tracé ouvert est remplacé par un tracé plein de la couleur du trait', () => {
    const out = outlinedElements(line({ link: { url: 'https://x.test' } as never, groupId: 'g' }), c)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ type: 'path', fill: '#ff0000', x: 1, y: 2, width: 30, height: 40, rotation: 0, groupId: 'g', fillRule: 'evenodd' })
    expect(out[0].stroke).toBeUndefined()
    expect(out[0].open).toBeUndefined()
  })
  it('une forme garde son remplissage sans contour, et le trait vient au-dessus', () => {
    const src = el({ fill: '#00ff00', stroke: '#000', strokeWidth: 4, strokeDashed: true, shadow: { color: '#000', blur: 4, offsetX: 1, offsetY: 1, opacity: 1 } })
    const out = outlinedElements(src, c)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'a', fill: '#00ff00' })
    expect(out[0].stroke).toBeUndefined()
    expect(out[0].strokeWidth).toBeUndefined()
    expect(out[0].strokeDashed).toBeUndefined()
    expect(out[0].shadow).toBeDefined()
    expect(out[1]).toMatchObject({ fill: '#000', type: 'path' })
    expect(out[1].shadow).toBeUndefined()
    expect(out[1].id).not.toBe('a')
  })
})
