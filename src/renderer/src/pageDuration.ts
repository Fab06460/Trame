import { MAX_SECONDS, MIN_SECONDS } from '@/videoTimeline'
import type { TramePage } from '@/types'

/** Durée d'une page lue dans un fichier : un nombre de secondes entre le minimum et le maximum de l'export vidéo, au dixième près ; sinon ignorée. */
export const cleanPageSeconds = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= MIN_SECONDS && v <= MAX_SECONDS ? Math.round(v * 10) / 10 : undefined)

/** Temps de lecture d'une page : 3 s pour la découvrir plus 0,35 s par mot de ses textes visibles (environ 170 mots par minute), en secondes entières. */
export function suggestedSeconds(page: Pick<TramePage, 'elements'>): number {
  let words = 0
  for (const e of page.elements) if (e.type === 'text' && !e.hidden && e.text) words += e.text.split(/\s+/).filter(Boolean).length
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(3 + words * 0.35)))
}
