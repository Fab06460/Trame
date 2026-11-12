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
