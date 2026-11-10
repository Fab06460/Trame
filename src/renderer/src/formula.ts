import { nanoid } from 'nanoid'
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js'
import { contrastRatio, parseHex } from '@/accessibility'
import type { FormulaSpec, TrameElement } from '@/types'

export type { FormulaSpec }

/** Longueur maximale du code LaTeX. */
export const MAX_FORMULA_CHARS = 2000
/** Taille (1 em, en pixels) : bornes et valeur d'une formule neuve. */
export const FORMULA_SIZE = { min: 8, max: 400 }
export const DEFAULT_FORMULA: FormulaSpec = { latex: '\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', display: true, size: 64 }

export interface FormulaGeometry {
  /** chemin SVG (viewBox 100 × 100) : que des commandes absolues M, L, C, Z */
  path: string
  /** dimensions naturelles, en em (1 em = la taille de la police) */
  widthEm: number
  heightEm: number
}
export type FormulaResult = ({ ok: true } & FormulaGeometry) | { ok: false; error: string }

// ───────────────────────── MathJax (sans DOM : adaptateur « lite »), sortie SVG avec les glyphes inclus dans chaque chemin ─────────────────────────

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
let document_: ReturnType<typeof mathjax.document> | null = null
function engine(): ReturnType<typeof mathjax.document> {
  // une erreur de syntaxe LaTeX doit être une erreur, pas un dessin rouge : on la lève
  document_ ??= mathjax.document('', {
    InputJax: new TeX({
      packages: ['base', 'ams', 'mhchem'], // mhchem : formules chimiques, \ce{H2O}
      formatError: (_jax: unknown, err: Error) => {
        throw err
      }
    }),
    OutputJax: new SVG({ fontCache: 'none' })
  })
  return document_
}

// ───────────────────────── mise à plat : tous les chemins du SVG en un seul, dans un repère commun ─────────────────────────

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
/** `m · n` : n s'applique d'abord. */
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
]

class Unsupported extends Error {}

/** Attribut `transform` (translate, scale, matrix, dans l'ordre d'écriture) ; tout le reste (rotate, skew…) est refusé. */
function parseTransform(text: string | null | undefined): Matrix {
  let m = IDENTITY
  if (!text) return m
  const re = /(translate|scale|matrix)\(([^)]*)\)/g
  for (const found of text.matchAll(re)) {
    const v = found[2].split(/[\s,]+/).filter(Boolean).map(Number)
    if (v.some((x) => !Number.isFinite(x))) throw new Unsupported('transform')
    let n: Matrix
    if (found[1] === 'translate') n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]
    else if (found[1] === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]
    else if (v.length === 6) n = v as Matrix
    else throw new Unsupported('matrix')
    m = mul(m, n)
  }
  if (text.replace(re, '').replace(/[\s,]/g, '')) throw new Unsupported('transform')
  return m
}

export type Seg = { op: 'M' | 'L'; p: [number, number] } | { op: 'C'; a: [number, number]; b: [number, number]; p: [number, number] } | { op: 'Z' }

