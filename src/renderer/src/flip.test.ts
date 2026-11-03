import { describe, expect, it } from 'vitest'
import { flipPatches, isFlipExempt, mirrorGradient, mirrorPath } from '@/flip'
import type { TrameElement } from '@/types'

const el = (o: Partial<TrameElement>): TrameElement => ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#000', ...o })
const apply = (e: TrameElement, p?: Partial<TrameElement>): TrameElement => ({ ...e, ...p })

/** Point (px, py) du viewBox 100×100 du tracé, en coordonnées de la page. */
function world(e: TrameElement, px: number, py: number): { x: number; y: number } {
  const a = (px * e.width) / 100
  const b = (py * e.height) / 100
  const r = (e.rotation * Math.PI) / 180
  return { x: e.x + a * Math.cos(r) - b * Math.sin(r), y: e.y + a * Math.sin(r) + b * Math.cos(r) }
}

describe('mirrorPath', () => {
  it('reflète les coordonnées absolues autour du milieu du viewBox', () => {
    expect(mirrorPath('M10 20 L30 40 Z', 'h')).toBe('M90 20 L70 40 Z')
    expect(mirrorPath('M10 20 L30 40 Z', 'v')).toBe('M10 80 L30 60 Z')
  })
  it('traite H, V, C, Q', () => {
    expect(mirrorPath('M0 0 H10 V20', 'h')).toBe('M100 0 H90 V20')
    expect(mirrorPath('M0 0 H10 V20', 'v')).toBe('M0 100 H10 V80')
    expect(mirrorPath('M0 0 C10 20 30 40 50 60', 'h')).toBe('M100 0 C90 20 70 40 50 60')
    expect(mirrorPath('M0 0 Q10 20 30 40', 'v')).toBe('M0 100 Q10 80 30 60')
  })
  it('change seulement le signe des coordonnées relatives', () => {
    expect(mirrorPath('m10 20 l5 6 h4 v3', 'h')).toBe('m90 20 l-5 6 h-4 v3')
  })
  it('refuse les arcs et les commandes inconnues', () => {
    expect(mirrorPath('M0 0 A5 5 0 0 1 10 10', 'h')).toBeNull()
    expect(mirrorPath('M0 0 X1 1', 'h')).toBeNull()
  })
  it('est son propre inverse', () => {
    const d = 'M5 38 L58 38 C20 65 4 48 4 30 Z'
    expect(mirrorPath(mirrorPath(d, 'h')!, 'h')).toBe(d)
  })
})

describe('mirrorGradient', () => {
  const g = { type: 'linear' as const, from: '#000', to: '#fff', angle: 135 }
  it('reflète l’angle', () => {
    expect(mirrorGradient(g, 'h').angle).toBe(225)
    expect(mirrorGradient(g, 'v').angle).toBe(45)
  })
  it('laisse un dégradé radial tel quel', () => {
    const r = { ...g, type: 'radial' as const }
    expect(mirrorGradient(r, 'h')).toBe(r)
  })
})

