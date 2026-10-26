/** Textes que l'export PDF n'a pas pu écrire en vrai texte (ils sont exportés en image) et message à l'utilisateur. */

export interface PdfFallback {
  /** numéro de page, à partir de 1 */
  page: number
  /** début du texte concerné, pour que l'utilisateur le reconnaisse */
  text: string
  reason: 'unknown-font' | 'missing-variant' | 'missing-glyph' | 'font-unreadable'
  /** `unknown-font` / `font-unreadable` : nom de la police ; `missing-variant` : « Famille » + style ; `missing-glyph` : les caractères */
  family: string
  variantLabel?: string
  /** `missing-glyph` : caractères absents de la police (sans doublon) */
  chars?: string
}

const MAX_LISTED = 6
const MAX_SNIPPET = 36

const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET - 1)}…` : flat
}

/** Explication d'une cause, avec ce qu'il faut faire. */
export function explain(f: Pick<PdfFallback, 'reason' | 'family' | 'variantLabel' | 'chars'>): string {
  switch (f.reason) {
    case 'unknown-font':
      return `la police « ${f.family} » n'est pas embarquée : choisissez une police du menu « Police »`
    case 'missing-variant':
      return `« ${f.family} » n'existe pas en ${f.variantLabel} : retirez ce style ou choisissez une autre police`
    case 'missing-glyph':
      return `caractère(s) absent(s) de la police : ${[...(f.chars ?? '')].join(' ') || 'inconnu'} (seuls les caractères latins sont embarqués : remplacez-les pour obtenir du texte sélectionnable)`
    case 'font-unreadable':
      return `la police « ${f.family} » n'a pas pu être lue`
  }
}

/** Message de la boîte de dialogue ; null s'il n'y a rien à signaler. */
export function describeFallbacks(list: PdfFallback[], pageCount: number): { message: string; detail: string } | null {
  if (list.length === 0) return null
  const n = list.length
  const lines = list.slice(0, MAX_LISTED).map((f) => {
    const where = pageCount > 1 ? `Page ${f.page} · ` : ''
    return `• ${where}« ${snippet(f.text)} » : ${explain(f)}`
  })
  if (n > MAX_LISTED) lines.push(`… et ${n - MAX_LISTED} autre${n - MAX_LISTED > 1 ? 's' : ''}.`)
  return {
    message: `PDF enregistré — ${n} texte${n > 1 ? 's' : ''} exporté${n > 1 ? 's' : ''} sous forme d'image`,
    detail:
      `${n > 1 ? 'Ils s\'affichent' : 'Il s\'affiche'} correctement, mais ${n > 1 ? 'ne sont pas sélectionnables ni copiables' : 'n\'est pas sélectionnable ni copiable'} dans le PDF.\n\n` +
      lines.join('\n')
  }
}
