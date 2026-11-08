import { formatElapsed } from '@/speakerFormat'
import type { TrameDocument, TramePage } from '@/types'

/**
 * Chronométrage d'une présentation. Le temps prévu d'une page est sa durée (`TramePage.seconds`, la même que pour la vidéo exportée) ;
 * une page sans durée n'a pas de temps prévu (0). Le temps passé est cumulé par page : `spent[i]` = millisecondes passées sur la page i
 * avant la visite en cours, `enteredAt` = instant d'arrivée sur la page affichée.
 */
export const plannedMs = (page: Pick<TramePage, 'seconds'>): number => (page.seconds === undefined ? 0 : Math.round(page.seconds * 1000))

/** Temps prévu pour tout le document. */
export const plannedTotal = (doc: Pick<TrameDocument, 'pages'>): number => doc.pages.reduce((sum, p) => sum + plannedMs(p), 0)

/** Temps prévu pour les pages qui précèdent la page `index`. */
export const plannedBefore = (doc: Pick<TrameDocument, 'pages'>, index: number): number => doc.pages.slice(0, index).reduce((sum, p) => sum + plannedMs(p), 0)

/** Temps passé sur la page `index`, visite en cours comprise. */
export const pageSpent = (spent: readonly number[], enteredAt: number, index: number, now: number): number => (spent[index] ?? 0) + Math.max(0, now - enteredAt)

/**
 * Avance ou retard à l'arrivée sur la page `index` : le temps passé sur les autres pages moins le temps prévu pour celles qui la précèdent.
 * Positif = en retard, négatif = en avance. Sans aucun temps prévu, 0.
 */
export function drift(doc: Pick<TrameDocument, 'pages'>, spent: readonly number[], index: number): number {
  if (plannedTotal(doc) === 0) return 0
  const elsewhere = spent.reduce((sum, ms, i) => (i === index ? sum : sum + ms), 0)
  return elsewhere - plannedBefore(doc, index)
}

/** « +0:42 » (en retard) ou « −1:10 » (en avance) ; en dessous d'une seconde, « 0:00 ». */
export function formatDrift(ms: number): string {
  if (Math.abs(ms) < 1000) return formatElapsed(0)
  return `${ms > 0 ? '+' : '−'}${formatElapsed(Math.abs(ms))}`
}

export interface RecapRow {
  index: number
  pageId: string
  spent: number
  planned: number
  /** temps passé moins temps prévu ; absent si la page n'a pas de temps prévu */
  diff: number | null
}

export interface Recap {
  rows: RecapRow[]
  spent: number
  planned: number
}

/** Récapitulatif de fin de présentation : une ligne par page, et les totaux. */
export function recap(doc: Pick<TrameDocument, 'pages'>, spent: readonly number[]): Recap {
  const rows = doc.pages.map((page, index): RecapRow => {
    const planned = plannedMs(page)
    const ms = spent[index] ?? 0
    return { index, pageId: page.id, spent: ms, planned, diff: planned > 0 ? ms - planned : null }
  })
  return { rows, spent: rows.reduce((sum, r) => sum + r.spent, 0), planned: plannedTotal(doc) }
}

/** Limites d'une durée de page (secondes), les mêmes que dans les propriétés de la page. */
const MIN_SECONDS = 1
const MAX_SECONDS = 120

/** Temps passé → durée de page, en secondes entières entre 1 et 120 ; null pour une page à peine regardée (moins d'une seconde). */
export function secondsFromSpent(ms: number): number | null {
  if (!(ms >= 1000)) return null
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(ms / 1000)))
}
