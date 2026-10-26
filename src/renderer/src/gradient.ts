import type { Gradient } from '@/types'

export const DEFAULT_ANGLE = 135

/**
 * Ligne d'un dégradé linéaire dans une boîte w × h (repère de l'élément, y vers le bas), comme CSS `linear-gradient(<angle>deg, …)` :
 * la ligne passe par le centre, dans la direction de l'angle, et sa longueur est telle que les coins extrêmes tombent exactement
 * sur la première et la dernière couleur. Une seule définition pour l'éditeur, l'image, le PDF et les miniatures.
 */
export function linearGradientLine(w: number, h: number, angleDeg: number): { x0: number; y0: number; x1: number; y1: number } {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  const cx = w / 2
  const cy = h / 2
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half }
}

/** Dégradé radial : cercle centré, de rayon « coin le plus éloigné » (comme CSS `radial-gradient(circle farthest-corner)`). */
export function radialGradientCircle(w: number, h: number): { cx: number; cy: number; r: number } {
  return { cx: w / 2, cy: h / 2, r: Math.hypot(w, h) / 2 }
}

const HEX = /^#([0-9a-f]{6})$/i

/** Éclaircit une couleur `#rrggbb` en la mélangeant avec du blanc (t = 0 : inchangée, 1 : blanc). Autre format : inchangé. */
export function lighten(color: string, t: number): string {
  const m = HEX.exec(color.trim())
  if (!m) return color
  const v = parseInt(m[1], 16)
  const mix = (c: number): number => Math.round(c + (255 - c) * t)
  const out = (mix((v >> 16) & 255) << 16) | (mix((v >> 8) & 255) << 8) | mix(v & 255)
  return `#${out.toString(16).padStart(6, '0')}`
}

/** Dégradé proposé quand on active l'option : de la couleur actuelle vers une version plus claire, en diagonale. */
export const defaultGradient = (fill: string): Gradient => ({ type: 'linear', from: fill, to: lighten(fill, 0.55), angle: DEFAULT_ANGLE })

/** Propriétés Konva d'un dégradé (rectangle, ellipse). Vide s'il n'y a pas de dégradé. */
export function konvaGradientProps(g: Gradient | undefined, w: number, h: number): Record<string, unknown> {
  if (!g) return {}
  const stops = [0, g.from, 1, g.to]
  if (g.type === 'radial') {
    const { cx, cy, r } = radialGradientCircle(w, h)
    return {
      fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: { x: cx, y: cy },
      fillRadialGradientEndPoint: { x: cx, y: cy },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: r,
      fillRadialGradientColorStops: stops
    }
  }
  const l = linearGradientLine(w, h, g.angle)
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: l.x0, y: l.y0 },
    fillLinearGradientEndPoint: { x: l.x1, y: l.y1 },
    fillLinearGradientColorStops: stops
  }
}

/** Valeur CSS équivalente (miniatures). */
export const cssGradient = (g: Gradient): string =>
  g.type === 'radial' ? `radial-gradient(circle farthest-corner, ${g.from}, ${g.to})` : `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`

const isColor = (c: unknown): c is string => typeof c === 'string' && c.trim().length > 0

/** Nettoyage à la lecture : un dégradé incomplet est retiré (l'élément garde son `fill`). Modifie en place. */
export function sanitizeGradient(element: object): void {
  const e = element as Record<string, unknown>
  const g = e.gradient as Partial<Gradient> | undefined
  if (g === undefined) return
  const ok = !!g && typeof g === 'object' && (g.type === 'linear' || g.type === 'radial') && isColor(g.from) && isColor(g.to)
  if (!ok) {
    delete e.gradient
    return
  }
  const angle = typeof g.angle === 'number' && Number.isFinite(g.angle) ? ((g.angle % 360) + 360) % 360 : DEFAULT_ANGLE
  e.gradient = { type: g.type, from: g.from, to: g.to, angle }
}
