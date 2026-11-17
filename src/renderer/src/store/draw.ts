import { create } from 'zustand'
import { TOOL_DEFAULTS, WIDTH_LIMITS, type DrawTool, type ToolSettings } from '@/drawTools'
import type { LineEnds } from '@/types'

/**
 * Outil de dessin actif (crayon, surligneur, ligne, flèche) et réglages de chacun. État d'affichage : ni sauvegardé dans le document, ni
 * dans l'historique ; seuls les tracés posés y entrent (un pas d'historique chacun). `tool` nul = pas de dessin, le canvas sélectionne.
 */
interface DrawState {
  tool: DrawTool | null
  /** position de la barre (pixels, depuis le coin haut gauche de la zone de la page) quand on l'a déplacée ; nul = au centre, en haut */
  bar: { x: number; y: number } | null
  setBar: (bar: { x: number; y: number } | null) => void
  settings: Record<DrawTool, ToolSettings>
  setTool: (tool: DrawTool | null) => void
  setColor: (tool: DrawTool, color: string) => void
  setWidth: (tool: DrawTool, width: number) => void
  setEnds: (tool: DrawTool, ends: LineEnds | undefined) => void
}

const BAR_KEY = 'trame.drawBar'
/** Dernière position de la barre, gardée d'une session à l'autre (confort : sans stockage, la barre reste au centre). */
function savedBar(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(BAR_KEY) ?? 'null') as { x?: unknown; y?: unknown } | null
    return v && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null
  } catch {
    return null
  }
}

export const useDraw = create<DrawState>((set) => ({
  tool: null,
  bar: savedBar(),
  setBar: (bar) => {
    try {
      if (bar) localStorage.setItem(BAR_KEY, JSON.stringify(bar))
      else localStorage.removeItem(BAR_KEY)
    } catch {
      /* stockage indisponible : la position ne dure que pour la session */
    }
    set({ bar })
  },
  settings: { ...TOOL_DEFAULTS },
  setTool: (tool) => set({ tool }),
  setColor: (tool, color) => set((s) => ({ settings: { ...s.settings, [tool]: { ...s.settings[tool], color } } })),
  setWidth: (tool, width) =>
    set((s) => ({ settings: { ...s.settings, [tool]: { ...s.settings[tool], width: Math.min(WIDTH_LIMITS.max, Math.max(WIDTH_LIMITS.min, Math.round(width))) } } })),
  setEnds: (tool, ends) => set((s) => ({ settings: { ...s.settings, [tool]: { ...s.settings[tool], ends } } }))
}))
