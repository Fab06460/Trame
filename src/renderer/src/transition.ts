/** Transition entre deux pages en mode présentation : réglage du document, appliquée à l'arrivée sur chaque page. */
export type PageTransition = 'none' | 'fade' | 'slide' | 'cover' | 'zoom'

export const TRANSITIONS: { id: PageTransition; label: string }[] = [
  { id: 'none', label: 'Aucune' },
  { id: 'fade', label: 'Fondu' },
  { id: 'slide', label: 'Glissement' },
  { id: 'cover', label: 'Recouvrement' },
  { id: 'zoom', label: 'Zoom' }
]

/** Valeur d'un document qui n'en précise pas (c'est le comportement d'origine du mode présentation). */
export const DEFAULT_TRANSITION: PageTransition = 'fade'

/** Durée de l'animation, en millisecondes (la même que dans styles.css). */
export const TRANSITION_MS = 450

export const isTransition = (v: unknown): v is PageTransition => TRANSITIONS.some((t) => t.id === v)

/** Valeur lue dans un fichier : inconnue ou invalide = absente (donc le fondu par défaut). */
export const cleanTransition = (v: unknown): PageTransition | undefined => (isTransition(v) && v !== DEFAULT_TRANSITION ? v : undefined)

/**
 * Sens du mouvement : +1 en avançant, −1 en reculant. Le passage de la dernière page à la première (lecture automatique en boucle)
 * est une avancée.
 */
export function transitionDirection(from: number, to: number, pages: number, loop: boolean): 1 | -1 {
  if (loop && from === pages - 1 && to === 0) return 1
  return to >= from ? 1 : -1
}
