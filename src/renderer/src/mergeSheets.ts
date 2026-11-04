import { nanoid } from 'nanoid'
import type { TrameDocument, TrameElement, TramePage } from '@/types'

/** Cases de taille fixe d'une planche du commerce, en mm. */
export interface FixedGrid {
  cellWMm: number
  cellHMm: number
  gapXMm: number
  gapYMm: number
}

/** Planche : plusieurs fiches par feuille (étiquettes, badges, cartes), découpées ensuite. */
export interface SheetLayout {
  paper: 'a4' | 'letter'
  landscape: boolean
  cols: number
  rows: number
  /** marge autour de la grille, en mm */
  marginMm: number
  /** espace entre deux fiches, en mm */
  gapMm: number
  /** planche du commerce : cases de taille fixe, grille centrée sur la feuille (les marges et l'espace de `marginMm` / `gapMm` ne servent plus) */
  fixed?: FixedGrid
  /** identifiant du gabarit choisi (voir `sheetPresets.ts`), pour l'afficher ; absent = grille libre */
  preset?: string
  /** réglage fin : décalage de toute la grille, en mm (compense l'imprimante) */
  offsetXMm?: number
  offsetYMm?: number
  /** vrai : la fiche est agrandie ou réduite pour remplir sa case (étiquettes d'une planche du commerce) ; faux : elle garde sa taille réelle, centrée, et n'est réduite que si elle ne tient pas */
  fillCell: boolean
  /** contour fin autour de chaque fiche, pour la découpe */
  cutMarks: boolean
  /** versos (pages paires d'un modèle recto-verso) en miroir, pour qu'ils tombent derrière leur recto (retournement sur le bord long) */
  mirrorBacks: boolean
}

/** Pixels de design par mm (96 dpi, comme les formats de page de Trame). */
export const PX_PER_MM = 96 / 25.4
const PAPER = { a4: { width: 794, height: 1123 }, letter: { width: 816, height: 1056 } } as const

export const MAX_GRID = { cols: 10, rows: 20 }

export const sheetSize = (l: Pick<SheetLayout, 'paper' | 'landscape'>): { width: number; height: number } => {
  const p = PAPER[l.paper]
  return l.landscape ? { width: p.height, height: p.width } : { ...p }
}

interface Cell {
  x: number
  y: number
  width: number
  height: number
}

/** Cases de la grille, ligne par ligne, de gauche à droite. */
export function cells(l: SheetLayout): Cell[] {
  const { width, height } = sheetSize(l)
  const dx = (l.offsetXMm ?? 0) * PX_PER_MM
  const dy = (l.offsetYMm ?? 0) * PX_PER_MM
  if (l.fixed) {
    const w = l.fixed.cellWMm * PX_PER_MM
    const h = l.fixed.cellHMm * PX_PER_MM
    const gx = l.fixed.gapXMm * PX_PER_MM
    const gy = l.fixed.gapYMm * PX_PER_MM
    const left = (width - (l.cols * w + (l.cols - 1) * gx)) / 2 + dx
    const top = (height - (l.rows * h + (l.rows - 1) * gy)) / 2 + dy
    const out: Cell[] = []
    for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) out.push({ x: left + c * (w + gx), y: top + r * (h + gy), width: w, height: h })
    return out
  }
  const margin = l.marginMm * PX_PER_MM
  const gap = l.gapMm * PX_PER_MM
  const w = (width - 2 * margin - gap * (l.cols - 1)) / l.cols
  const h = (height - 2 * margin - gap * (l.rows - 1)) / l.rows
  const out: Cell[] = []
  for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) out.push({ x: margin + dx + c * (w + gap), y: margin + dy + r * (h + gap), width: w, height: h })
  return out
}

/** Valide la grille : la fiche doit garder une taille lisible (au moins 10 mm de large et de haut). */
export function layoutProblem(l: SheetLayout): 'grid' | 'room' | null {
  if (![l.cols, l.rows, l.marginMm, l.gapMm].every(Number.isFinite) || l.cols < 1 || l.rows < 1 || l.cols > MAX_GRID.cols || l.rows > MAX_GRID.rows || l.marginMm < 0 || l.gapMm < 0 || !Number.isFinite(l.offsetXMm ?? 0) || !Number.isFinite(l.offsetYMm ?? 0)) return 'grid'
  if (l.fixed) {
    const { width, height } = sheetSize(l)
    const f = l.fixed
    const fits = l.cols * f.cellWMm + (l.cols - 1) * f.gapXMm <= width / PX_PER_MM + 0.01 && l.rows * f.cellHMm + (l.rows - 1) * f.gapYMm <= height / PX_PER_MM + 0.01
    return fits ? null : 'room'
  }
  const c = cells(l)[0]
  return c.width < 10 * PX_PER_MM || c.height < 10 * PX_PER_MM ? 'room' : null
}

