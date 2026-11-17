import { describe, expect, it } from 'vitest'
import {
  bezierAt,
  curveBounds,
  dedupeNodes,
  dragLastNode,
  elementNodes,
  fitNodes,
  insertNode,
  isSmooth,
  moveHandle,
  moveNode,
  nearestOnPath,
  nodesFromPath,
  pathFromNodes,
  pathInFrame,
  pressNode,
  refit,
  removeNode,
  segmentCurve,
  toggleSmooth,
  type PenNode
} from './pen'

const tri: PenNode[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 }
]

describe('chemin d\'une plume', () => {
  it('segments droits sans poignée, courbes avec, fermeture par Z', () => {
    expect(pathFromNodes(tri, false)).toBe('M0 0 L100 0 L100 100')
    expect(pathFromNodes(tri, true)).toBe('M0 0 L100 0 L100 100 L0 0 Z')
    const curved: PenNode[] = [{ x: 0, y: 0, outH: { x: 10, y: 20 } }, { x: 50, y: 0, inH: { x: 40, y: 20 } }]
    expect(pathFromNodes(curved, false)).toBe('M0 0 C10 20 40 20 50 0')
    // une seule poignée : l'autre est confondue avec son point
    expect(pathFromNodes([{ x: 0, y: 0, outH: { x: 10, y: 20 } }, { x: 50, y: 0 }], false)).toBe('M0 0 C10 20 50 0 50 0')
  })

  it('relit ce qu\'il écrit (ouvert, fermé, avec poignées)', () => {
    const nodes: PenNode[] = [
      { x: 0, y: 0, outH: { x: 10, y: 20 } },
      { x: 50, y: 0, inH: { x: 40, y: 20 }, outH: { x: 60, y: -20 } },
      { x: 90, y: 40 }
    ]
    for (const closed of [false, true]) {
      const back = nodesFromPath(pathFromNodes(nodes, closed))
      expect(back).toEqual({ nodes: expect.any(Array), closed })
      expect(pathFromNodes(back!.nodes, closed)).toBe(pathFromNodes(nodes, closed))
    }
  })

  it('relit un tracé qui revient à son départ avant le Z, et les paires suivant un M', () => {
    const p = nodesFromPath('M0 0 L10 0 L10 10 L0 0 Z')!
    expect(p.closed).toBe(true)
    expect(p.nodes).toHaveLength(3)
    expect(nodesFromPath('M0 0 10 0 10 10')!.nodes).toHaveLength(3)
  })

  it('refuse ce qu\'il ne sait pas modifier', () => {
    expect(nodesFromPath(undefined)).toBeNull()
    expect(nodesFromPath('')).toBeNull()
    expect(nodesFromPath('M0 0 A5 5 0 0 1 10 10')).toBeNull()
    expect(nodesFromPath('M0 0 Q5 5 10 10')).toBeNull()
    expect(nodesFromPath('m0 0 l10 10')).toBeNull()
    expect(nodesFromPath('M0 0 L5 5 M10 10 L20 20')).toBeNull()
    expect(nodesFromPath('M0 0')).toBeNull()
    expect(nodesFromPath('L5 5 L6 6')).toBeNull()
  })

  it('lit les tracés du crayon (courbes enchaînées)', () => {
    const p = nodesFromPath('M0 0 C5 5 10 5 20 10 C25 12 30 12 40 0')!
    expect(p.nodes).toHaveLength(3)
    expect(p.nodes[1].inH).toEqual({ x: 10, y: 5 })
    expect(p.nodes[1].outH).toEqual({ x: 25, y: 12 })
  })
})

