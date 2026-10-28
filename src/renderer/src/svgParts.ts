import { linearGradientLine, radialGradientCircle } from '@/gradient'
import { dashPattern, hasStroke } from '@/strokeStyle'
import type { Gradient, TrameElement } from '@/types'

/** Échappement XML d'une valeur d'attribut ou d'un texte. */
export const escXml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string)

/** Nombre court pour un attribut SVG (pas de « 1e-7 », au plus 3 décimales). */
export const n = (v: number): string => String(Math.round(v * 1000) / 1000)

/** Attributs de police d'un élément texte : graisse et style déduits du `fontStyle` de Konva (« bold », « italic », « bold italic »). */
export function fontAttrs(el: Pick<TrameElement, 'fontFamily' | 'fontSize' | 'fontStyle'>): string {
  const style = el.fontStyle ?? ''
  const weight = style.includes('bold') ? ' font-weight="700"' : ''
  const slant = style.includes('italic') ? ' font-style="italic"' : ''
  return `font-family="${escXml(el.fontFamily ?? 'sans-serif')}" font-size="${n(el.fontSize ?? 12)}"${weight}${slant}`
}

/** Dégradé SVG équivalent à celui de l'éditeur (mêmes points de départ et d'arrivée, en unités de l'élément). */
export function gradientDef(id: string, g: Gradient, w: number, h: number): string {
  const stops = `<stop offset="0" stop-color="${escXml(g.from)}"/><stop offset="1" stop-color="${escXml(g.to)}"/>`
  if (g.type === 'radial') {
    const c = radialGradientCircle(w, h)
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(c.cx)}" cy="${n(c.cy)}" r="${n(c.r)}">${stops}</radialGradient>`
  }
  const l = linearGradientLine(w, h, g.angle)
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(l.x0)}" y1="${n(l.y0)}" x2="${n(l.x1)}" y2="${n(l.y1)}">${stops}</linearGradient>`
}

/** Ombre portée : le flou de l'éditeur est le rayon CSS, donc σ = flou / 2 (même convention que le PDF et les miniatures). */
export function shadowFilterDef(id: string, el: Pick<TrameElement, 'shadow' | 'width' | 'height'>): string {
  const s = el.shadow!
  const m = s.blur * 1.5 + Math.max(Math.abs(s.offsetX), Math.abs(s.offsetY)) + 2
  return (
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="${n(-m)}" y="${n(-m)}" width="${n(el.width + 2 * m)}" height="${n(el.height + 2 * m)}">` +
    `<feDropShadow dx="${n(s.offsetX)}" dy="${n(s.offsetY)}" stdDeviation="${n(s.blur / 2)}" flood-color="${escXml(s.color)}" flood-opacity="${n(s.opacity)}"/></filter>`
  )
}

/** Attributs de contour d'un élément (vide s'il n'y en a pas). */
export function strokeAttrs(el: Pick<TrameElement, 'stroke' | 'strokeWidth' | 'strokeDashed'>): string {
  if (!hasStroke(el)) return ''
  const w = el.strokeWidth as number
  return ` stroke="${escXml(el.stroke as string)}" stroke-width="${n(w)}"${el.strokeDashed ? ` stroke-dasharray="${dashPattern(w).map(n).join(' ')}"` : ''}`
}