/**
 * Grille proposée pour une fiche : le plus de fiches possible tout en gardant chacune d'au moins 55 mm de large et 25 mm de haut
 * (assez pour de l'écriture lisible) ; à égalité, la plus grande.
 */
export function suggestGrid(card: { width: number; height: number }, base: Pick<SheetLayout, 'paper' | 'landscape' | 'marginMm' | 'gapMm' | 'fillCell'>): { cols: number; rows: number } {
  let best = { cols: 1, rows: 1, count: 0, scale: 0 }
  for (let cols = 1; cols <= MAX_GRID.cols; cols++) {
    for (let rows = 1; rows <= MAX_GRID.rows; rows++) {
      const cell = cells({ ...base, cols, rows, cutMarks: false, mirrorBacks: false })[0]
      const fit = Math.min(cell.width / card.width, cell.height / card.height)
      const scale = base.fillCell ? fit : Math.min(1, fit)
      if (card.width * scale < 55 * PX_PER_MM || card.height * scale < 25 * PX_PER_MM) continue
      const count = cols * rows
      if (count > best.count || (count === best.count && scale > best.scale)) best = { cols, rows, count, scale }
    }
  }
  return best.count === 0 ? { cols: 1, rows: 1 } : { cols: best.cols, rows: best.rows }
}

const clone = (e: TrameElement): TrameElement => ({ ...e, id: nanoid(8), ...(e.shadow ? { shadow: { ...e.shadow } } : {}), ...(e.filters ? { filters: { ...e.filters } } : {}) })

