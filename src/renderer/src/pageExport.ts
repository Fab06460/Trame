/** Export de plusieurs pages en images : choix des pages, nom des fichiers, taille. Logique pure (le rendu est dans exportPages.ts). */

/** Plus grand côté d'une image exportée (pixels) : au-delà, la mémoire d'un canvas n'est plus sûre. */
export const MAX_EXPORT_SIDE = 8000

export type RangeResult = { ok: true; pages: number[] } | { ok: false; error: string }

/**
 * Pages choisies dans une saisie comme « 1-3, 5, 8-9 » (numéros à partir de 1, dans n'importe quel ordre, sans doublon) :
 * retourne les numéros triés, ou la raison du refus.
 */
export function parsePageRange(text: string, pageCount: number): RangeResult {
  const parts = text.split(/[,;\s]+/).filter(Boolean)
  if (parts.length === 0) return { ok: false, error: 'Indiquez au moins une page (ex. : 1-3, 5).' }
  const out = new Set<number>()
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return { ok: false, error: `« ${part} » n'est pas une page valide (ex. : 1-3, 5).` }
    const from = Number(m[1])
    const to = m[2] === undefined ? from : Number(m[2])
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) return { ok: false, error: `La page ${from > pageCount || from < 1 ? from : to} n'existe pas (le document compte ${pageCount} page${pageCount > 1 ? 's' : ''}).` }
    if (from > to) return { ok: false, error: `« ${part} » : la première page doit précéder la dernière.` }
    for (let p = from; p <= to; p++) out.add(p)
  }
  return { ok: true, pages: [...out].sort((a, b) => a - b) }
}

/** Nom du fichier d'une page : `<nom>-page-<n>.<ext>`, le numéro complété de zéros pour garder l'ordre alphabétique (01 … 12). */
export function pageFileName(base: string, pageNumber: number, pageCount: number, ext: 'png' | 'jpg' | 'svg'): string {
  return `${base}-page-${String(pageNumber).padStart(String(pageCount).length, '0')}.${ext}`
}

/** Échelle réellement appliquée : celle demandée, réduite si le plus grand côté dépasserait `MAX_EXPORT_SIDE`. */
export function effectiveScale(width: number, height: number, requested: number): number {
  const wanted = Math.max(0.1, requested)
  return Math.min(wanted, MAX_EXPORT_SIDE / Math.max(width, height))
}

/** Résumé d'une sélection de pages pour l'affichage (« 3 pages : 1, 2, 5 »). */
export function describePages(pages: number[]): string {
  return `${pages.length} page${pages.length > 1 ? 's' : ''}${pages.length <= 8 ? ` : ${pages.join(', ')}` : ''}`
}
