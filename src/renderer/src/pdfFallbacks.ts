import { t } from '@/i18n'
/** Textes que l'export PDF n'a pas pu écrire en vrai texte (ils sont exportés en image) et message à l'utilisateur. */

export interface PdfFallback {
  /** numéro de page, à partir de 1 */
  page: number
  /** début du texte concerné, pour que l'utilisateur le reconnaisse */
  text: string
  reason: 'unknown-font' | 'missing-variant' | 'missing-glyph' | 'font-unreadable'
  /** `unknown-font` / `font-unreadable` : nom de la police ; `missing-variant` : « Famille » + style ; `missing-glyph` : les caractères */
  family: string
  /** `missing-variant` : le style que la famille ne possède pas */
  variantStyle?: 'bold' | 'italic' | 'bold italic'
  /** `missing-glyph` : caractères absents de la police (sans doublon) */
  chars?: string
}

const MAX_LISTED = 6
const MAX_SNIPPET = 36

const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET - 1)}…` : flat
}

/** Nom du style (gras, italique, gras italique) dans la langue courante. */
export const variantName = (style: PdfFallback['variantStyle']): string => t(style === 'bold italic' ? 'pdf.variant.boldItalic' : style === 'bold' ? 'pdf.variant.bold' : 'pdf.variant.italic')

/** Explication d'une cause, avec ce qu'il faut faire. */
export function explain(f: Pick<PdfFallback, 'reason' | 'family' | 'variantStyle' | 'chars'>): string {
  const family = f.family || t('pdf.family.unknown')
  switch (f.reason) {
    case 'unknown-font':
      return t('pdf.reason.unknownFont', { family })
    case 'missing-variant':
      return t('pdf.reason.missingVariant', { family, variant: variantName(f.variantStyle) })
    case 'missing-glyph':
      return t('pdf.reason.missingGlyph', { chars: [...(f.chars ?? '')].join(' ') || t('pdf.reason.unknownChars') })
    case 'font-unreadable':
      return t('pdf.reason.unreadable', { family })
  }
}

/** Message de la boîte de dialogue ; null s'il n'y a rien à signaler. */
export function describeFallbacks(list: PdfFallback[], pageCount: number): { message: string; detail: string } | null {
  if (list.length === 0) return null
  const n = list.length
  const lines = list.slice(0, MAX_LISTED).map((f) => {
    const where = pageCount > 1 ? t('pdf.fallback.page', { page: f.page }) : ''
    return t('pdf.fallback.line', { where, text: snippet(f.text), reason: explain(f) })
  })
  if (n > MAX_LISTED) lines.push(t('pdf.fallback.more', { count: n - MAX_LISTED }))
  return {
    message: t('pdf.fallback.title', { count: n }),
    detail: t('pdf.fallback.detail', { count: n }) + '\n\n' + lines.join('\n')
  }
}