describe('boîte et repère', () => {
  it('la boîte suit la courbe, pas ses poignées', () => {
    const nodes: PenNode[] = [{ x: 0, y: 0, outH: { x: 0, y: 200 } }, { x: 100, y: 0, inH: { x: 100, y: 200 } }]
    const b = curveBounds(nodes, false)
    expect(b.minX).toBe(0)
    expect(b.maxX).toBe(100)
    expect(b.maxY).toBeCloseTo(150, 0) // 3/4 de la hauteur des poignées
    expect(b.maxY).toBeLessThan(200)
  })

  it('fitNodes : boîte d\'au moins 1 px et chemin dans 0–100', () => {
    const f = fitNodes([{ x: 10, y: 20 }, { x: 110, y: 20 }], false)
    expect(f).toMatchObject({ x: 10, y: 19.5, width: 100, height: 1 })
    expect(f.path).toBe('M0 50 L100 50')
  })

  it('un élément → ses points en pixels → son chemin, et la boîte se réajuste sans bouger le dessin', () => {
    const el = { x: 200, y: 100, width: 50, height: 50, rotation: 0, path: 'M0 0 L100 0 L100 100' }
    const p = elementNodes(el)!
    expect(p.nodes[1]).toEqual({ x: 50, y: 0 })
    expect(pathInFrame(el, p.nodes, false)).toBe('M0 0 L100 0 L100 100')
    // on tire le dernier point vers le bas : la boîte grandit, le point de départ reste à sa place
    const moved = moveNode(p.nodes, 2, { x: 50, y: 150 })
    const r = refit(el, moved, false)
    expect(r).toMatchObject({ x: 200, y: 100, width: 50, height: 150 })
    expect(r.path).toBe('M0 0 L100 0 L100 100')
  })

  it('la rotation de l\'élément est prise en compte pour la nouvelle position', () => {
    const el = { x: 0, y: 0, width: 100, height: 100, rotation: 90, path: 'M0 0 L100 0 L100 100' }
    const p = elementNodes(el)!
    // le point de départ passe de (0, 0) à (10, 0) dans le repère de l'élément : une rotation de 90° l'envoie en (0, 10)
    const r = refit(el, moveNode(p.nodes, 0, { x: 10, y: 0 }), false)
    expect(r.x).toBeCloseTo(0, 5)
    expect(r.y).toBeCloseTo(10, 5)
    expect(r.width).toBeCloseTo(90, 5)
  })
})

