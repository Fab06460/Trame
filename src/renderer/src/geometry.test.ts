import { describe, expect, it } from 'vitest'
import { alignDeltas, boundsOf, distributeDeltas, intersects, unionBox } from '@/geometry'
import type { TrameElement } from '@/types'

const el = (id: string, x: number, y: number, width: number, height: number, rotation = 0): TrameElement => ({
  id, type: 'rect', x, y, width, height, rotation, opacity: 1, fill: '#000'
})

const dx = (m: Map<string, { dx: number; dy: number }>, id: string): number => m.get(id)!.dx
const dy = (m: Map<string, { dx: number; dy: number }>, id: string): number => m.get(id)!.dy

describe('boundsOf', () => {
  it('renvoie la boîte telle quelle sans rotation', () => {
    expect(boundsOf(el('a', 10, 20, 100, 50))).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('tourne autour du coin haut-gauche : 90° bascule la boîte à gauche du point d’ancrage', () => {
    const b = boundsOf(el('a', 100, 100, 40, 10, 90))
    expect(b.x).toBeCloseTo(90)
    expect(b.y).toBeCloseTo(100)
    expect(b.width).toBeCloseTo(10)
    expect(b.height).toBeCloseTo(40)
  })

  it('180° place la boîte en haut-gauche de l’ancrage', () => {
    const b = boundsOf(el('a', 100, 100, 40, 10, 180))
    expect(b.x).toBeCloseTo(60)
    expect(b.y).toBeCloseTo(90)
    expect(b.width).toBeCloseTo(40)
    expect(b.height).toBeCloseTo(10)
  })

  it('45° d’un carré : la diagonale devient la largeur', () => {
    const b = boundsOf(el('a', 0, 0, 100, 100, 45))
    expect(b.width).toBeCloseTo(100 * Math.SQRT2)
    expect(b.height).toBeCloseTo(100 * Math.SQRT2)
  })
})

describe('unionBox / intersects', () => {
  it('englobe plusieurs boîtes', () => {
    expect(unionBox([{ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 20, width: 10, height: 30 }])).toEqual({
      x: 0, y: 0, width: 60, height: 50
    })
  })

  it('détecte le chevauchement', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(intersects(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(intersects(a, { x: 20, y: 0, width: 10, height: 10 })).toBe(false)
  })

  it('deux boîtes qui se touchent seulement par un bord ne se chevauchent pas', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(intersects(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false)
  })
})

describe('alignDeltas', () => {
  const target = { x: 0, y: 0, width: 200, height: 100 }
  const a = el('a', 20, 30, 40, 10)

  it.each([
    ['left', -20, 0],
    ['hcenter', 60, 0],
    ['right', 140, 0],
    ['top', 0, -30],
    ['vcenter', 0, 15],
    ['bottom', 0, 60]
  ] as const)('%s', (mode, ex, ey) => {
    const m = alignDeltas([a], mode, target)
    expect(dx(m, 'a')).toBeCloseTo(ex)
    expect(dy(m, 'a')).toBeCloseTo(ey)
  })

  it('tient compte de la rotation (boîte englobante)', () => {
    // 90° : la boîte occupe x ∈ [90, 100] ; aligner à gauche de x=0 → dx = -90
    const m = alignDeltas([el('r', 100, 0, 40, 10, 90)], 'left', target)
    expect(dx(m, 'r')).toBeCloseTo(-90)
  })
})

describe('distributeDeltas', () => {
  it('égalise les écarts horizontaux, sans dépendre de l’ordre d’entrée', () => {
    const els = [el('c', 100, 0, 10, 10), el('a', 0, 0, 10, 10), el('b', 15, 0, 10, 10)]
    const m = distributeDeltas(els, 'h')
    expect(dx(m, 'a')).toBeCloseTo(0)
    expect(dx(m, 'b')).toBeCloseTo(35) // b passe de 15 à 50 : écart 40 de chaque côté
    expect(dx(m, 'c')).toBeCloseTo(0)
    expect(dy(m, 'b')).toBe(0)
  })

  it('gère des largeurs différentes et l’axe vertical', () => {
    const els = [el('a', 0, 0, 10, 10), el('b', 0, 12, 10, 30), el('c', 0, 100, 10, 20)]
    const m = distributeDeltas(els, 'v')
    // étendue 0..120, hauteurs 10+30+20=60 → écart 30
    expect(dy(m, 'a')).toBeCloseTo(0)
    expect(dy(m, 'b')).toBeCloseTo(40 - 12)
    expect(dy(m, 'c')).toBeCloseTo(0)
    expect(dx(m, 'b')).toBe(0)
  })
})

import { snapBox, snapEdges } from '@/geometry'

describe('snapBox (aimantation au déplacement)', () => {
  const page = { width: 1000, height: 800, threshold: 6 }
  const box = (x: number, y: number, w = 100, h = 50): { x: number; y: number; width: number; height: number } => ({ x, y, width: w, height: h })

  it('s’accroche au bord gauche de la page', () => {
    const r = snapBox(box(4, 300), [], page)
    expect(r.dx).toBe(-4)
    expect(r.lines).toContainEqual({ axis: 'x', position: 0, from: 0, to: 800 })
  })

  it('s’accroche au centre de la page (centre de la boîte sur le centre de la page)', () => {
    // centre de la boîte : 453 + 50 = 503 ; centre de la page : 500
    const r = snapBox(box(453, 300), [], page)
    expect(r.dx).toBe(-3)
  })

  it('reste libre hors du seuil', () => {
    const r = snapBox(box(40, 300), [], page)
    expect(r.dx).toBe(0)
    expect(r.lines.filter((l) => l.axis === 'x')).toHaveLength(0)
  })

  it('les deux axes sont indépendants', () => {
    const r = snapBox(box(3, 300), [], page) // accroché en x seulement
    expect(r.dx).toBe(-3)
    expect(r.dy).toBe(0)
    expect(r.lines.every((l) => l.axis === 'x')).toBe(true)
  })

  it('s’accroche aux bords et aux centres des autres éléments', () => {
    const other = box(300, 100, 200, 100) // bords x : 300, 400 (centre), 500
    expect(snapBox(box(503 - 100, 600), [other], page).dx).toBe(-3 + 0) // bord droit 503 → 500
    expect(snapBox(box(347, 600), [other], page).dx).toBe(3) // centre 397 → 400
  })

  it('choisit la correction la plus petite', () => {
    const r = snapBox(box(297, 600, 100, 50), [box(300, 100, 10, 10), box(299, 100, 10, 10)], page)
    expect(r.dx).toBe(2) // 299 plutôt que 300
  })

  it('s’accroche aux repères', () => {
    const r = snapBox(box(572, 300), [], { ...page, guides: [{ orientation: 'v', position: 570 }, { orientation: 'h', position: 100 }] })
    expect(r.dx).toBe(-2)
    expect(r.lines).toContainEqual(expect.objectContaining({ axis: 'x', position: 570 }))
  })

  it('un repère horizontal agit sur y, pas sur x', () => {
    const r = snapBox(box(250, 98), [], { ...page, guides: [{ orientation: 'h', position: 100 }] })
    expect(r.dy).toBe(2)
    expect(r.dx).toBe(0)
  })

  it('étend la ligne jusqu’à la cible alignée', () => {
    const other = box(300, 500, 100, 100)
    const r = snapBox(box(302, 100), [other], page)
    const line = r.lines.find((l) => l.axis === 'x' && l.position === 300)!
    expect(line.from).toBe(100) // haut de la boîte déplacée
    expect(line.to).toBe(600) // bas de la cible
  })

  it('affiche toutes les lignes sur lesquelles on est accroché', () => {
    const a = box(300, 100, 100, 50)
    const b = box(300, 400, 100, 50)
    const lines = snapBox(box(301, 250), [a, b], page).lines.filter((l) => l.axis === 'x' && l.position === 300)
    expect(lines).toHaveLength(1) // fusionnées en une seule, couvrant les deux cibles
    expect(lines[0].from).toBe(100)
    expect(lines[0].to).toBe(450)
  })
})

describe('snapEdges (aimantation au redimensionnement)', () => {
  const page = { width: 1000, height: 800, threshold: 6 }
  const b = { x: 100, y: 100, width: 200, height: 100 }

  it('seul le bord déplacé s’accroche : le bord droit rejoint le bord de la page', () => {
    const r = snapEdges({ ...b, width: 897 }, { right: true }, [], page) // bord droit à 997 → 1000
    expect(r.box).toEqual({ x: 100, y: 100, width: 900, height: 100 })
  })

  it('le bord gauche rejoint le bord de la page en gardant le bord droit fixe', () => {
    const r = snapEdges({ x: 4, y: 100, width: 296, height: 100 }, { left: true }, [], page)
    expect(r.box).toEqual({ x: 0, y: 100, width: 300, height: 100 })
  })

  it('ne touche pas aux bords qui n’ont pas bougé, même proches d’une ligne', () => {
    const r = snapEdges({ x: 3, y: 100, width: 200, height: 100 }, { right: true }, [], page)
    expect(r.box.x).toBe(3)
  })

  it('s’accroche aux autres éléments et aux repères', () => {
    const r = snapEdges({ ...b, height: 103 }, { bottom: true }, [{ x: 500, y: 200, width: 50, height: 50 }], page) // bas à 203 → 200
    expect(r.box.height).toBe(100)
    const g = snapEdges({ ...b, width: 202 }, { right: true }, [], { ...page, guides: [{ orientation: 'v', position: 300 }] })
    expect(g.box.width).toBe(200)
  })

  it('ne réduit jamais une dimension sous 1 px', () => {
    const r = snapEdges({ x: 100, y: 100, width: 3, height: 50 }, { left: true }, [{ x: 101.5, y: 0, width: 0, height: 0 }], { ...page, threshold: 10 })
    expect(r.box.width).toBeGreaterThanOrEqual(1)
  })
})
