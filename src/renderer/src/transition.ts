/**
 * Transition entre deux pages en mode présentation. Réglage du document (par défaut) que chaque page peut remplacer par la sienne :
 * celle d'une page est jouée quand on ARRIVE sur elle (comme PowerPoint) ; en reculant, c'est celle de la page quittée qui est rejouée à l'envers.
 */
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

/** Ce qu'il faut du document pour choisir une transition. */
interface Transitions {
  transition?: PageTransition
  pages: Array<{ transition?: PageTransition }>
}

/** Transition effective d'une page : la sienne, sinon celle du document, sinon le fondu. */
export const pageTransition = (doc: Transitions, index: number): PageTransition => doc.pages[index]?.transition ?? doc.transition ?? DEFAULT_TRANSITION

/**
 * Transition à jouer pour passer de la page `from` (null : première apparition) à la page `to`. En avançant : celle de la page d'arrivée ;
 * en reculant : celle de la page quittée, jouée dans l'autre sens.
 */
export const transitionBetween = (doc: Transitions, from: number | null, to: number): PageTransition => (from !== null && to < from ? pageTransition(doc, from) : pageTransition(doc, to))

/** Transition d'une page lue dans un fichier : tout ce qui n'est pas une transition connue est ignoré (la page hérite du document). Le fondu reste écrit : il peut différer du réglage du document. */
export const cleanPageTransition = (v: unknown): PageTransition | undefined => (isTransition(v) ? v : undefined)
