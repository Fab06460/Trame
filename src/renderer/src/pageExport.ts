import { t } from '@/i18n'
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
  if (parts.length === 0) return { ok: false, error: t('range.empty') }
  const out = new Set<number>()
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return { ok: false, error: t('range.invalid', { part }) }
    const from = Number(m[1])
    const to = m[2] === undefined ? from : Number(m[2])
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) return { ok: false, error: t('range.missing', { page: from > pageCount || from < 1 ? from : to, count: pageCount }) }
    if (from > to) return { ok: false, error: t('range.order', { part }) }
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
  return pages.length <= 8 ? t('pages.list', { count: pages.length, list: pages.join(', ') }) : t('pages.count', { count: pages.length })
}