/** Chemin SVG quelconque (absolu ou relatif ; pas d'arcs) en segments absolus M, L, C, Z (une quadratique devient une cubique). */
export function parsePath(d: string): Seg[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const out: Seg[] = []
  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let lastC: [number, number] | null = null // dernier point de contrôle (pour S et T)
  let lastQ: [number, number] | null = null
  const num = (): number => {
    const v = Number(tokens[i++])
    if (!Number.isFinite(v)) throw new Unsupported('path')
    return v
  }
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++]
    else if (!cmd) throw new Unsupported('path')
    const rel = cmd === cmd.toLowerCase()
    const up = cmd.toUpperCase()
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    if (up === 'Z') {
      out.push({ op: 'Z' })
      cx = sx
      cy = sy
      lastC = lastQ = null
      continue
    }
    if (up === 'M' || up === 'L') {
      const x = num() + ox
      const y = num() + oy
      out.push({ op: up === 'M' ? 'M' : 'L', p: [x, y] })
      cx = x
      cy = y
      if (up === 'M') {
        sx = x
        sy = y
        cmd = rel ? 'l' : 'L' // les paires suivantes d'un M sont des L
      }
      lastC = lastQ = null
    } else if (up === 'H') {
      cx = num() + ox
      out.push({ op: 'L', p: [cx, cy] })
      lastC = lastQ = null
    } else if (up === 'V') {
      cy = num() + oy
      out.push({ op: 'L', p: [cx, cy] })
      lastC = lastQ = null
    } else if (up === 'C' || up === 'S') {
      const a: [number, number] = up === 'S' ? (lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy]) : [num() + ox, num() + oy]
      const b: [number, number] = [num() + ox, num() + oy]
      const p: [number, number] = [num() + ox, num() + oy]
      out.push({ op: 'C', a, b, p })
      lastC = b
      lastQ = null
      cx = p[0]
      cy = p[1]
    } else if (up === 'Q' || up === 'T') {
      const q: [number, number] = up === 'T' ? (lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy]) : [num() + ox, num() + oy]
      const p: [number, number] = [num() + ox, num() + oy]
      out.push({ op: 'C', a: [cx + (2 / 3) * (q[0] - cx), cy + (2 / 3) * (q[1] - cy)], b: [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p })
      lastQ = q
      lastC = null
      cx = p[0]
      cy = p[1]
    } else throw new Unsupported('path') // arcs A : jamais produits par MathJax
  }
  return out
}

const apply = (m: Matrix, p: [number, number]): [number, number] => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
const mapSeg = (m: Matrix, s: Seg): Seg => (s.op === 'Z' ? s : s.op === 'C' ? { op: 'C', a: apply(m, s.a), b: apply(m, s.b), p: apply(m, s.p) } : { op: s.op, p: apply(m, s.p) })

/** Sens (signe de l'aire algébrique) d'une suite de sous-chemins fermés, d'après leurs points. */
function signedArea(segs: Seg[]): number {
  let total = 0
  let pts: [number, number][] = []
  const close = (): void => {
    for (let k = 0; k < pts.length; k++) {
      const [x1, y1] = pts[k]
      const [x2, y2] = pts[(k + 1) % pts.length]
      total += x1 * y2 - x2 * y1
    }
    pts = []
  }
  for (const s of segs) {
    if (s.op === 'M') {
      close()
      pts.push(s.p)
    } else if (s.op === 'Z') close()
    else pts.push(s.p)
  }
  close()
  return total / 2
}

// ───────────────────────── rognage : MathJax étire des traits et des flèches en les rognant à leur cadre (<svg> imbriqué) ─────────────────────────

export type Rect = { x0: number; y0: number; x1: number; y1: number }
export type Pt = [number, number]

/** Sous-chemins (de M à Z) d'une suite de segments. */
function subpaths(segs: Seg[]): Seg[][] {
  const out: Seg[][] = []
  let cur: Seg[] = []
  for (const s of segs) {
    if (s.op === 'M' && cur.length) {
      out.push(cur)
      cur = []
    }
    cur.push(s)
  }
  if (cur.length) out.push(cur)
  return out
}

const points = (sub: Seg[]): Pt[] => sub.flatMap((s) => (s.op === 'Z' ? [] : s.op === 'C' ? [s.a, s.b, s.p] : [s.p]))

/** Polygone d'un sous-chemin : les courbes cubiques sont remplacées par 12 segments (le rognage ne touche que de rares pièces). */
function polygon(sub: Seg[]): Pt[] {
  const out: Pt[] = []
  let cur: Pt = [0, 0]
  for (const s of sub) {
    if (s.op === 'M' || s.op === 'L') {
      out.push(s.p)
      cur = s.p
    } else if (s.op === 'C') {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12
        const u = 1 - t
        out.push([
          u * u * u * cur[0] + 3 * u * u * t * s.a[0] + 3 * u * t * t * s.b[0] + t * t * t * s.p[0],
          u * u * u * cur[1] + 3 * u * u * t * s.a[1] + 3 * u * t * t * s.b[1] + t * t * t * s.p[1]
        ])
      }
      cur = s.p
    }
  }
  return out
}

