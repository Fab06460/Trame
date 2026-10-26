/**
 * Reconstruction du texte d'un PDF en éléments Trame : pure (aucun accès à pdf.js ni au DOM), donc testée à part.
 * Un PDF ne contient que des fragments de texte positionnés ; on les regroupe en lignes, puis en paragraphes.
 * Toutes les coordonnées sont en pixels de design, origine en haut à gauche.
 */
import { FONTS } from '@/fonts'

export interface PdfTextItem {
  text: string
  x: number
  /** ordonnée de la ligne de base */
  baseline: number
  width: number
  /** taille de police */
  size: number
  /** nom réel de la police du PDF (« ABCDEF+Inter-Bold ») */
  font: string
}

export interface Line {
  text: string
  x: number
  baseline: number
  width: number
  size: number
  font: string
}

export interface Paragraph {
  lines: Line[]
  align: 'left' | 'center' | 'right'
}


/** Fragments → lignes : même ligne de base (à 35 % de la taille près), dans l'ordre de lecture ; un grand vide sépare deux lignes (colonnes, tabulations). */
export function groupLines(items: PdfTextItem[]): Line[] {
  const sorted = items.filter((i) => i.text.length > 0 && i.size > 0).sort((a, b) => a.baseline - b.baseline || a.x - b.x)
  const lines: Array<{ parts: PdfTextItem[] }> = []
  for (const it of sorted) {
    let open: { parts: PdfTextItem[] } | undefined
    for (let i = lines.length - 1; i >= 0 && !open; i--) {
      const l = lines[i]
      const last = l.parts[l.parts.length - 1]
      const sameBaseline = Math.abs(last.baseline - it.baseline) <= 0.35 * Math.min(last.size, it.size)
      const gap = it.x - (last.x + last.width)
      if (sameBaseline && gap > -0.5 * it.size && gap < 3 * it.size) open = l
    }
    if (open) open.parts.push(it)
    else lines.push({ parts: [it] })
  }
  const out: Line[] = []
  for (const { parts } of lines) {
    parts.sort((a, b) => a.x - b.x)
    let text = ''
    for (const [i, p] of parts.entries()) {
      if (i > 0) {
        const gap = p.x - (parts[i - 1].x + parts[i - 1].width)
        if (gap > 0.2 * p.size && !/\s$/.test(text) && !/^\s/.test(p.text)) text += ' '
      }
      text += p.text
    }
    if (!text.trim()) continue
    const dominant = parts.reduce((a, b) => (b.text.length > a.text.length ? b : a))
    const last = parts[parts.length - 1]
    out.push({ text: text.replace(/\s+$/, ''), x: parts[0].x, baseline: dominant.baseline, width: last.x + last.width - parts[0].x, size: dominant.size, font: dominant.font })
  }
  return out.sort((a, b) => a.baseline - b.baseline || a.x - b.x)
}

const left = (l: Line): number => l.x
const centre = (l: Line): number => l.x + l.width / 2
const right = (l: Line): number => l.x + l.width

/** Alignement commun à deux lignes, ou null si elles ne s'alignent d'aucune façon. */
function sharedAlign(a: Line, b: Line): 'left' | 'center' | 'right' | null {
  const tol = 0.5 * Math.min(a.size, b.size)
  if (Math.abs(left(a) - left(b)) <= tol) return 'left'
  if (Math.abs(centre(a) - centre(b)) <= tol) return 'center'
  if (Math.abs(right(a) - right(b)) <= tol) return 'right'
  return null
}

/** Lignes → paragraphes : même police et même taille (à 10 % près), interligne raisonnable, alignement commun. */
export function groupParagraphs(lines: Line[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const line of lines) {
    let joined = false
    for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 20) && !joined; i--) {
      const p = paragraphs[i]
      const prev = p.lines[p.lines.length - 1]
      const pitch = line.baseline - prev.baseline
      if (pitch < 0.6 * line.size || pitch > 1.8 * line.size) continue
      if (Math.abs(prev.size - line.size) > 0.1 * prev.size || prev.font !== line.font) continue
      const align = p.lines.length === 1 ? sharedAlign(prev, line) : sharedAlign(p.lines[0], line) === p.align ? p.align : null
      if (!align) continue
      p.align = align
      p.lines.push(line)
      joined = true
    }
    if (!joined) paragraphs.push({ lines: [line], align: 'left' })
  }
  return paragraphs
}

/** Interligne moyen d'un paragraphe, en multiple de la taille de police (1 pour une seule ligne), borné comme dans l'éditeur. */
export function lineHeightOf(p: Paragraph): number {
  if (p.lines.length < 2) return 1
  const pitch = (p.lines[p.lines.length - 1].baseline - p.lines[0].baseline) / (p.lines.length - 1)
  return Math.min(4, Math.max(0.5, Math.round((pitch / p.lines[0].size) * 100) / 100))
}

export interface FontChoice {
  family: string
  fontStyle: string
  /** vrai si la police du PDF est l'une de nos polices embarquées (sinon : remplacement) */
  exact: boolean
}

const KNOWN: Array<[RegExp, string]> = [
  [/inter(?![a-z])/i, 'Inter'], [/montserrat/i, 'Montserrat'], [/poppins/i, 'Poppins'], [/oswald/i, 'Oswald'], [/bebas/i, 'Bebas Neue'],
  [/playfair/i, 'Playfair Display'], [/lora/i, 'Lora'], [/caveat/i, 'Caveat'], [/pacifico/i, 'Pacifico'], [/jetbrains/i, 'JetBrains Mono']
]

/** Police Trame la plus proche d'une police de PDF : la même si on l'embarque, sinon une police de même nature (mono, serif, manuscrite, sans). */
export function matchFont(pdfFont: string): FontChoice {
  const name = pdfFont.replace(/^[A-Z]{6}\+/, '')
  const exactName = KNOWN.find(([re]) => re.test(name))?.[1]
  let fontName = exactName
  if (!fontName) {
    if (/mono|courier|consolas|menlo|typewriter/i.test(name)) fontName = 'JetBrains Mono'
    else if (/script|hand|brush|marker/i.test(name)) fontName = 'Caveat'
    else if (/sans|arial|helvet|calibri|verdana|tahoma|segoe|roboto|open ?sans|gothic/i.test(name)) fontName = 'Inter'
    else if (/serif|times|georgia|garamond|palatino|minion|cambria|book|roman|didot|bodoni/i.test(name)) fontName = 'Lora'
    else fontName = 'Inter'
  }
  const def = FONTS.find((f) => f.name === fontName) ?? FONTS[0]
  const bold = /bold|black|heavy|semibold|demi|extrabold/i.test(name) && def.variants.some((v) => v.startsWith('700'))
  const italic = /italic|oblique|-it\b|ital\b/i.test(name) && def.variants.some((v) => v.endsWith('italic'))
  const fontStyle = [italic ? 'italic' : '', bold ? 'bold' : ''].join(' ').trim() || 'normal'
  return { family: def.family, fontStyle, exact: !!exactName }
}

