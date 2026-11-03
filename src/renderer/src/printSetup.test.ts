import { describe, expect, it } from 'vitest'
import { PX_PER_MM, cropMarkSegments, hasPrintMarks, pdfPageLayout, printSetupOf, safeBox, sanitizePrintSetup, textsOutsideSafe } from '@/printSetup'
import type { TrameElement, TramePage } from '@/types'

const text = (id: string, o: Partial<TrameElement> = {}): TrameElement => ({ id, type: 'text', x: 100, y: 100, width: 200, height: 40, rotation: 0, opacity: 1, fill: '#000', ...o })
const page = (elements: TrameElement[]): TramePage => ({ id: 'p', background: '#fff', elements })
const doc = { width: 800, height: 600 }

describe('sanitizePrintSetup', () => {
  it('ramène les valeurs dans les bornes et arrondit', () => {
    const d: { print?: unknown } = { print: { bleedMm: 99, safeMm: -4, marks: true } }
    sanitizePrintSetup(d)
    expect(d.print).toEqual({ bleedMm: 10, safeMm: 0, marks: true })
    const e: { print?: unknown } = { print: { bleedMm: 3.456, safeMm: 5, marks: 'oui' } }
    sanitizePrintSetup(e)
    expect(e.print).toEqual({ bleedMm: 3.46, safeMm: 5, marks: false })
  })
  it('retire un réglage neutre ou invalide', () => {
    for (const print of [{ bleedMm: 0, safeMm: 0, marks: false }, 'x', null, { bleedMm: 'a' }]) {
      const d: { print?: unknown } = { print }
      sanitizePrintSetup(d)
      expect(d.print).toBeUndefined()
    }
  })
  it('laisse un document sans réglage tel quel', () => {
    const d: { print?: unknown } = {}
    sanitizePrintSetup(d)
    expect('print' in d).toBe(false)
  })
})

describe('printSetupOf / hasPrintMarks', () => {
  it('valeurs par défaut', () => {
    expect(printSetupOf({})).toEqual({ bleedMm: 0, safeMm: 0, marks: false })
    expect(hasPrintMarks(printSetupOf({}))).toBe(false)
    expect(hasPrintMarks({ bleedMm: 3, safeMm: 0, marks: false })).toBe(true)
    expect(hasPrintMarks({ bleedMm: 0, safeMm: 0, marks: true })).toBe(true)
  })
})

describe('safeBox / textsOutsideSafe', () => {
  it('zone de sécurité = page moins la marge sur chaque côté', () => {
    const b = safeBox(doc, { bleedMm: 0, safeMm: 5, marks: false })!
    expect(b.x).toBeCloseTo(5 * PX_PER_MM)
    expect(b.width).toBeCloseTo(800 - 10 * PX_PER_MM)
    expect(safeBox(doc, { bleedMm: 0, safeMm: 0, marks: false })).toBeNull()
  })
  it('signale un texte trop près du bord, pas un texte bien placé ni une image pleine page', () => {
    const setup = { bleedMm: 0, safeMm: 5, marks: false }
    const els = [text('ok'), text('bord', { x: 4 }), text('droite', { x: 700 }), text('masque', { x: 0, hidden: true }), { ...text('img', { x: -10, width: 900 }), type: 'image' as const }]
    expect(textsOutsideSafe(page(els), doc, setup)).toEqual(['bord', 'droite'])
  })
  it('tient compte de la rotation', () => {
    const setup = { bleedMm: 0, safeMm: 5, marks: false }
    const rotated = text('r', { x: 60, y: 40, width: 200, height: 40, rotation: -90 }) // se redresse vers le haut, sort par y < 0
    expect(textsOutsideSafe(page([rotated]), doc, setup)).toEqual(['r'])
  })
})

describe('pdfPageLayout / cropMarkSegments', () => {
  const mm = 72 / 25.4
  it('sans réglage, la page ne change pas', () => {
    const l = pdfPageLayout(600, 450, { bleedMm: 0, safeMm: 0, marks: false })
    expect([l.margin, l.width, l.height]).toEqual([0, 600, 450])
  })
  it('le fond perdu agrandit la page de chaque côté', () => {
    const l = pdfPageLayout(600, 450, { bleedMm: 3, safeMm: 0, marks: false })
    expect(l.margin).toBeCloseTo(3 * mm)
    expect(l.width).toBeCloseTo(600 + 6 * mm)
  })
  it('les traits de coupe ajoutent leur longueur au-delà du fond perdu', () => {
    const l = pdfPageLayout(600, 450, { bleedMm: 3, safeMm: 0, marks: true })
    expect(l.margin).toBeCloseTo(8 * mm) // 3 mm de fond perdu + 5 mm de trait
    const l0 = pdfPageLayout(600, 450, { bleedMm: 0, safeMm: 0, marks: true })
    expect(l0.margin).toBeCloseTo(7 * mm) // 2 mm minimum d'écart + 5 mm de trait
  })
  it('huit traits, tous dans la page, qui ne coupent jamais le bord fini ni le fond perdu', () => {
    const setup = { bleedMm: 3, safeMm: 0, marks: true }
    const l = pdfPageLayout(600, 450, setup)
    const segs = cropMarkSegments(600, 450, l)
    expect(segs).toHaveLength(8)
    for (const [x1, y1, x2, y2] of segs) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(-1e-9)
        expect(y).toBeGreaterThanOrEqual(-1e-9)
        expect(x).toBeLessThanOrEqual(l.width + 1e-9)
        expect(y).toBeLessThanOrEqual(l.height + 1e-9)
        // jamais à l'intérieur du fond perdu
        const inside = x > l.margin - l.bleed + 1e-6 && x < l.margin + 600 + l.bleed - 1e-6 && y > l.margin - l.bleed + 1e-6 && y < l.margin + 450 + l.bleed - 1e-6
        expect(inside).toBe(false)
      }
    }
  })
})