describe('édition des points', () => {
  it('déplacer un point emmène ses poignées', () => {
    const n: PenNode[] = [{ x: 0, y: 0 }, { x: 10, y: 10, inH: { x: 5, y: 10 }, outH: { x: 15, y: 10 } }]
    const m = moveNode(n, 1, { x: 20, y: 30 })
    expect(m[1]).toEqual({ x: 20, y: 30, inH: { x: 15, y: 30 }, outH: { x: 25, y: 30 } })
    expect(n[1].x).toBe(10) // l'original ne change pas
  })

  it('une poignée d\'un point lisse entraîne l\'autre (même distance), sauf si on le refuse', () => {
    const n: PenNode[] = [{ x: 10, y: 10, inH: { x: 0, y: 10 }, outH: { x: 20, y: 10 } }]
    expect(isSmooth(n[0])).toBe(true)
    const m = moveHandle(n, 0, 'out', { x: 10, y: 30 }, true)
    expect(m[0].outH).toEqual({ x: 10, y: 30 })
    expect(m[0].inH!.x).toBeCloseTo(10, 6)
    expect(m[0].inH!.y).toBeCloseTo(0, 6)
    const free = moveHandle(n, 0, 'out', { x: 10, y: 30 }, false)
    expect(free[0].inH).toEqual({ x: 0, y: 10 })
    expect(isSmooth(free[0])).toBe(false)
  })

  it('angle ↔ lisse', () => {
    const smooth = toggleSmooth(tri, false, 1)
    expect(isSmooth(smooth[1])).toBe(true)
    expect(smooth[1].outH).toBeDefined()
    const back = toggleSmooth(smooth, false, 1)
    expect(back[1].inH).toBeUndefined()
    expect(back[1].outH).toBeUndefined()
    // une extrémité n'a qu'une poignée
    const end = toggleSmooth(tri, false, 0)
    expect(end[0].outH).toBeDefined()
    expect(end[0].inH).toBeUndefined()
  })

  it('couper un segment droit ajoute un point sur la droite', () => {
    const out = insertNode(tri, 0, 0.5)
    expect(out).toHaveLength(4)
    expect(out[1]).toEqual({ x: 50, y: 0 })
  })

  it('couper une courbe garde exactement sa forme', () => {
    const nodes: PenNode[] = [{ x: 0, y: 0, outH: { x: 0, y: 60 } }, { x: 100, y: 0, inH: { x: 100, y: 60 } }]
    const before = segmentCurve(nodes, 0)
    const out = insertNode(nodes, 0, 0.3)
    expect(out).toHaveLength(3)
    const first = segmentCurve(out, 0)
    const second = segmentCurve(out, 1)
    for (const t of [0, 0.25, 0.6, 1]) {
      expect(bezierAt(first, t).x).toBeCloseTo(bezierAt(before, t * 0.3).x, 6)
      expect(bezierAt(first, t).y).toBeCloseTo(bezierAt(before, t * 0.3).y, 6)
      expect(bezierAt(second, t).y).toBeCloseTo(bezierAt(before, 0.3 + t * 0.7).y, 6)
    }
  })

  it('couper le segment de fermeture ajoute un point à la fin', () => {
    const out = insertNode(tri, 2, 0.5)
    expect(out).toHaveLength(4)
    expect(out[3]).toEqual({ x: 50, y: 50 })
  })

  it('retirer un point (deux au moins restent)', () => {
    expect(removeNode(tri, 1)).toEqual([tri[0], tri[2]])
    expect(removeNode([tri[0], tri[1]], 0)).toBeNull()
    expect(removeNode(tri, 7)).toBeNull()
  })

  it('le point le plus proche de la courbe', () => {
    const near = nearestOnPath(tri, false, { x: 50, y: 4 })!
    expect(near.seg).toBe(0)
    expect(near.t).toBeCloseTo(0.5, 2)
    expect(near.dist).toBeCloseTo(4, 3)
    expect(nearestOnPath([tri[0]], false, { x: 0, y: 0 })).toBeNull()
  })
})

describe('pose des points à la souris', () => {
  it('un clic pose un point d\'angle ; un clic sur le premier point ferme (à partir de trois points)', () => {
    let n: PenNode[] = []
    n = pressNode(n, { x: 0, y: 0 }, 6).nodes
    n = pressNode(n, { x: 50, y: 0 }, 6).nodes
    expect(pressNode(n, { x: 2, y: 1 }, 6).closes).toBe(false) // seulement deux points : on en pose un troisième
    n = pressNode(n, { x: 50, y: 50 }, 6).nodes
    expect(n).toHaveLength(3)
    const close = pressNode(n, { x: 3, y: 2 }, 6)
    expect(close.closes).toBe(true)
    expect(close.nodes).toHaveLength(3)
    expect(pressNode(n, { x: 20, y: 20 }, 6).closes).toBe(false)
  })

  it('glisser tire la poignée de départ, l\'autre lui est opposée ; un petit glissement n\'en tire aucune', () => {
    const n = dragLastNode([{ x: 0, y: 0 }, { x: 50, y: 50 }], { x: 70, y: 50 }, 3)
    expect(n[1].outH).toEqual({ x: 70, y: 50 })
    expect(n[1].inH).toEqual({ x: 30, y: 50 })
    expect(isSmooth(n[1])).toBe(true)
    const tiny = dragLastNode(n, { x: 51, y: 50 }, 3)
    expect(tiny[1].outH).toBeUndefined()
    expect(tiny[1].inH).toBeUndefined()
    expect(dragLastNode([], { x: 1, y: 1 }, 3)).toEqual([])
  })

  it('un double-clic ne laisse qu\'un point', () => {
    const n = dedupeNodes([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10.2, y: 10 }, { x: 40, y: 0 }])
    expect(n).toHaveLength(3)
  })
})
