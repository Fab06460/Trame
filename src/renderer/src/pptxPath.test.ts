import { describe, expect, it } from 'vitest'
import { absoluteSegments, OPEN_SHAPE_NAME, pptxGeometry, roundOpenLines, straightLine } from './pptxPath'

const near = (a: number, b: number, d = 1e-6): boolean => Math.abs(a - b) < d

describe('chemin SVG → segments absolus', () => {
  it('lit M L C Z en majuscules et en minuscules', () => {
    expect(absoluteSegments('M10 10 L20 10 L20 20 Z')!.map((s) => s.c)).toEqual(['M', 'L', 'L', 'Z'])
    expect(absoluteSegments('m10 10 l10 0 l0 10 z')!).toEqual(absoluteSegments('M10 10 L20 10 L20 20 Z'))
    expect(absoluteSegments('M0 0 C10 0 20 10 20 20')![1]).toEqual({ c: 'C', p: [10, 0, 20, 10, 20, 20] })
  })

  it('H, V et les paires qui suivent un M sont des segments droits', () => {
    expect(absoluteSegments('M5 5 H15 V25')!.map((s) => s.p)).toEqual([[5, 5], [15, 5], [15, 25]])
    expect(absoluteSegments('M0 0 10 0 10 10')!.map((s) => s.c)).toEqual(['M', 'L', 'L'])
    expect(absoluteSegments('M0 0 h10 v10')!.map((s) => s.p)).toEqual([[0, 0], [10, 0], [10, 10]])
  })

  it('S réfléchit la poignée précédente, Q et T deviennent des cubiques', () => {
    const s = absoluteSegments('M0 0 C0 10 10 10 10 0 S20 -10 20 0')!
    expect(s[2]).toEqual({ c: 'C', p: [10, -10, 20, -10, 20, 0] })
    const q = absoluteSegments('M0 0 Q10 10 20 0')![1]
    expect(q.c).toBe('C')
    expect(q.p.map((v) => Math.round(v * 1000) / 1000)).toEqual([6.667, 6.667, 13.333, 6.667, 20, 0])
    const t = absoluteSegments('M0 0 Q10 10 20 0 T40 0')![2]
    expect(t.p[4]).toBe(40)
    expect(near(t.p[1], -6.6667, 1e-3)).toBe(true) // la poignée est le reflet de (10, 10) autour de (20, 0)
  })

  it('un arc devient des cubiques qui passent par ses extrémités (demi-cercle, indicateurs collés)', () => {
    for (const d of ['M0 0 A10 10 0 0 1 20 0', 'M0 0a10 10 0 0120 0']) {
      const s = absoluteSegments(d)!
      expect(s.length).toBeGreaterThan(2) // deux quarts de tour au moins
      const last = s[s.length - 1]
      expect(near(last.p[4], 20)).toBe(true)
      expect(near(last.p[5], 0)).toBe(true)
      // le sommet du demi-cercle (sens horaire à l'écran) est au-dessus de la corde : y = −10
      expect(near(s[1].p[4], 10)).toBe(true)
      expect(near(s[1].p[5], -10)).toBe(true)
    }
  })

  it('un arc sans rayon est un segment droit ; un grand arc se découpe en plusieurs quarts', () => {
    expect(absoluteSegments('M0 0 A0 5 0 0 1 10 0')!.map((s) => s.c)).toEqual(['M', 'L'])
    expect(absoluteSegments('M10 0 A10 10 0 1 1 10 20')!.filter((s) => s.c === 'C')).toHaveLength(2)
  })

  it('une commande après Z repart du début du sous-chemin', () => {
    const s = absoluteSegments('M0 0 L10 0 L10 10 Z L5 5')!
    expect(s.map((x) => x.c)).toEqual(['M', 'L', 'L', 'Z', 'M', 'L'])
    expect(s[4].p).toEqual([0, 0])
  })

  it('refuse ce qui est illisible ou vide', () => {
    for (const d of ['', 'M', 'L10 10', 'M0 0', 'M0 0 X5 5', '10 10 L5 5', 'M0 0 L']) expect(absoluteSegments(d), d).toBeNull()
  })
})

