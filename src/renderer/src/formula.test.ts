import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMULA, clipPolygon, clipSegments, formulaElement, formulaKept, inkOn, parsePath, renderFormula, sanitizeFormula, type Seg } from './formula'
import { svgPathToSegments } from './pdfMath'
import { scalePath } from './strokeStyle'

const ok = (latex: string, display = true): { path: string; widthEm: number; heightEm: number } => {
  const r = renderFormula(latex, display)
  if (!r.ok) throw new Error(`${latex} : ${r.error}`)
  return r
}

describe('formules : LaTeX → chemin vectoriel', () => {
  it('dessine une formule simple en un seul chemin du viewBox 100 × 100', () => {
    const r = ok('x^2')
    expect(r.path.startsWith('M')).toBe(true)
    expect(r.path).toMatch(/Z$/)
    expect(r.widthEm).toBeGreaterThan(0.5)
    expect(r.heightEm).toBeGreaterThan(0.5)
    const nums = (r.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    // tout le dessin tient dans le cadre (à une marge d'arrondi près)
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(-2)
    expect(Math.max(...nums)).toBeLessThanOrEqual(102)
  })

  it('n’utilise que des commandes absolues M, L, C, Z, comprises par tous les exports', () => {
    const r = ok('\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}')
    expect([...new Set(r.path.match(/[a-zA-Z]/g))].sort()).toEqual(['C', 'L', 'M', 'Z'])
    expect(svgPathToSegments(r.path)).not.toBeNull()
    expect(scalePath(r.path, 2, 3)).not.toBeNull()
  })

  it('le mode « en ligne » est plus compact que le mode « hors texte » pour une somme', () => {
    const d = ok('\\sum_{i=1}^{n} \\frac{1}{i}', true)
    const c = ok('\\sum_{i=1}^{n} \\frac{1}{i}', false)
    expect(c.heightEm).toBeLessThan(d.heightEm)
  })

  it('une formule plus longue est plus large', () => {
    expect(ok('a+b+c+d+e').widthEm).toBeGreaterThan(ok('a+b').widthEm * 2)
  })

  const catalogue = [
    '\\frac{a+b}{2}', '\\sqrt{x}', '\\sqrt[3]{x^2+1}', 'x_1^2', '\\sum_{i=1}^{n} i^2', '\\int_0^1 x\\,dx', '\\prod_{k=1}^{n} k',
    '\\lim_{x\\to 0}\\frac{\\sin x}{x}', '\\alpha+\\beta=\\gamma', '\\Delta\\varphi', '\\vec{v}\\cdot\\vec{w}', '\\overline{AB}', '\\hat{x}',
    '\\binom{n}{k}', '\\left(\\frac{a}{b}\\right)^2', '\\left[\\frac{a}{b}\\right]', '\\mathbb{R}', '\\mathcal{F}',
    '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '\\begin{cases}x&x>0\\\\0&x\\le 0\\end{cases}', '\\begin{aligned}a&=b+c\\\\&=d\\end{aligned}',
    '\\text{vitesse}=\\frac{d}{t}', 'H_2O', 'CO_2 + H_2O \\rightarrow', '\\xrightarrow{\\Delta}', 'E=mc^2', '\\pm\\infty', '\\neq\\leq\\geq\\approx',
    '\\forall x\\in\\mathbb{N}', '\\overrightarrow{AB}', '\\widehat{ABC}', '\\overbrace{a+b+c}^{n}', '\\underbrace{x+y}_{k}', '\\xrightarrow{abcdef}', '\\overline{ABCDEFG}', '\\left\\{\\frac{a}{b}\\right\\}', '\\ce{H2O}', '\\ce{CO2 + H2O -> H2CO3}', '\\ce{2H2 + O2 <=> 2H2O}', '\\ce{SO4^2-}'
  ]
  for (const latex of catalogue) {
    it(`dessine « ${latex} »`, () => {
      const r = renderFormula(latex, true)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
      // tout reste dans le cadre : un trait étiré mal rogné dépasserait
      if (r.ok) {
        const nums = (r.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
        expect(Math.min(...nums), latex).toBeGreaterThanOrEqual(-2)
        expect(Math.max(...nums), latex).toBeLessThanOrEqual(102)
      }
    })
  }

  it('refuse un code invalide, vide ou trop long avec un message', () => {
    const bad = renderFormula('\\frac{a', true)
    expect(bad.ok).toBe(false)
    const unknown = renderFormula('\\inconnue{x}', true)
    expect(unknown).toMatchObject({ ok: false })
    expect(!unknown.ok && unknown.error).toMatch(/inconnue|Undefined/i)
    expect(renderFormula('   ', true)).toEqual({ ok: false, error: 'empty' })
    expect(renderFormula('x'.repeat(2001), true)).toEqual({ ok: false, error: 'too-long' })
  })

})

describe('rognage au cadre', () => {
  const box = { x0: 0, y0: 0, x1: 10, y1: 10 }
  const rect = (x0: number, y0: number, x1: number, y1: number): Seg[] => [{ op: 'M', p: [x0, y0] }, { op: 'L', p: [x1, y0] }, { op: 'L', p: [x1, y1] }, { op: 'L', p: [x0, y1] }, { op: 'Z' }]
  const xs = (segs: Seg[]): number[] => segs.flatMap((s) => (s.op === 'Z' ? [] : [s.p[0]]))

  it('garde tel quel ce qui tient dans le cadre, écarte ce qui est dehors', () => {
    expect(clipSegments(rect(2, 2, 8, 8), box)).toEqual(rect(2, 2, 8, 8))
    expect(clipSegments(rect(20, 2, 30, 8), box)).toEqual([])
  })

  it('coupe un trait qui dépasse des deux côtés, comme le fait MathJax pour \\overline', () => {
    const out = clipSegments(rect(-100, 4, 200, 6), box)
    expect(Math.min(...xs(out))).toBe(0)
    expect(Math.max(...xs(out))).toBe(10)
    expect(out.filter((s) => s.op === 'M')).toHaveLength(1)
  })

  it('un polygone entièrement dehors ne laisse rien', () => {
    expect(clipPolygon([[20, 20], [30, 20], [30, 30]], box)).toEqual([])
  })

  it('une courbe qui dépasse devient des segments dans le cadre', () => {
    const arch: Seg[] = [{ op: 'M', p: [0, 5] }, { op: 'C', a: [0, -40], b: [10, -40], p: [10, 5] }, { op: 'Z' }]
    const out = clipSegments(arch, box)
    expect(out.length).toBeGreaterThan(3)
    for (const s of out) if (s.op !== 'Z') expect(s.p[1]).toBeGreaterThanOrEqual(0)
  })
})

describe('lecture d’un chemin SVG', () => {
  it('convertit les coordonnées relatives, H, V, S, T et Q en segments absolus M, L, C, Z', () => {
    const segs = parsePath('m10 10 l5 0 h5 v5 q5 5 10 0 t10 0 z')
    expect(segs[0]).toEqual({ op: 'M', p: [10, 10] })
    expect(segs[1]).toEqual({ op: 'L', p: [15, 10] })
    expect(segs[2]).toEqual({ op: 'L', p: [20, 10] })
    expect(segs[3]).toEqual({ op: 'L', p: [20, 15] })
    expect(segs[4]).toMatchObject({ op: 'C', p: [30, 15] })
    expect(segs[5]).toMatchObject({ op: 'C', p: [40, 15] })
    expect(segs[6]).toEqual({ op: 'Z' })
  })

  it('les paires suivantes d’un M sont des L, un arc est refusé', () => {
    expect(parsePath('M0 0 10 10 20 0')).toEqual([{ op: 'M', p: [0, 0] }, { op: 'L', p: [10, 10] }, { op: 'L', p: [20, 0] }])
    expect(() => parsePath('M0 0 A5 5 0 0 1 10 10')).toThrow()
  })
})

describe('élément formule', () => {
  const at = { x: 100, y: 50 }

  it('crée un élément chemin dont la taille suit celle de la lettre « m »', () => {
    const small = formulaElement({ ...DEFAULT_FORMULA, size: 40 }, at)
    const big = formulaElement({ ...DEFAULT_FORMULA, size: 80 }, at)
    if (!('type' in small) || !('type' in big)) throw new Error('formule non dessinée')
    expect(small).toMatchObject({ type: 'path', x: 100, y: 50, fill: '#000000', name: 'formula' })
    expect(small.formula).toEqual({ latex: DEFAULT_FORMULA.latex, display: true, size: 40 })
    expect(big.width / small.width).toBeCloseTo(2, 1)
    expect(big.height / small.height).toBeCloseTo(2, 1)
  })

  it('borne la taille, garde les réglages (couleur, opacité, rotation, verrou) à la mise à jour', () => {
    const base = formulaElement({ ...DEFAULT_FORMULA, size: 5000 }, at, { keep: { fill: '#ff0000', opacity: 0.5, rotation: 30, locked: true } })
    if (!('type' in base)) throw new Error('formule non dessinée')
    expect(base.formula!.size).toBe(400)
    expect(base).toMatchObject({ fill: '#ff0000', opacity: 0.5, rotation: 30, locked: true })
    expect(formulaKept({ ...base, link: { url: 'https://exemple.fr' } })).toMatchObject({ fill: '#ff0000', opacity: 0.5, rotation: 30, locked: true, link: { url: 'https://exemple.fr' } })
  })

  it('rend l’erreur sans élément quand le code est invalide', () => {
    expect(formulaElement({ ...DEFAULT_FORMULA, latex: '\\frac{' }, at)).toMatchObject({ ok: false })
  })
})

describe('lecture d’un fichier : description de formule', () => {
  it('garde une description valide et la normalise', () => {
    const e: { type: string; formula?: unknown } = { type: 'path', formula: { latex: 'x^2', display: false, size: 9999 } }
    sanitizeFormula(e)
    expect(e.formula).toEqual({ latex: 'x^2', display: false, size: 400 })
    const f: { type: string; formula?: unknown } = { type: 'path', formula: { latex: 'y', size: 'grand' } }
    sanitizeFormula(f)
    expect(f.formula).toEqual({ latex: 'y', display: true, size: DEFAULT_FORMULA.size })
  })

  it('retire une description illisible, vide, trop longue ou sur un autre type d’élément', () => {
    for (const formula of [null, 3, {}, { latex: '' }, { latex: '   ' }, { latex: 42 }, { latex: 'x'.repeat(2001) }]) {
      const e: { type: string; formula?: unknown } = { type: 'path', formula }
      sanitizeFormula(e)
      expect(e.formula).toBeUndefined()
    }
    const t: { type: string; formula?: unknown } = { type: 'text', formula: { latex: 'x' } }
    sanitizeFormula(t)
    expect(t.formula).toBeUndefined()
  })
})

describe('couleur d’une formule neuve', () => {
  it('noire sur un fond clair, blanche sur un fond sombre, noire si le fond est inconnu', () => {
    expect(inkOn('#ffffff')).toBe('#000000')
    expect(inkOn('#f5e6c8')).toBe('#000000')
    expect(inkOn('#101820')).toBe('#ffffff')
    expect(inkOn('#1e1f24')).toBe('#ffffff')
    expect(inkOn('rouge')).toBe('#000000')
  })
})