/** Sommets d'un élément, une fois pivoté autour de son coin haut-gauche. */
function corners(e: Pick<TrameElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>): Array<[number, number]> {
  const a = ((e.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return ([[0, 0], [e.width, 0], [e.width, e.height], [0, e.height]] as Array<[number, number]>).map(([x, y]) => [e.x + x * cos - y * sin, e.y + x * sin + y * cos])
}

const EPS = 0.5

/**
 * Ce qui dépasse de la fiche déborderait sur ses voisines. Un rectangle ou une image **sans rotation** est simplement rogné au bord
 * de la fiche (cas d'un fond qui sort de la page) ; un élément entièrement dehors est retiré. Les autres (ellipse, forme, texte, élément
 * pivoté, image miroir) ne peuvent pas être rognés : ils sont comptés dans `overflow`.
 */
export function clipToCard(e: TrameElement, width: number, height: number): { element: TrameElement | null; overflow: boolean } {
  const pts = corners(e)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const inside = Math.min(...xs) >= -EPS && Math.min(...ys) >= -EPS && Math.max(...xs) <= width + EPS && Math.max(...ys) <= height + EPS
  if (inside) return { element: e, overflow: false }
  if (Math.max(...xs) <= 0 || Math.min(...xs) >= width || Math.max(...ys) <= 0 || Math.min(...ys) >= height) return { element: null, overflow: false }
  const plain = !e.rotation && !e.stroke && !e.shadow
  if (plain && e.type === 'rect' && !e.cornerRadius) {
    const x0 = Math.max(0, e.x), y0 = Math.max(0, e.y), x1 = Math.min(width, e.x + e.width), y1 = Math.min(height, e.y + e.height)
    return { element: { ...e, x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, overflow: false }
  }
  if (plain && e.type === 'image' && !e.flipX && !e.flipY && !e.mask && !e.straighten) {
    const x0 = Math.max(0, e.x), y0 = Math.max(0, e.y), x1 = Math.min(width, e.x + e.width), y1 = Math.min(height, e.y + e.height)
    const c = e.crop ?? { x: 0, y: 0, width: 1, height: 1 }
    const fx0 = (x0 - e.x) / e.width, fx1 = (x1 - e.x) / e.width, fy0 = (y0 - e.y) / e.height, fy1 = (y1 - e.y) / e.height
    const crop = { x: c.x + fx0 * c.width, y: c.y + fy0 * c.height, width: (fx1 - fx0) * c.width, height: (fy1 - fy0) * c.height }
    if (crop.width < 0.05 || crop.height < 0.05) return { element: null, overflow: false }
    return { element: { ...e, x: x0, y: y0, width: x1 - x0, height: y1 - y0, crop }, overflow: false }
  }
  return { element: e, overflow: true }
}

/** Élément réduit (ou agrandi) d'un facteur `s` et placé en (ox, oy) : toutes les mesures en pixels suivent. */
function place(e: TrameElement, s: number, ox: number, oy: number): TrameElement {
  const out: TrameElement = { ...e, x: ox + e.x * s, y: oy + e.y * s, width: e.width * s, height: e.height * s }
  if (e.fontSize !== undefined) out.fontSize = e.fontSize * s
  if (e.strokeWidth !== undefined) out.strokeWidth = e.strokeWidth * s
  if (e.cornerRadius !== undefined) out.cornerRadius = e.cornerRadius * s
  if (e.letterSpacing !== undefined) out.letterSpacing = e.letterSpacing * s
  if (e.shadow) out.shadow = { ...e.shadow, blur: e.shadow.blur * s, offsetX: e.shadow.offsetX * s, offsetY: e.shadow.offsetY * s }
  if (e.filters?.blur) out.filters = { ...e.filters, blur: e.filters.blur * s }
  return out
}

const band = (x: number, y: number, width: number, height: number, fill: string): TrameElement => ({ id: nanoid(8), type: 'rect', x, y, width, height, rotation: 0, opacity: 1, fill })

export interface SheetsResult {
  doc: TrameDocument
  /** éléments qui dépassent de leur fiche sans pouvoir être rognés (ils empiètent sur les fiches voisines) */
  overflow: number
}

/**
 * Document de planches à partir d'un document fusionné (`mergeDocument` : pour chaque ligne, les pages du modèle à la suite) : une fiche
 * par case, la fiche à sa taille réelle (réduite si elle ne tient pas) ou, au choix, ajustée à sa case, centrée, les planches dans l'ordre des lignes. Un modèle de plusieurs pages (recto,
 * verso) donne, pour chaque groupe de lignes, une planche par page du modèle : on imprime en recto-verso.
 */
export function sheetsFromMerged(merged: TrameDocument, perCard: number, layout: SheetLayout): SheetsResult {
  const grid = cells(layout)
  const size = sheetSize(layout)
  const perSheet = grid.length
  const cards = Math.floor(merged.pages.length / perCard)
  const pages: TramePage[] = []
  let overflow = 0
  for (let first = 0; first < cards; first += perSheet) {
    const count = Math.min(perSheet, cards - first)
    for (let side = 0; side < perCard; side++) {
      const elements: TrameElement[] = []
      const cut: TrameElement[] = []
      for (let k = 0; k < count; k++) {
        const page = merged.pages[(first + k) * perCard + side]
        let slot = k
        if (layout.mirrorBacks && side % 2 === 1) {
          const row = Math.floor(k / layout.cols)
          const col = k % layout.cols
          // portrait : le feuillet se retourne autour d'un axe vertical (colonnes inversées) ; paysage : horizontal (lignes inversées)
          slot = layout.landscape ? (layout.rows - 1 - row) * layout.cols + col : row * layout.cols + (layout.cols - 1 - col)
        }
        const cell = grid[slot]
        const fit = Math.min(cell.width / merged.width, cell.height / merged.height)
        const s = layout.fillCell ? fit : Math.min(1, fit)
        const w = merged.width * s
        const h = merged.height * s
        const ox = cell.x + (cell.width - w) / 2
        const oy = cell.y + (cell.height - h) / 2
        elements.push(band(ox, oy, w, h, page.background))
        for (const e of page.elements) {
          if (e.hidden) continue
          const clipped = clipToCard(e, merged.width, merged.height)
          if (clipped.overflow) overflow++
          if (clipped.element) elements.push(place(clone(clipped.element), s, ox, oy))
        }
        if (layout.cutMarks) {
          const t = 1
          for (const [x, y, bw, bh] of [[ox - t, oy - t, w + 2 * t, t], [ox - t, oy + h, w + 2 * t, t], [ox - t, oy, t, h], [ox + w, oy, t, h]]) cut.push(band(x, y, bw, bh, '#9aa0aa'))
        }
      }
      pages.push({ id: nanoid(8), background: '#ffffff', elements: [...elements, ...cut] })
    }
  }
  const { mailMerge: _mm, ...rest } = merged
  void _mm
  return { doc: { ...rest, width: size.width, height: size.height, pages }, overflow }
}