describe('forme libre PowerPoint', () => {
  it('étire le viewBox 100 × 100 à la boîte et écrit en pouces', () => {
    // boîte de 96 × 192 px = 1 × 2 pouces
    const g = pptxGeometry('M0 0 L100 0 L100 100 Z', 96, 192)!
    expect(g.subpaths).toBe(1)
    expect(g.points).toEqual([{ x: 0, y: 0, moveTo: true }, { x: 1, y: 0 }, { x: 1, y: 2 }, { close: true }])
  })

  it('écrit les courbes en cubiques, avec leurs deux poignées', () => {
    const g = pptxGeometry('M0 0 C0 50 100 50 100 0', 96, 96)!
    expect(g.points[1]).toEqual({ x: 1, y: 0, curve: { type: 'cubic', x1: 0, y1: 0.5, x2: 1, y2: 0.5 } })
  })

  it('compte les sous-chemins', () => {
    expect(pptxGeometry('M0 0 L10 10 M20 20 L30 30', 100, 100)!.subpaths).toBe(2)
  })

  it('refuse un tracé illisible ou démesuré (plus de 100 pouces : pptxgenjs y verrait des EMU)', () => {
    expect(pptxGeometry('n\'importe quoi', 100, 100)).toBeNull()
    expect(pptxGeometry('M0 0 L100 100', 96 * 200, 96)).toBeNull()
  })
})

describe('bouts et angles arrondis des tracés ouverts', () => {
  const sp = (name: string, ln: string): string => `<p:sp><p:nvSpPr><p:cNvPr id="3" name="${name}"></p:cNvPr><p:cNvSpPr/><p:nvPr></p:nvPr></p:nvSpPr><p:spPr><a:noFill/>${ln}</p:spPr></p:sp>`

  it('ajoute cap="rnd" et l\'angle rond, avant les pointes', () => {
    const xml = sp(OPEN_SHAPE_NAME, '<a:ln w="38100"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:prstDash val="dash"/><a:tailEnd type="triangle"/></a:ln>')
    const out = roundOpenLines(xml)
    expect(out).toContain('<a:ln w="38100" cap="rnd">')
    expect(out).toContain('<a:prstDash val="dash"/><a:round/><a:tailEnd type="triangle"/></a:ln>')
  })

  it('sans pointe, l\'angle rond termine le contour', () => {
    const out = roundOpenLines(sp(OPEN_SHAPE_NAME, '<a:ln w="100"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>'))
    expect(out).toContain('</a:solidFill><a:round/></a:ln>')
  })

  it('ne touche pas les autres formes', () => {
    const xml = sp('Shape 4', '<a:ln w="100"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>')
    expect(roundOpenLines(xml)).toBe(xml)
  })
})

describe('ligne droite → ligne PowerPoint', () => {
  const base = { x: 100, y: 50, rotation: 0, width: 200, height: 40 }

  it('une ligne horizontale ou montante : boîte et sens', () => {
    expect(straightLine({ ...base, path: 'M0 50 L100 50' })).toEqual({ x: 100, y: 70, w: 200, h: 0, flipH: false, flipV: false })
    expect(straightLine({ ...base, path: 'M0 100 L100 0' })).toEqual({ x: 100, y: 50, w: 200, h: 40, flipH: false, flipV: true })
  })

  it('une ligne qui part de la droite : retournée horizontalement', () => {
    expect(straightLine({ ...base, path: 'M100 0 L0 100' })).toEqual({ x: 100, y: 50, w: 200, h: 40, flipH: true, flipV: false })
  })

  it('la rotation de l\'élément est cuite dans la position (autour du coin haut-gauche)', () => {
    // 90° : l'axe horizontal de l'élément devient vertical vers le bas
    const l = straightLine({ x: 100, y: 100, rotation: 90, width: 200, height: 1, path: 'M0 0 L100 0' })!
    expect(l.x).toBeCloseTo(100, 6)
    expect(l.y).toBeCloseTo(100, 6)
    expect(l.w).toBeCloseTo(0, 6)
    expect(l.h).toBeCloseTo(200, 6)
    expect(l.flipV).toBe(false)
  })

  it('ni une courbe ni un tracé à plusieurs points n\'est une ligne droite', () => {
    expect(straightLine({ ...base, path: 'M0 0 C0 50 100 50 100 0' })).toBeNull()
    expect(straightLine({ ...base, path: 'M0 0 L50 50 L100 0' })).toBeNull()
  })
})
