import type { LineEnds } from '@/types'

export type DrawTool = 'pencil' | 'highlighter' | 'line' | 'arrow' | 'pen'
export const DRAW_TOOLS: readonly DrawTool[] = ['pencil', 'highlighter', 'line', 'arrow', 'pen']

export interface ToolSettings {
  color: string
  /** épaisseur du trait, en pixels de design */
  width: number
  /** opacité de l'élément posé */
  opacity: number
  /** extrémités des lignes posées */
  ends?: LineEnds
  /** plume : une forme fermée est remplie de la couleur du trait (sinon, seul son contour est tracé) */
  fill?: boolean
}

/** Réglages de départ de chaque outil : le surligneur est large, jaune et translucide ; la flèche a sa pointe au bout. */
export const TOOL_DEFAULTS: Record<DrawTool, ToolSettings> = {
  pencil: { color: '#1f2937', width: 4, opacity: 1 },
  highlighter: { color: '#facc15', width: 26, opacity: 0.45 },
  line: { color: '#1f2937', width: 4, opacity: 1 },
  arrow: { color: '#1f2937', width: 4, opacity: 1, ends: { end: 'arrow' } },
  pen: { color: '#1f2937', width: 4, opacity: 1 }
}

export const WIDTH_LIMITS = { min: 1, max: 100 }
/** Un outil qui trace une ligne droite plutôt qu'à main levée. */
export const isLineTool = (t: DrawTool): boolean => t === 'line' || t === 'arrow'
