export type ElementType = 'rect' | 'ellipse' | 'text' | 'image' | 'path'

/** Dégradé à deux couleurs. `angle` : degrés CSS (0 = vers le haut, 90 = vers la droite, 180 = vers le bas), ignoré en radial. */
export interface Gradient {
  type: 'linear' | 'radial'
  from: string
  to: string
  angle: number
}

export interface TrameElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  /** Les éléments partageant un groupId se sélectionnent et se déplacent ensemble. */
  groupId?: string
  /** nom du calque dans le panneau Calques (absent = nom automatique) */
  name?: string
  /** position verrouillée : l'élément ne se déplace, ne se redimensionne, ne pivote et ne se supprime plus */
  locked?: boolean
  /** masqué : ni affiché, ni exporté, ni sélectionnable sur le canvas */
  hidden?: boolean
  fill: string
  /** dégradé de remplissage (rectangle, ellipse, forme) : remplace `fill` tant qu'il est présent */
  gradient?: Gradient
  /** couleur du contour (absent = pas de contour) */
  stroke?: string
  /** épaisseur du contour en pixels de design, centré sur le bord de l'élément (absent ou 0 = pas de contour) */
  strokeWidth?: number
  /** contour en tirets */
  strokeDashed?: boolean
  // rect
  cornerRadius?: number
  // text
  text?: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: string // 'normal' | 'bold' | 'italic' | 'italic bold'
  align?: 'left' | 'center' | 'right'
  /** espacement supplémentaire entre les lettres, en pixels de design (0 = normal) */
  letterSpacing?: number
  /** interligne, en multiple de la taille de police (1 = serré, défaut) */
  lineHeight?: number
  underline?: boolean
  strike?: boolean
  /** affichage en majuscules ; le texte saisi reste tel quel */
  uppercase?: boolean
  // path : chemin SVG (viewBox 100×100)
  path?: string
  // image
  src?: string
}

/** Repère d'alignement posé par l'utilisateur : `v` = ligne verticale à x = position, `h` = ligne horizontale à y = position (pixels de design). */
export interface Guide {
  orientation: 'h' | 'v'
  position: number
}

export interface TramePage {
  id: string
  background: string
  /** repères de la page (absents = aucun) ; jamais dessinés dans les exports */
  guides?: Guide[]
  elements: TrameElement[] // ordre = z-index croissant
}

export interface TrameDocument {
  version: 2
  name: string
  width: number
  height: number
  pages: TramePage[]
}

declare global {
  interface Window {
    trame: import('../../preload').TrameApi
  }
}
