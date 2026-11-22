import { describe, expect, it } from 'vitest'
import type { TrameElement } from '@/types'
import { nodesFromPath } from '@/pen'
import { canCombine, combinable, combineShapes, ellipseData, rectData } from './pathBoolean'

const el = (over: Partial<TrameElement>): TrameElement => ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#000', ...over })
const rect = (x: number, y: number, width: number, height: number, over: Partial<TrameElement> = {}): TrameElement => el({ type: 'rect', x, y, width, height, ...over })
const circle = (x: number, y: number, size: number): TrameElement => el({ type: 'ellipse', x, y, width: size, height: size })

/** Surface (en pixels carrés) du résultat, remis à l'échelle de sa boîte. */
async function area(path: string, width: number, height: number): Promise<number> {
  const lib = ((await import('paper/dist/paper-core.js')) as unknown as { default?: typeof paper }).default ?? ((await import('paper/dist/paper-core.js')) as unknown as typeof paper)
  const s = new lib.PaperScope()
  s.setup(new lib.Size(10, 10))
  const item = new s.CompoundPath({ pathData: path, insert: false })
  return Math.abs(item.area) * (width / 100) * (height / 100)
}

describe('combinable', () => {
  it('accepte rectangles, ellipses et tracés fermés', () => {
    expect(combinable(rect(0, 0, 10, 10))).toBe(true)
    expect(combinable(circle(0, 0, 10))).toBe(true)
    expect(combinable(el({ type: 'path', path: 'M0 0H100V100Z' }))).toBe(true)
  })
  it('refuse les traits, textes, images et éléments sans taille', () => {
    expect(combinable(el({ type: 'path', path: 'M0 0L100 100', open: true }))).toBe(false)
    expect(combinable(el({ type: 'text' }))).toBe(false)
    expect(combinable(el({ type: 'image' }))).toBe(false)
    expect(combinable(rect(0, 0, 0, 10))).toBe(false)
  })
  it('demande au moins deux éléments, tous combinables', () => {
    expect(canCombine([rect(0, 0, 10, 10)])).toBe(false)
    expect(canCombine([rect(0, 0, 10, 10), circle(0, 0, 10)])).toBe(true)
    expect(canCombine([rect(0, 0, 10, 10), el({ type: 'text' })])).toBe(false)
  })
})

describe('contours', () => {
  it('décrit un rectangle, arrondi ou non', () => {
    expect(rectData(40, 20)).toBe('M0 0H40V20H0Z')
    expect(rectData(40, 20, 5)).toContain('A5 5')
    expect(rectData(40, 20, 999)).toContain('A10 10') // le rayon est borné à la moitié du petit côté
  })
  it('décrit une ellipse par deux arcs', () => {
    expect(ellipseData(40, 20)).toBe('M0 10A20 10 0 1 1 40 10A20 10 0 1 1 0 10Z')
  })
})

describe('combineShapes : le chemin rendu', () => {
  it('n\'emploie que des commandes absolues M, L, C et Z (la plume sait le relire)', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), circle(40, 40, 80)], 'unite'))!
    expect(r.path).toMatch(/^[MLCZ0-9 .\-]+$/)
    expect(nodesFromPath(r.path)).not.toBeNull()
  })
  it('un trou donne plusieurs contours (non modifiables point par point, mais bien tracés)', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), circle(25, 25, 50)], 'subtract'))!
    expect((r.path.match(/M/g) ?? []).length).toBe(2)
  })
})

describe('combineShapes', () => {
  it('unir : la boîte et la surface de la réunion', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), rect(50, 50, 100, 100)], 'unite'))!
    expect([r.x, r.y, r.width, r.height]).toEqual([0, 0, 150, 150])
    expect(await area(r.path, r.width, r.height)).toBeCloseTo(100 * 100 * 2 - 50 * 50, 0)
  })
  it('soustraire : le dessous moins le dessus', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), rect(50, 0, 100, 100)], 'subtract'))!
    expect([r.x, r.y, r.width, r.height]).toEqual([0, 0, 50, 100])
    expect(await area(r.path, r.width, r.height)).toBeCloseTo(50 * 100, 0)
  })
  it('soustraire un rond au milieu perce un trou', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), circle(25, 25, 50)], 'subtract'))!
    expect([r.width, r.height]).toEqual([100, 100])
    expect(await area(r.path, r.width, r.height)).toBeCloseTo(100 * 100 - Math.PI * 25 * 25, -1)
  })
  it('intersecter : la partie commune', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), rect(60, 40, 100, 100)], 'intersect'))!
    expect([r.x, r.y, r.width, r.height]).toEqual([60, 40, 40, 60])
  })
  it('intersecter deux formes qui ne se touchent pas ne laisse rien', async () => {
    expect(await combineShapes([rect(0, 0, 10, 10), rect(100, 100, 10, 10)], 'intersect')).toBeNull()
  })
  it('exclure : tout sauf la partie commune', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), rect(50, 50, 100, 100)], 'exclude'))!
    expect(await area(r.path, r.width, r.height)).toBeCloseTo(100 * 100 * 2 - 2 * 50 * 50, 0)
  })
  it('tient compte de la position, de la taille et de la rotation (autour du coin haut gauche)', async () => {
    // 100 × 50 tournée de 90° autour de son coin (200, 100) : elle occupe x de 150 à 200, y de 100 à 200
    const r = (await combineShapes([rect(200, 100, 100, 50, { rotation: 90 }), rect(0, 0, 10, 10)], 'unite'))!
    expect(r.x).toBeCloseTo(0, 1)
    expect(r.x + r.width).toBeCloseTo(200, 1)
    expect(r.y + r.height).toBeCloseTo(200, 1)
  })
  it('étire un tracé dans sa boîte', async () => {
    const tri = el({ type: 'path', path: 'M0 100L50 0L100 100Z', x: 10, y: 10, width: 200, height: 100 })
    const r = (await combineShapes([tri, rect(0, 0, 5, 5)], 'unite'))!
    expect(r.x + r.width).toBeCloseTo(210, 1)
    expect(r.y + r.height).toBeCloseTo(110, 1)
  })
  it('chaîne les opérations sur plus de deux formes', async () => {
    const r = (await combineShapes([rect(0, 0, 100, 100), rect(0, 0, 50, 100), rect(50, 0, 50, 50)], 'subtract'))!
    expect(await area(r.path, r.width, r.height)).toBeCloseTo(50 * 50, 0)
  })
  it('refuse une sélection non combinable', async () => {
    expect(await combineShapes([rect(0, 0, 10, 10)], 'unite')).toBeNull()
    expect(await combineShapes([rect(0, 0, 10, 10), el({ type: 'text' })], 'unite')).toBeNull()
  })
})
