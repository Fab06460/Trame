/**
 * Un texte peut-il être écrit en vrai texte dans le PDF ? Une seule définition, partagée par l'export (qui en tire le repli en
 * image) et par l'éditeur (qui prévient en direct) : ils ne peuvent donc pas se contredire.
 */
import { FONTS } from '@/fonts'
import type { FontkitFont } from '@/fontkit'
import { diagnoseFont, type FontChoice } from '@/pdfFonts'
import type { PdfFallback } from '@/pdfFallbacks'
import { displayText } from '@/textStyle'
import type { TrameElement } from '@/types'

/** Pourquoi un texte ne pourra pas être sélectionnable dans le PDF (voir `PdfFallback`). */
export type TextIssue = Pick<PdfFallback, 'reason' | 'family' | 'variantLabel' | 'chars'>

/** Caractères de `text` absents d'une police (sans doublon, hors retours à la ligne). */
export function missingChars(text: string, has: (codePoint: number) => boolean): string {
  return [...new Set([...text].filter((c) => c !== '\n' && !has(c.codePointAt(0)!)))].join('')
}

/**
 * Cause pour laquelle le texte de `el` retomberait en image dans le PDF, ou null s'il sera du vrai texte.
 * `getLayout` fournit la police (mise en page fontkit) d'une variante ; null si elle est illisible.
 */
export async function checkText(el: TrameElement, getLayout: (choice: FontChoice) => Promise<FontkitFont | null>): Promise<TextIssue | null> {
  const text = displayText(el) // les majuscules demandent d'autres glyphes que le texte saisi
  if (!text.trim()) return null // rien à dessiner
  const d = diagnoseFont(el.fontFamily, el.fontStyle)
  if (!d.ok) return { reason: d.reason, family: d.family, variantLabel: d.variantLabel }
  const layout = await getLayout(d.choice)
  if (!layout) return { reason: 'font-unreadable', family: d.choice.def.name }
  const chars = missingChars(text, (cp) => layout.hasGlyphForCodePoint(cp))
  return chars ? { reason: 'missing-glyph', family: d.choice.def.name, chars } : null
}

const styleOf = (italic: boolean, bold: boolean): string => [italic ? 'italic' : '', bold ? 'bold' : ''].join(' ').trim() || 'normal'

/**
 * Correction en un clic pour une cause donnée, ou null s'il n'y en a pas d'automatique :
 * police inconnue → la police par défaut (même graisse/style) ; variante absente → la plus proche que la famille possède.
 * Un caractère absent ne se corrige pas automatiquement (il faut le remplacer).
 */
export function suggestFix(el: TrameElement, issue: TextIssue): { patch: Partial<TrameElement>; label: string } | null {
  if (issue.reason === 'unknown-font') {
    const target = FONTS[0]
    return { patch: { fontFamily: target.family }, label: `Utiliser ${target.name}` }
  }
  if (issue.reason === 'missing-variant') {
    const def = FONTS.find((f) => f.name === issue.family)
    if (!def) return null
    const bold = (el.fontStyle ?? '').includes('bold')
    const italic = (el.fontStyle ?? '').includes('italic')
    // du plus fidèle au plus éloigné : on garde ce que la famille sait faire
    const wanted: Array<[boolean, boolean]> = [[italic, bold], [false, bold], [italic, false], [false, false]]
    const found = wanted.find(([i, b]) => def.variants.includes(`${b ? '700' : '400'}${i ? '-italic' : ''}`))
    if (!found) return null
    const fontStyle = styleOf(found[0], found[1])
    return { patch: { fontStyle }, label: fontStyle === 'normal' ? 'Retirer gras et italique' : `Utiliser le style ${fontStyle === 'italic' ? 'italique' : fontStyle === 'bold' ? 'gras' : 'gras italique'}` }
  }
  return null
}