/** Sutherland–Hodgman : le polygone rogné au rectangle (vide si rien ne reste). */
export function clipPolygon(poly: Pt[], r: Rect): Pt[] {
  const edges: { inside: (p: Pt) => boolean; cut: (a: Pt, b: Pt) => Pt }[] = [
    { inside: (p) => p[0] >= r.x0, cut: (a, b) => [r.x0, a[1] + ((b[1] - a[1]) * (r.x0 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= r.x1, cut: (a, b) => [r.x1, a[1] + ((b[1] - a[1]) * (r.x1 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= r.y0, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (r.y0 - a[1])) / (b[1] - a[1]), r.y0] },
    { inside: (p) => p[1] <= r.y1, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (r.y1 - a[1])) / (b[1] - a[1]), r.y1] }
  ]
  let out = poly
  for (const e of edges) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const a = input[i]
      const b = input[(i + 1) % input.length]
      if (e.inside(b)) {
        if (!e.inside(a)) out.push(e.cut(a, b))
        out.push(b)
      } else if (e.inside(a)) out.push(e.cut(a, b))
    }
    if (!out.length) return []
  }
  return out
}

/** Rogne des sous-chemins fermés au rectangle : ceux qui y tiennent restent tels quels (courbes comprises), les autres deviennent des polygones. */
export function clipSegments(segs: Seg[], r: Rect): Seg[] {
  const out: Seg[] = []
  for (const sub of subpaths(segs)) {
    const pts = points(sub)
    if (!pts.length) continue
    const inside = pts.every((p) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1)
    if (inside) {
      out.push(...sub)
      continue
    }
    if (pts.every((p) => p[0] < r.x0) || pts.every((p) => p[0] > r.x1) || pts.every((p) => p[1] < r.y0) || pts.every((p) => p[1] > r.y1)) continue
    const poly = clipPolygon(polygon(sub), r)
    if (poly.length < 3) continue
    out.push({ op: 'M', p: poly[0] }, ...poly.slice(1).map((p): Seg => ({ op: 'L', p })), { op: 'Z' })
  }
  return out
}

const num = (el: unknown, name: string): number | null => {
  const v = adaptor.getAttribute(el as never, name)
  return v === undefined || v === null || v === '' ? null : Number(v)
}

