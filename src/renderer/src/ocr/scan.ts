import type { OcrParagraph } from './engine'

/** Un paragraphe reconnu sur une page scannée, prêt à devenir un texte modifiable (coordonnées en pixels de l'image lue). */
export interface ScanBlock {
  /** lignes du paragraphe, telles que lues (un retour à la ligne entre chacune) */
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** ligne de base de la première ligne */
  baseline: number
  fontSize: number
  lineHeight: number
  confidence: number
}

/** En dessous, un « paragraphe » est surtout du bruit (tache, trait, photo) : il reste dans l'image. */
export const MIN_CONFIDENCE = 45
/** Corps de texte plausible, en pixels de l'image lue (avant échelle) : hors de cette plage, on laisse l'image telle quelle. */
const MIN_HEIGHT = 6
const MAX_FONT_PX = 400

const median = (values: number[]): number => {
  const v = [...values].sort((a, b) => a - b)
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0
}

const tidy = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim()

/**
 * Les paragraphes reconnus qui valent un texte modifiable : assez sûrs, avec des lettres, d'une taille plausible. Le corps du texte se
 * déduit de l'écart entre les lignes de base (plusieurs lignes) ou de la hauteur de la ligne (une seule).
 */
export function scanBlocks(paragraphs: readonly OcrParagraph[]): ScanBlock[] {
  const out: ScanBlock[] = []
  for (const p of paragraphs) {
    const lines = p.lines.map((l) => ({ ...l, text: tidy(l.text) })).filter((l) => l.text && l.y1 > l.y0)
    const text = lines.map((l) => l.text).join('\n')
    if (!lines.length || p.confidence < MIN_CONFIDENCE || !/[\p{L}\p{N}]/u.test(text)) continue
    // une ligne de base absurde (hors de la ligne) : on prend le bas du cadre
    const bases = lines.map((l) => (l.base >= l.y0 && l.base <= l.y1 + (l.y1 - l.y0) * 0.5 ? l.base : l.y1))
    const pitch = lines.length > 1 ? median(bases.slice(1).map((b, i) => b - bases[i])) : 0
    const lineBox = median(lines.map((l) => l.y1 - l.y0))
    if (lineBox < MIN_HEIGHT) continue
    const fontSize = Math.min(MAX_FONT_PX, Math.max(MIN_HEIGHT, pitch > 0 ? pitch / 1.2 : lineBox / 1.05))
    const lineHeight = pitch > 0 ? Math.round(Math.min(1.8, Math.max(1, pitch / fontSize)) * 20) / 20 : 1.2
    out.push({ text, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, baseline: bases[0], fontSize: Math.round(fontSize * 2) / 2, lineHeight, confidence: p.confidence })
  }
  return out
}

/**
 * La couleur du papier et celle de l'encre dans une zone (pixels RGBA, `w` × `h`) : le papier est la couleur médiane de la zone (le texte
 * n'y est qu'une minorité de pixels), l'encre la moyenne des pixels les plus éloignés du papier.
 */
export function paperAndInk(data: Uint8ClampedArray, w: number, h: number): { paper: [number, number, number]; ink: [number, number, number] } {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)))
  const px: Array<[number, number, number]> = []
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) px.push([data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2]])
  if (!px.length) return { paper: [255, 255, 255], ink: [0, 0, 0] }
  const paper: [number, number, number] = [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))].map(Math.round) as [number, number, number]
  const far = px
    .map((p) => ({ p, d: Math.hypot(p[0] - paper[0], p[1] - paper[1], p[2] - paper[2]) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, Math.max(1, Math.ceil(px.length / 12)))
  const ink = [0, 1, 2].map((i) => Math.round(far.reduce((s, f) => s + f.p[i], 0) / far.length)) as [number, number, number]
  return { paper, ink }
}

export const toHex = (c: readonly number[]): string => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
