import { cssGradient, linearGradientLine, radialGradientCircle, sanitizeGradient } from '@/gradient'
import type { Gradient, TramePage } from '@/types'

type WithBackground = Pick<TramePage, 'background' | 'backgroundGradient'>

/** Les couleurs possibles derrière le contenu : celles du dégradé s'il y en a un, sinon la couleur unie. */
export const backgroundColors = (page: WithBackground): string[] => (page.backgroundGradient ? [page.backgroundGradient.from, page.backgroundGradient.to] : [page.background])

/** Valeur CSS du fond de la page (miniatures, aperçus). */
export const cssBackground = (page: WithBackground): string => (page.backgroundGradient ? cssGradient(page.backgroundGradient) : page.background)

/** Mêmes couleurs, même angle : sans dégradé, l'objet est celui de la page elle-même (même identité, donc pas de changement inutile). */
export function sameBackground(a: WithBackground, b: WithBackground): boolean {
  const g = a.backgroundGradient
  const h = b.backgroundGradient
  if (!g || !h) return !g && !h && a.background === b.background
  return g.type === h.type && g.from === h.from && g.to === h.to && (g.type === 'radial' || g.angle === h.angle)
}

/**
 * Pose un dégradé en fond de page. `background` reste la première couleur : tout ce qui ne connaît que la couleur unie (contraste, modèles,
 * anciennes versions de Trame) garde ainsi un fond plausible. `undefined` retire le dégradé et garde cette couleur.
 */
export function withBackgroundGradient(page: TramePage, gradient: Gradient | undefined): TramePage {
  const { backgroundGradient: _old, ...rest } = page
  void _old
  return gradient ? { ...rest, background: gradient.from, backgroundGradient: gradient } : rest
}

/** Fond d'une page recopié sur une autre : couleur et dégradé, rien d'autre. */
export function withBackgroundOf(page: TramePage, source: WithBackground): TramePage {
  const { backgroundGradient: _old, ...rest } = page
  void _old
  return { ...rest, background: source.background, ...(source.backgroundGradient ? { backgroundGradient: { ...source.backgroundGradient } } : {}) }
}

/** Nettoyage à la lecture : un dégradé de fond incomplet est retiré (la page garde sa couleur), et `background` redevient sa première couleur. Modifie en place. */
export function sanitizePageGradient(page: object): void {
  const p = page as { background?: unknown; backgroundGradient?: unknown }
  if (p.backgroundGradient === undefined) return
  const holder: { gradient?: Gradient } = { gradient: p.backgroundGradient as Gradient }
  sanitizeGradient(holder)
  if (holder.gradient) {
    p.backgroundGradient = holder.gradient
    p.background = holder.gradient.from
  } else delete p.backgroundGradient
}

/** Le dégradé en image PNG (adresse de données), pour PowerPoint, dont le fond de diapositive n'accepte qu'une couleur ou une image. */
export function gradientPng(g: Gradient, width: number, height: number, longSide = 1600): string | null {
  const k = Math.min(1, longSide / Math.max(width, height))
  const w = Math.max(1, Math.round(width * k))
  const h = Math.max(1, Math.round(height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let fill: CanvasGradient
  if (g.type === 'radial') {
    const c = radialGradientCircle(w, h)
    fill = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, c.r)
  } else {
    const l = linearGradientLine(w, h, g.angle)
    fill = ctx.createLinearGradient(l.x0, l.y0, l.x1, l.y1)
  }
  fill.addColorStop(0, g.from)
  fill.addColorStop(1, g.to)
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, w, h)
  return canvas.toDataURL('image/png')
}