/** Parcourt le SVG de MathJax : glyphes (`path`), traits de fraction et de racine (`rect`), groupes transformés. Tout autre élément est refusé. */
function collect(node: unknown, m: Matrix, glyphs: Seg[], rects: [number, number][][]): void {
  const kind = adaptor.kind(node as never)
  if (kind === '#text' || kind === '#comment') return
  if (kind === 'g') {
    const next = mul(m, parseTransform(adaptor.getAttribute(node as never, 'transform') as string | undefined))
    for (const c of adaptor.childNodes(node as never)) collect(c, next, glyphs, rects)
    return
  }
  if (kind === 'path') {
    const d = adaptor.getAttribute(node as never, 'd') as string | undefined
    if (!d) return
    const t = mul(m, parseTransform(adaptor.getAttribute(node as never, 'transform') as string | undefined))
    for (const s of parsePath(d)) glyphs.push(mapSeg(t, s))
    return
  }
  if (kind === 'rect') {
    const t = mul(m, parseTransform(adaptor.getAttribute(node as never, 'transform') as string | undefined))
    const x = num(node, 'x') ?? 0
    const y = num(node, 'y') ?? 0
    const w = num(node, 'width')
    const h = num(node, 'height')
    if (w === null || h === null || ![x, y, w, h].every(Number.isFinite)) throw new Unsupported('rect')
    rects.push(([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as [number, number][]).map((q) => apply(t, q)))
    return
  }
  if (kind === 'svg') {
    // <svg> imbriqué : un cadre (x, y, width, height) qui montre la partie `viewBox` de son contenu, le reste est rogné
    const x = num(node, 'x') ?? 0
    const y = num(node, 'y') ?? 0
    const w = num(node, 'width')
    const h = num(node, 'height')
    const vb = String(adaptor.getAttribute(node as never, 'viewBox') ?? '')
      .split(/[\s,]+/)
      .map(Number)
    if (w === null || h === null || vb.length !== 4 || ![x, y, w, h, ...vb].every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) throw new Unsupported('svg')
    const innerGlyphs: Seg[] = []
    const innerRects: [number, number][][] = []
    for (const c of adaptor.childNodes(node as never)) collect(c, IDENTITY, innerGlyphs, innerRects)
    const clip: Rect = { x0: vb[0], y0: vb[1], x1: vb[0] + vb[2], y1: vb[1] + vb[3] }
    const none = String(adaptor.getAttribute(node as never, 'preserveAspectRatio') ?? '').trim() === 'none'
    const sx = w / vb[2]
    const sy = h / vb[3]
    const scale = none ? ([sx, sy] as const) : ([Math.min(sx, sy), Math.min(sx, sy)] as const)
    const tx = x + (none ? 0 : (w - vb[2] * scale[0]) / 2)
    const ty = y + (none ? 0 : (h - vb[3] * scale[1]) / 2)
    const place = mul(m, mul([1, 0, 0, 1, tx, ty], mul([scale[0], 0, 0, scale[1], 0, 0], [1, 0, 0, 1, -vb[0], -vb[1]])))
    for (const seg of clipSegments(innerGlyphs, clip)) glyphs.push(mapSeg(place, seg))
    for (const poly of innerRects) {
      const kept = clipPolygon(poly, clip)
      if (kept.length >= 3) rects.push(kept.map((q) => apply(place, q)))
    }
    return
  }
  // <use>, <line>, <text>… : non pris en charge
  throw new Unsupported(kind)
}

const r3 = (v: number): string => String(Number(v.toFixed(3)))

/** LaTeX → un seul chemin vectoriel, dans un viewBox 100 × 100, avec les dimensions naturelles en em. */
export function renderFormula(latex: string, display: boolean): FormulaResult {
  const src = latex.trim()
  if (!src) return { ok: false, error: 'empty' }
  if (src.length > MAX_FORMULA_CHARS) return { ok: false, error: 'too-long' }
  let svg: unknown
  try {
    const container = engine().convert(src, { display })
    svg = adaptor.firstChild(container)
  } catch (e) {
    const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : ''
    return { ok: false, error: message ? message.replace(/\s+/g, ' ').slice(0, 160) : 'syntax' }
  }
  try {
    const vb = String(adaptor.getAttribute(svg as never, 'viewBox') ?? '')
      .split(/[\s,]+/)
      .map(Number)
    if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) return { ok: false, error: 'syntax' }
    const glyphs: Seg[] = []
    const rects: Pt[][] = []
    for (const c of adaptor.childNodes(svg as never)) collect(c, IDENTITY, glyphs, rects)
    // un trait (rect) dessiné dans le même sens que les glyphes : sinon, là où il touche un glyphe, les deux s'annuleraient (règle non nulle)
    const outer = Math.sign(signedArea(glyphs)) || 1
    const all: Seg[] = [...glyphs]
    for (const poly of rects) {
      const ring = (pts: Pt[]): Seg[] => [{ op: 'M', p: pts[0] }, ...pts.slice(1).map((q): Seg => ({ op: 'L', p: q })), { op: 'Z' }]
      const segs = ring(poly)
      all.push(...(Math.sign(signedArea(segs)) === outer ? segs : ring([...poly].reverse())))
    }
    if (!all.length) return { ok: false, error: 'empty' }
    const [minX, minY, w, h] = vb
    const nx = (x: number): string => r3(((x - minX) / w) * 100)
    const ny = (y: number): string => r3(((y - minY) / h) * 100)
    const path = all
      .map((s) => (s.op === 'Z' ? 'Z' : s.op === 'C' ? `C${nx(s.a[0])} ${ny(s.a[1])} ${nx(s.b[0])} ${ny(s.b[1])} ${nx(s.p[0])} ${ny(s.p[1])}` : `${s.op}${nx(s.p[0])} ${ny(s.p[1])}`))
      .join('')
    return { ok: true, path, widthEm: w / 1000, heightEm: h / 1000 }
  } catch (e) {
    return { ok: false, error: e instanceof Unsupported ? 'unsupported' : 'syntax' }
  }
}

