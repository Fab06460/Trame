/** Calculs purs de l'export PDF vectoriel (sans pdf-lib ni navigateur : testables directement). */
import type { TrameElement } from '@/types'

/** Points PDF par pixel de design (le design est à 96 dpi, le PDF à 72). */
export const PT_PER_PX = 0.75

export type Matrix = [number, number, number, number, number, number]

/**
 * Matrice à appliquer (`cm`) pour dessiner un élément dans son repère local :
 * origine = coin haut-gauche de l'élément, unités = pixels de design, axe y vers le HAUT (l'élément occupe donc
 * y ∈ [-hauteur, 0]), rotation en degrés dans le sens horaire autour de ce coin, comme Konva.
 * `pageHeightPt` est la hauteur de la page PDF en points (l'axe y du PDF part du bas).
 */
export function elementMatrix(el: Pick<TrameElement, 'x' | 'y' | 'rotation'>, pageHeightPt: number, k = PT_PER_PX): Matrix {
  const r = (el.rotation * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [k * cos, -k * sin, k * sin, k * cos, k * el.x, pageHeightPt - k * el.y]
}

const KAPPA = 0.5522847498 // approximation d'un quart de cercle par une courbe de Bézier cubique

const n = (v: number): string => Number(v.toFixed(4)).toString()

/** Rectangle à coins arrondis en chemin SVG (axe y vers le bas, comme Konva : rayon borné à la moitié du plus petit côté). */
export function roundedRectPath(w: number, h: number, radius = 0): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r === 0) return `M0 0 L${n(w)} 0 L${n(w)} ${n(h)} L0 ${n(h)} Z`
  const c = r * KAPPA
  return [
    `M${n(r)} 0`,
    `L${n(w - r)} 0`,
    `C${n(w - r + c)} 0 ${n(w)} ${n(r - c)} ${n(w)} ${n(r)}`,
    `L${n(w)} ${n(h - r)}`,
    `C${n(w)} ${n(h - r + c)} ${n(w - r + c)} ${n(h)} ${n(w - r)} ${n(h)}`,
    `L${n(r)} ${n(h)}`,
    `C${n(r - c)} ${n(h)} 0 ${n(h - r + c)} 0 ${n(h - r)}`,
    `L0 ${n(r)}`,
    `C0 ${n(r - c)} ${n(r - c)} 0 ${n(r)} 0`,
    'Z'
  ].join(' ')
}

/** Ellipse inscrite dans la boîte w × h, en chemin SVG. */
export function ellipsePath(w: number, h: number): string {
  const rx = w / 2
  const ry = h / 2
  const cx = rx * KAPPA
  const cy = ry * KAPPA
  return [
    `M0 ${n(ry)}`,
    `C0 ${n(ry - cy)} ${n(rx - cx)} 0 ${n(rx)} 0`,
    `C${n(rx + cx)} 0 ${n(w)} ${n(ry - cy)} ${n(w)} ${n(ry)}`,
    `C${n(w)} ${n(ry + cy)} ${n(rx + cx)} ${n(h)} ${n(rx)} ${n(h)}`,
    `C${n(rx - cx)} ${n(h)} 0 ${n(ry + cy)} 0 ${n(ry)}`,
    'Z'
  ].join(' ')
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Couleur CSS usuelle (#rgb, #rrggbb, rgb(r,g,b)) en composantes 0–1 ; noir si illisible. */
export function parseColor(input: string | undefined): Rgb {
  const s = (input ?? '').trim().toLowerCase()
  let m = /^#([0-9a-f]{3})$/.exec(s)
  if (m) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16) / 255)
    return { r, g, b }
  }
  m = /^#([0-9a-f]{6})/.exec(s)
  if (m) {
    const v = parseInt(m[1], 16)
    return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 }
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s)
  if (rgb) return { r: Math.min(255, +rgb[1]) / 255, g: Math.min(255, +rgb[2]) / 255, b: Math.min(255, +rgb[3]) / 255 }
  return { r: 0, g: 0, b: 0 }
}

/** Décalage horizontal d'une ligne de texte dans sa boîte, comme Konva (sans marge intérieure). */
export function lineOffsetX(align: TrameElement['align'], boxWidth: number, lineWidth: number): number {
  if (align === 'right') return boxWidth - lineWidth
  if (align === 'center') return (boxWidth - lineWidth) / 2
  return 0
}

/**
 * Position de la ligne de base de la ligne `index`, depuis le haut de la boîte, comme Konva 10
 * (texte « alphabetic » : centre de la ligne décalé de (ascent − descent) / 2, lignes espacées de lineHeight × taille).
 */
export function baselineY(index: number, fontSize: number, lineHeight: number, ascent: number, descent: number): number {
  const lineHeightPx = lineHeight * fontSize
  return (ascent - descent) / 2 + lineHeightPx / 2 + index * lineHeightPx
}

/**
 * Correction de crénage pour l'opérateur PDF `TJ` : le PDF avance de la largeur nominale du glyphe, alors que la
 * mise en page réelle (crénage OpenType) avance de `placedAdvance`. Les deux sont en unités de la police.
 * `TJ` soustrait ce nombre (en millièmes d'em) : la correction vaut donc −(placé − nominal) × 1000 / unitsPerEm.
 */
export function tjAdjustment(placedAdvance: number, nominalAdvance: number, unitsPerEm: number): number {
  const v = -((placedAdvance - nominalAdvance) * 1000) / unitsPerEm
  return Math.abs(v) < 1e-6 ? 0 : v
}

export interface DataUrlParts {
  mime: string
  bytes: Uint8Array
}

/** Décode une data URL base64 ; null si ce n'en est pas une. */
export function decodeDataUrl(url: string | undefined): DataUrlParts | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url ?? '')
  if (!m || !m[2]) return null
  const bin = atob(m[3])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { mime: m[1], bytes }
}
