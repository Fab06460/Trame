import { describe, expect, it } from 'vitest'
import { boundsOf } from '@/geometry'
import { adaptDocument } from '@/magicResize'
import type { TrameDocument, TrameElement } from '@/types'

const el = (o: Partial<TrameElement>): TrameElement =>
  ({ id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, fill: '#000', ...o }) as TrameElement
const doc = (elements: TrameElement[], w = 1000, h = 1000): TrameDocument => ({ version: 2, name: 'x', width: w, height: h, pages: [{ id: 'p', background: '#fff', elements }] })
const at = (d: TrameDocument, i = 0): TrameElement => d.pages[0].elements[i]

describe('magicResize', () => {
  it('même format : rien ne bouge', () => {
    const d = adaptDocument(doc([el({ x: 300, y: 200, width: 120, height: 80 })]), 1000, 1000)
    expect(at(d)).toMatchObject({ x: 300, y: 200, width: 120, height: 80 })
  })

  it('format moitié moins grand : tout est divisé par deux (tailles, police, contour, ombre…)', () => {
    const d = adaptDocument(doc([el({ x: 400, y: 200, width: 200, height: 100, fontSize: 40, strokeWidth: 10, cornerRadius: 20, shadow: { color: '#000', blur: 20, offsetX: 4, offsetY: 8, opacity: 1 } })]), 500, 500)
    expect(at(d)).toMatchObject({ x: 200, y: 100, width: 100, height: 50, fontSize: 20, strokeWidth: 5, cornerRadius: 10, shadow: { blur: 10, offsetX: 2, offsetY: 4 } })
  })

  it('carré → portrait : la composition garde sa taille et est CENTRÉE (bandes de part et d\'autre)', () => {
    const d = adaptDocument(doc([el({ x: 450, y: 100, width: 100, height: 100 })]), 1000, 2000)
    expect(at(d)).toMatchObject({ x: 450, y: 600, width: 100, height: 100 }) // décalage vertical (2000 − 1000) / 2 = 500
  })

  it('les rapports entre éléments sont conservés : un texte posé sur une carte reste sur sa carte', () => {
    const card = el({ id: 'card', x: 150, y: 150, width: 700, height: 700 })
    const label = el({ id: 'label', type: 'text', x: 200, y: 200, width: 300, height: 60 })
    const d = adaptDocument(doc([card, label]), 1920, 1080)
    const c = boundsOf(at(d, 0))
    const l = boundsOf(at(d, 1))
    expect(l.x).toBeGreaterThanOrEqual(c.x)
    expect(l.y).toBeGreaterThanOrEqual(c.y)
    expect(l.x + l.width).toBeLessThanOrEqual(c.x + c.width)
    expect(l.x - c.x).toBeCloseTo(50 * 1.08) // même écart qu'avant, à l'échelle
  })

  it('un fond pleine page occupe tout le nouveau format ; le reste est centré à l\'échelle', () => {
    const d = adaptDocument(doc([el({ id: 'bg', width: 1000, height: 1000 }), el({ id: 'b', x: 450, y: 450 })]), 1920, 1080)
    expect(at(d)).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 })
    expect(at(d, 1)).toMatchObject({ x: 906, y: 486, width: 108, height: 108 }) // échelle 1,08, décalage horizontal 420
  })

  it('un bandeau pleine largeur occupe toute la largeur, sa hauteur suit l\'échelle', () => {
    const d = adaptDocument(doc([el({ x: 0, y: 100, width: 1000, height: 100 })]), 500, 500)
    expect(at(d)).toMatchObject({ x: 0, width: 500, height: 50 })
  })

  it('un élément collé à un bord reste collé à ce bord (et un élément central reste central)', () => {
    const d = adaptDocument(doc([el({ id: 'g', x: 0, y: 450 }), el({ id: 'm', x: 450, y: 450 }), el({ id: 'd', x: 900, y: 450 })]), 2000, 1000)
    expect(at(d, 0).x).toBe(0)
    expect(at(d, 1).x).toBe(950) // centré : (2000 − 1000) / 2 + 450
    expect(at(d, 2).x).toBe(1900) // collé au bord droit
  })

  it('un décor qui déborde de la page reste ancré au même coin', () => {
    const d = adaptDocument(doc([el({ x: 800, y: -100, width: 400, height: 400 })]), 2000, 1000)
    expect(at(d).x).toBe(2000 - (1000 - 1200) - 400) // distance (négative) au bord droit conservée : 1800
    expect(at(d).y).toBe(-100)
  })

  it('un petit élément entièrement contenu dans un décor collé à un bord le suit (l\'étoile sur le cercle)', () => {
    const circle = el({ id: 'circle', x: 700, y: 100, width: 400, height: 400 }) // déborde à droite : collé au bord droit
    const star = el({ id: 'star', x: 800, y: 150, width: 50, height: 50 })
    const d = adaptDocument(doc([circle, star]), 2000, 1000)
    const c = boundsOf(at(d, 0))
    const s = boundsOf(at(d, 1))
    expect(s.x - c.x).toBeCloseTo(100) // même position relative qu'avant dans le cercle
    expect(s.y - c.y).toBeCloseTo(50)
  })

  it('un élément qui déborde de son hôte ne le suit pas', () => {
    const circle = el({ id: 'circle', x: 700, y: 100, width: 400, height: 400 })
    const text = el({ id: 'text', x: 600, y: 150, width: 300, height: 50 }) // commence hors du cercle
    const d = adaptDocument(doc([circle, text]), 2000, 1000)
    expect(at(d, 1).x).toBe(500 + 600) // centré comme le reste de la composition
  })

  it('le centre d\'un élément pivoté suit la composition et son angle est conservé', () => {
    const e = el({ x: 500, y: 500, width: 200, height: 100, rotation: 30 })
    const before = boundsOf(e)
    const d = adaptDocument(doc([e]), 500, 500)
    const after = boundsOf(at(d))
    expect(at(d).rotation).toBe(30)
    expect(after.x + after.width / 2).toBeCloseTo((before.x + before.width / 2) / 2)
    expect(after.y + after.height / 2).toBeCloseTo((before.y + before.height / 2) / 2)
  })

  it('un groupe garde ses écarts internes et se déplace d\'un bloc', () => {
    const d = adaptDocument(doc([el({ id: 'g1', groupId: 'G', x: 100, y: 450 }), el({ id: 'g2', groupId: 'G', x: 300, y: 450 })]), 2000, 1000)
    const [a, b] = d.pages[0].elements
    expect(b.x - a.x).toBeCloseTo(200)
    expect(b.y).toBeCloseTo(a.y)
    expect(a.x).toBe(600) // 500 de décalage + 100
  })

  it('les repères suivent la composition, les dimensions sont bornées', () => {
    const base = doc([])
    base.pages[0].guides = [{ orientation: 'v', position: 100 }, { orientation: 'h', position: 100 }]
    const d = adaptDocument(base, 2000, 500)
    expect(d.pages[0].guides).toEqual([{ orientation: 'v', position: 800 }, { orientation: 'h', position: 50 }]) // échelle 0,5 ; décalage horizontal 750
    expect(adaptDocument(base, 1, 99999)).toMatchObject({ width: 16, height: 8000 })
  })

  it('le document d\'origine n\'est pas modifié', () => {
    const base = doc([el({ x: 100 })])
    adaptDocument(base, 500, 500)
    expect(base.pages[0].elements[0].x).toBe(100)
    expect(base.width).toBe(1000)
  })
})