describe('flipPatches', () => {
  it('un rectangle seul reste en place', () => {
    const e = el({ x: 40, y: 10 })
    const p = flipPatches([e], 'h').get('a')!
    expect(p).toMatchObject({ x: 40, y: 10, rotation: 0 })
  })

  it('deux éléments échangent leurs places', () => {
    const a = el({ id: 'a', x: 0, width: 20 })
    const b = el({ id: 'b', x: 80, width: 20 })
    const p = flipPatches([a, b], 'h')
    expect(p.get('a')!.x).toBe(80)
    expect(p.get('b')!.x).toBe(0)
  })

  it('le miroir envoie chaque point du tracé sur son symétrique', () => {
    for (const rot of [0, 30, 90, -45, 200]) {
      const e = el({ type: 'path', path: 'M10 20 L80 30 L40 90 Z', x: 120, y: 60, width: 80, height: 50, rotation: rot })
      const other = el({ id: 'b', x: 400, y: 300, width: 40, height: 40 })
      for (const axis of ['h', 'v'] as const) {
        const out = apply(e, flipPatches([e, other], axis).get('a'))
        // symétrique de (10, 20) → (90, 20) pour h, (10, 80) pour v dans le tracé retourné ; même point du monde que l’original reflété
        const [qx, qy] = axis === 'h' ? [90, 20] : [10, 80]
        const w1 = world(out, qx, qy)
        const w0 = world(e, 10, 20)
        // boîte commune de la sélection (calculée à la main avec les mêmes bornes que flipPatches)
        const xs: number[] = []
        const ys: number[] = []
        for (const x of [e, other]) {
          const r = (x.rotation * Math.PI) / 180
          for (const [a, b] of [[0, 0], [x.width, 0], [x.width, x.height], [0, x.height]]) {
            xs.push(x.x + a * Math.cos(r) - b * Math.sin(r))
            ys.push(x.y + a * Math.sin(r) + b * Math.cos(r))
          }
        }
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2
        const want = axis === 'h' ? { x: 2 * cx - w0.x, y: w0.y } : { x: w0.x, y: 2 * cy - w0.y }
        expect(w1.x).toBeCloseTo(want.x, 4)
        expect(w1.y).toBeCloseTo(want.y, 4)
      }
    }
  })

  it('retourner deux fois ramène la sélection au départ', () => {
    const els = [
      el({ id: 'a', type: 'path', path: 'M10 20 L80 30 L40 90 Z', x: 120, y: 60, rotation: 33, gradient: { type: 'linear', from: '#000', to: '#fff', angle: 20 } }),
      el({ id: 'b', type: 'image', src: 'x', x: 10, y: 300, rotation: 15, flipX: true }),
      el({ id: 'c', type: 'text', text: 'Salut', x: 300, y: 90, rotation: 7 })
    ]
    for (const axis of ['h', 'v'] as const) {
      const once = els.map((e) => apply(e, flipPatches(els, axis).get(e.id)))
      const twice = once.map((e) => apply(e, flipPatches(once, axis).get(e.id)))
      twice.forEach((e, i) => {
        expect(e.x).toBeCloseTo(els[i].x, 3)
        expect(e.y).toBeCloseTo(els[i].y, 3)
        expect(e.rotation).toBeCloseTo(els[i].rotation, 3)
        expect(e.path).toBe(els[i].path)
        expect(!!e.flipX).toBe(!!els[i].flipX)
        if (els[i].gradient) expect(e.gradient?.angle).toBeCloseTo(els[i].gradient!.angle, 3)
      })
    }
  })

  it('un texte change de place sans être retourné ni tourné', () => {
    const t = el({ id: 'a', type: 'text', text: 'Hi', x: 10, width: 60 })
    const o = el({ id: 'b', x: 90, width: 10 })
    const p = flipPatches([t, o], 'h').get('a')!
    expect(p).toEqual({ x: 40, y: 0 })
  })

  it('une image bascule son drapeau, l’autre axe n’est pas touché', () => {
    const i = el({ type: 'image', src: 'x', flipY: true })
    const p = flipPatches([i], 'h').get('a')!
    expect(p.flipX).toBe(true)
    expect('flipY' in p).toBe(false)
    const back = apply(i, p)
    expect(flipPatches([back], 'h').get('a')!.flipX).toBeUndefined()
  })

  it('un tracé avec un arc n’est pas retourné, il change de place', () => {
    const e = el({ type: 'path', path: 'M0 0 A5 5 0 0 1 10 10', x: 0, width: 40 })
    const o = el({ id: 'b', x: 60, width: 40 })
    expect(flipPatches([e, o], 'h').get('a')).toEqual({ x: 60, y: 0 })
  })
})

describe('isFlipExempt', () => {
  it('exclut les graphiques, les QR codes et leurs groupes', () => {
    const qr = el({ id: 'q', groupId: 'g', qr: { content: 'x' } as never })
    const part = el({ id: 'p', groupId: 'g' })
    const free = el({ id: 'f' })
    const all = [qr, part, free]
    expect(isFlipExempt(qr, all)).toBe(true)
    expect(isFlipExempt(part, all)).toBe(true)
    expect(isFlipExempt(free, all)).toBe(false)
  })
})
