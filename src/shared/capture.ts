/** Une source d'écran proposée à la capture : un écran entier ou une fenêtre, avec sa vignette (adresse de données). */
export interface CaptureSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumb: string
}

/** Pourquoi une capture n'a pas pu se faire : `denied` quand le système refuse l'accès à l'écran (macOS : Réglages Système → Confidentialité). */
export type CaptureError = 'denied' | 'failed' | 'cancelled'

/** Une image fixe de l'écran, en PNG, à sa taille réelle. */
export interface CaptureStill {
  dataUrl: string
  width: number
  height: number
}

/** Position d'un clic dans l'écran enregistré, en fractions de sa largeur et de sa hauteur (0 à 1). */
export interface ClickPoint {
  fx: number
  fy: number
}

/** Rectangle d'un écran, dans le repère du système (points pour le bureau). */
export interface ScreenBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Fraction de l'écran désignée par un point du bureau ; `null` si le point est hors de cet écran (un clic sur un autre écran ne compte pas). */
export function clickFraction(point: { x: number; y: number }, bounds: ScreenBounds): ClickPoint | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null
  const fx = (point.x - bounds.x) / bounds.width
  const fy = (point.y - bounds.y) / bounds.height
  return fx < 0 || fx > 1 || fy < 0 || fy > 1 ? null : { fx, fy }
}

/** Deux clics plus proches que cela (un double-clic) ne font qu'une étape de tutoriel. */
export const CLICK_MIN_GAP_MS = 700
/** Nombre d'étapes d'un tutoriel : au-delà, la suite est laissée de côté (le document reste léger). */
export const TUTORIAL_MAX_STEPS = 60

/** Pourquoi les clics ne peuvent pas être suivis : `window` (seul un écran entier se suit), `portal` (Linux Wayland, le système l'interdit), `denied` (autorisation macOS manquante), `failed`. */
export type ClickTrackProblem = 'window' | 'portal' | 'denied' | 'failed'
