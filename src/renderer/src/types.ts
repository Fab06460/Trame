export type ElementType = 'rect' | 'ellipse' | 'text' | 'image' | 'path'

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
  fill: string
  // rect
  cornerRadius?: number
  // text
  text?: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: string // 'normal' | 'bold' | 'italic' | 'italic bold'
  align?: 'left' | 'center' | 'right'
  // path : chemin SVG (viewBox 100×100)
  path?: string
  // image
  src?: string
}

export interface TramePage {
  id: string
  background: string
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
