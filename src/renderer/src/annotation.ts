/** Un point d'un trait, en fraction de la page affichée (0 à 1 de gauche à droite et de haut en bas) : le tracé suit la page si la fenêtre change de taille. */
export type InkPoint = readonly [number, number]

export type InkTool = 'pen' | 'highlighter'

export interface Stroke {
  tool: InkTool
  color: string
  points: InkPoint[]
}

export const INK_COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff'] as const

/** Épaisseur du trait en fraction de la largeur de la page (le stylo reste fin, le surligneur est large et translucide). */
export const INK_WIDTH: Record<InkTool, number> = { pen: 0.0045, highlighter: 0.024 }
export const HIGHLIGHT_ALPHA = 0.38

/** Nombre maximal de traits gardés par page et de points par trait (une présentation longue ne doit pas faire grossir la mémoire sans limite). */
export const MAX_STROKES = 200
export const MAX_POINTS = 2000
/** Deux relevés plus proches que cela (en fraction de la largeur de la page) ne font qu'un. */
const MIN_STEP = 0.0015

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Rectangle occupé par la page dans la fenêtre (image entière, centrée, proportions gardées : `object-fit: contain`). */
export function pageRect(winW: number, winH: number, docW: number, docH: number): Rect {
  const k = Math.min(winW / docW, winH / docH)
  const w = docW * k
  const h = docH * k
  return { x: (winW - w) / 2, y: (winH - h) / 2, w, h }
}

export const toPage = (r: Rect, x: number, y: number): InkPoint => [(x - r.x) / r.w, (y - r.y) / r.h]

/** Ajoute un point à un trait (ignoré s'il est trop proche du précédent ou si le trait est plein). Ne modifie pas le trait reçu. */
export function extend(stroke: Stroke, p: InkPoint, aspect: number): Stroke {
  const last = stroke.points[stroke.points.length - 1]
  if (stroke.points.length >= MAX_POINTS) return stroke
  if (last && Math.hypot(p[0] - last[0], (p[1] - last[1]) / aspect) < MIN_STEP) return stroke
  return { ...stroke, points: [...stroke.points, p] }
}

/** Ajoute un trait fini à ceux d'une page ; les plus anciens partent au-delà du plafond. */
export const addStroke = (strokes: readonly Stroke[], s: Stroke): Stroke[] => [...strokes, s].slice(-MAX_STROKES)
