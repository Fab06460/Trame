import { suggestedSeconds } from '@/pageDuration'
import { autoSeconds } from '@/voiceOver'
import type { TrameDocument, TramePage } from '@/types'

/** Réglage « Lecture auto » : chaque page dure le temps réglé dans ses propriétés (valeur négative pour ne pas se confondre avec un délai fixe en secondes). */
export const AUTO_PAGES = -1

/** Les délais fixes proposés par le menu, puis « Selon les pages ». 0 = pas de lecture automatique. */
export const AUTO_CHOICES = [0, 3, 5, 10, 15, AUTO_PAGES]

/**
 * Temps passé sur une page en lecture automatique. Délai fixe : celui du menu. « Selon les pages » : la durée de la page, ou à défaut
 * une estimation d'après son texte (la même que le bouton « Selon le texte »). Dans les deux cas, prolongé jusqu'à la fin de la voix off.
 */
export function pageAutoSeconds(doc: Pick<TrameDocument, 'voices'>, page: Pick<TramePage, 'voice' | 'seconds' | 'elements'>, auto: number): number {
  const base = auto === AUTO_PAGES ? (page.seconds ?? suggestedSeconds(page)) : auto
  return autoSeconds(doc, page, base)
}