// ───────────────────────── élément du document ─────────────────────────

/** Réglages de l'élément d'origine qui se gardent quand on redessine la formule. */
export const FORMULA_KEPT = ['opacity', 'locked', 'hidden', 'protect', 'rotation', 'link', 'build', 'name', 'fill', 'gradient', 'shadow', 'stroke', 'strokeWidth', 'strokeDashed'] as const
export const formulaKept = (e: TrameElement): Partial<TrameElement> => Object.fromEntries(FORMULA_KEPT.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]))

/**
 * Élément « chemin » qui dessine la formule, coin haut-gauche en (`x`, `y`) ; sa taille vient de `spec.size`. Retourne le résultat de
 * `renderFormula` en cas d'échec (code illisible, trop long, construction non gérée), pour que l'appelant garde ce qu'il avait.
 */
export function formulaElement(spec: FormulaSpec, at: { x: number; y: number }, options: { id?: string; keep?: Partial<TrameElement> } = {}): TrameElement | { ok: false; error: string } {
  const g = renderFormula(spec.latex, spec.display)
  if (!g.ok) return g
  const size = Math.max(FORMULA_SIZE.min, Math.min(FORMULA_SIZE.max, spec.size))
  const color = options.keep?.fill ?? '#000000'
  return {
    rotation: 0,
    opacity: 1,
    name: 'formula',
    ...options.keep,
    id: options.id ?? nanoid(8),
    type: 'path',
    x: at.x,
    y: at.y,
    width: Math.max(1, Number((g.widthEm * size).toFixed(2))),
    height: Math.max(1, Number((g.heightEm * size).toFixed(2))),
    fill: color,
    path: g.path,
    formula: { latex: spec.latex, display: spec.display, size }
  }
}

/** Nettoyage à la lecture d'un fichier : une description illisible est retirée (le tracé reste, comme un chemin ordinaire). Modifie en place. */
export function sanitizeFormula(e: { formula?: unknown; type?: unknown }): void {
  const raw = e.formula as Partial<FormulaSpec> | undefined
  if (raw === undefined) return
  if (e.type !== 'path' || !raw || typeof raw !== 'object' || typeof raw.latex !== 'string' || !raw.latex.trim() || raw.latex.length > MAX_FORMULA_CHARS) {
    delete e.formula
    return
  }
  const size = typeof raw.size === 'number' && Number.isFinite(raw.size) ? Math.max(FORMULA_SIZE.min, Math.min(FORMULA_SIZE.max, raw.size)) : DEFAULT_FORMULA.size
  e.formula = { latex: raw.latex, display: raw.display !== false, size }
}

/** Encre d'une formule neuve : noire ou blanche, selon ce qui se lit le mieux sur le fond de la page (noire si le fond est inconnu). */
export function inkOn(background: string): string {
  const bg = parseHex(background)
  if (!bg) return '#000000'
  return contrastRatio(bg, [255, 255, 255]) > contrastRatio(bg, [0, 0, 0]) ? '#ffffff' : '#000000'
}

/** Couleur valide pour une formule (`#rrggbb`) ; sinon noir. */
export const formulaColor = (v: unknown): string => (typeof v === 'string' && parseHex(v) ? v : '#000000')
