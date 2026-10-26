import { describe, expect, it } from 'vitest'
import {
  PT_PER_PX, baselineY, decodeDataUrl, ellipsePath, elementMatrix, lineOffsetX, parseColor, roundedRectPath, tjAdjustment
} from '@/pdfMath'

/** Applique une matrice PDF (a b c d e f) à un point local. */
const apply = (m: number[], u: number, v: number): [number, number] => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]

describe('elementMatrix', () => {
  const H = 810

  it('sans rotation : le coin haut-gauche de l’élément tombe au bon point de la page (y inversé)', () => {
    const m = elementMatrix({ x: 100, y: 200, rotation: 0 }, H)
    const [x, y] = apply(m, 0, 0)
    expect(x).toBeCloseTo(100 * PT_PER_PX)
    expect(y).toBeCloseTo(H - 200 * PT_PER_PX)
  })

  it('le coin bas-droit (w, -h dans le repère local, y vers le haut) tombe à (x + w, y + h) en pixels de design', () => {
    const m = elementMatrix({ x: 100, y: 200, rotation: 0 }, H)
    const [x, y] = apply(m, 300, -50)
    expect(x).toBeCloseTo((100 + 300) * PT_PER_PX)
    expect(y).toBeCloseTo(H - (200 + 50) * PT_PER_PX)
  })

  it('rotation de 90° horaire : l’axe x de l’élément pointe vers le bas de la page', () => {
    const m = elementMatrix({ x: 0, y: 0, rotation: 90 }, H)
    const [x, y] = apply(m, 100, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(H - 100 * PT_PER_PX) // 100 px plus bas que le coin d'ancrage
  })

  it('rotation de 90° horaire : le haut de l’élément pointe vers la droite', () => {
    const m = elementMatrix({ x: 0, y: 0, rotation: 90 }, H)
    const [x, y] = apply(m, 0, 40) // 40 px au-dessus du bord supérieur de l'élément
    expect(x).toBeCloseTo(40 * PT_PER_PX)
    expect(y).toBeCloseTo(H)
  })

  it('cohérent avec boundsOf de la géométrie de l’éditeur pour un coin quelconque', () => {
    // coin bas-gauche d'un élément 40×10 tourné de 30° autour de (50, 60), calculé à la main (repère écran, y vers le bas)
    const r = (30 * Math.PI) / 180
    const expected = { x: 50 - 10 * Math.sin(r), y: 60 + 10 * Math.cos(r) }
    const m = elementMatrix({ x: 50, y: 60, rotation: 30 }, H)
    const [x, y] = apply(m, 0, -10)
    expect(x).toBeCloseTo(expected.x * PT_PER_PX)
    expect(y).toBeCloseTo(H - expected.y * PT_PER_PX)
  })
})

describe('chemins', () => {
  it('rectangle sans arrondi : 4 coins', () => {
    expect(roundedRectPath(100, 50)).toBe('M0 0 L100 0 L100 50 L0 50 Z')
  })

  it('l’arrondi est borné à la moitié du plus petit côté', () => {
    expect(roundedRectPath(100, 40, 999)).toBe(roundedRectPath(100, 40, 20))
    expect(roundedRectPath(100, 40, -5)).toBe(roundedRectPath(100, 40, 0))
  })

  it('le rectangle arrondi reste dans sa boîte', () => {
    const nums = (roundedRectPath(120, 80, 30).match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    for (const v of nums) {
      expect(v).toBeGreaterThanOrEqual(-1e-9)
      expect(v).toBeLessThanOrEqual(120 + 1e-9)
    }
  })

  it('ellipse : passe par les quatre milieux de côtés', () => {
    const p = ellipsePath(200, 100)
    expect(p.startsWith('M0 50')).toBe(true) // milieu du bord gauche
    expect(p).toContain(' 100 0 ') // sommet
    expect(p).toContain('200 50') // bord droit
    expect(p).toContain(' 100 100 ') // bas
  })
})

describe('parseColor', () => {
  it('lit #rrggbb, #rgb et rgb()', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0 })
    expect(parseColor('#0f0')).toEqual({ r: 0, g: 1, b: 0 })
    expect(parseColor('rgb(0, 0, 255)')).toEqual({ r: 0, g: 0, b: 1 })
    expect(parseColor('#7C5CFF').r).toBeCloseTo(0x7c / 255)
  })
  it('retombe sur noir', () => {
    expect(parseColor('nimporte quoi')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor(undefined)).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('texte', () => {
  it('alignement horizontal comme Konva', () => {
    expect(lineOffsetX('left', 500, 200)).toBe(0)
    expect(lineOffsetX(undefined, 500, 200)).toBe(0)
    expect(lineOffsetX('center', 500, 200)).toBe(150)
    expect(lineOffsetX('right', 500, 200)).toBe(300)
  })

  it('ligne de base : première ligne puis interligne', () => {
    // taille 100, interligne 1, ascent 97, descent 24 → (97 - 24)/2 + 50 = 86.5
    expect(baselineY(0, 100, 1, 97, 24)).toBeCloseTo(86.5)
    expect(baselineY(2, 100, 1, 97, 24)).toBeCloseTo(286.5)
    expect(baselineY(1, 50, 1.5, 48, 12)).toBeCloseTo(18 + 37.5 + 75)
  })

  it('crénage : une paire resserrée donne une correction positive pour TJ (le texte recule)', () => {
    // police 2048 unités/em, glyphe nominal 1400, placé à 1300 → resserré de 100 unités → +48.828 millièmes d'em
    expect(tjAdjustment(1300, 1400, 2048)).toBeCloseTo(48.828, 2)
    expect(tjAdjustment(1500, 1400, 2048)).toBeCloseTo(-48.828, 2)
    expect(tjAdjustment(1400, 1400, 2048)).toBe(0)
  })
})

describe('decodeDataUrl', () => {
  it('décode du base64', () => {
    const d = decodeDataUrl('data:image/png;base64,iVBORw==')!
    expect(d.mime).toBe('image/png')
    expect([...d.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
  it('refuse ce qui n’est pas une data URL base64', () => {
    expect(decodeDataUrl('http://exemple.com/a.png')).toBeNull()
    expect(decodeDataUrl('data:image/svg+xml,<svg/>')).toBeNull()
    expect(decodeDataUrl(undefined)).toBeNull()
  })
})

import { svgPathToSegments } from '@/pdfMath'
import { SHAPES } from '@/shapes'

describe('svgPathToSegments', () => {
  it('M, L, Z', () => {
    expect(svgPathToSegments('M0 0 L10 0 L10 10 Z')).toEqual([
      { op: 'M', x: 0, y: 0 }, { op: 'L', x: 10, y: 0 }, { op: 'L', x: 10, y: 10 }, { op: 'Z' }
    ])
  })
  it('H et V utilisent le point courant', () => {
    expect(svgPathToSegments('M5 5 H20 V30 H0 Z')).toEqual([
      { op: 'M', x: 5, y: 5 }, { op: 'L', x: 20, y: 5 }, { op: 'L', x: 20, y: 30 }, { op: 'L', x: 0, y: 30 }, { op: 'Z' }
    ])
  })
  it('paires supplémentaires d\'un M = lignes', () => {
    expect(svgPathToSegments('M0 0 10 10 20 0')).toEqual([{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 10, y: 10 }, { op: 'L', x: 20, y: 0 }])
  })
  it('Q devient une cubique équivalente (mêmes extrémités, contrôles aux 2/3)', () => {
    const s = svgPathToSegments('M0 0 Q30 60 60 0')!
    expect(s[1]).toEqual({ op: 'C', x1: 20, y1: 40, x2: 40, y2: 40, x: 60, y: 0 })
  })
  it('C est repris tel quel', () => {
    expect(svgPathToSegments('M0 0 C1 2 3 4 5 6')![1]).toEqual({ op: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 })
  })
  it('Z ramène au début du sous-chemin pour un H/V qui suit', () => {
    const s = svgPathToSegments('M10 10 L20 10 Z V50')!
    expect(s.at(-1)).toEqual({ op: 'L', x: 10, y: 50 })
  })
  it('relatif, arcs, S/T, entrées vides ou incomplètes : null', () => {
    for (const bad of ['m0 0 l1 1', 'M0 0 A1 1 0 0 1 5 5', 'M0 0 S1 1 2 2', '', 'M10 L5 5', 'L1 2']) expect(svgPathToSegments(bad), bad).toBeNull()
  })
  it('toutes les formes intégrées, les rectangles arrondis et les ellipses sont convertibles', () => {
    for (const shape of SHAPES) expect(svgPathToSegments(shape.path), shape.id).not.toBeNull()
    expect(svgPathToSegments(roundedRectPath(120, 80, 20))).not.toBeNull()
    expect(svgPathToSegments(roundedRectPath(120, 80, 0))).not.toBeNull()
    expect(svgPathToSegments(ellipsePath(120, 80))).not.toBeNull()
  })
})
